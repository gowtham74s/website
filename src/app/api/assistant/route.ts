// AI fitness assistant. Runs server-side only: the Anthropic key never reaches the browser.
// The user's Supabase access token is forwarded so every read/write goes through row-level
// security as that user — the assistant can only see the caller's own data.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase";
import { addDays, dateKey, dayScore, expandEvents, isTrainingDay, readiness, rollingAverage, sumMacros, trendPerWeek, walkDistance } from "@/lib/calc";
import type { ActivityLog, BodyMeasurement, CalendarEvent, Habit, HabitLog, HydrationLog, Meal, NutritionLog, PlanExercise, Profile, Program, RecoveryLog, SleepLog, Workout, WorkoutPlan, WorkoutSet } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM = `You are the AI coach inside "Forge", a personal fitness & lifestyle command center.
You receive a JSON snapshot of the user's REAL logged data (profile targets, nutrition, workouts, sleep, recovery, habits, body measurements, calendar, program). Ground every statement in that data.

Rules:
- Never invent history. If something isn't logged, say it isn't logged rather than guessing. Quote actual numbers.
- No medical diagnoses. For pain, injury, illness or anything clinical, suggest seeing a qualified professional.
- Be concise, specific and practical. Use short paragraphs or tight bullet lists. No hype, no filler.
- Meal ideas should fit the user's remaining macros and dietary preferences, and prefer foods/meals they already log.
- Workout advice must respect their recorded performance and today's readiness.
- When a concrete change would help (calendar event, logging a food, changing a plan exercise's sets/reps/weight, or changing a daily target), add it to "proposals". Proposals are NOT applied automatically — the user confirms each one. Only propose when it's clearly useful; usually 0–3.
- For calendar proposals use ISO 8601 datetimes with the user's UTC offset (given in the snapshot). For plan_exercise_change use exact plan and exercise names from the snapshot.
- Fill unused proposal fields with null.`;

const nullable = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object", additionalProperties: false, required: ["reply", "proposals"],
  properties: {
    reply: { type: "string", description: "Markdown answer to the user" },
    proposals: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["kind", "summary", "title", "event_type", "start_at", "end_at", "notes", "name", "meal_category", "calories", "protein", "carbs", "fat", "fiber", "plan_name", "exercise_name", "sets", "reps", "weight", "field", "value", "reason"],
        properties: {
          kind: { type: "string", enum: ["calendar_event", "log_food", "plan_exercise_change", "target_change"] },
          summary: { type: "string", description: "One line describing the change for the confirm button" },
          title: nullable("string"), event_type: { type: ["string", "null"], enum: ["workout", "meal", "water", "walk", "sleep", "work", "meeting", "personal", "recovery", "study", "other", null] },
          start_at: nullable("string"), end_at: nullable("string"), notes: nullable("string"),
          name: nullable("string"), meal_category: { type: ["string", "null"], enum: ["breakfast", "first_meal", "lunch", "pre_workout", "post_workout", "dinner", "snack", null] },
          calories: nullable("number"), protein: nullable("number"), carbs: nullable("number"), fat: nullable("number"), fiber: nullable("number"),
          plan_name: nullable("string"), exercise_name: nullable("string"), sets: nullable("integer"), reps: nullable("integer"), weight: nullable("number"),
          field: { type: ["string", "null"], enum: ["calorie_target", "protein_target", "carbs_target", "fat_target", "water_target_ml", "walk_target_km", "sleep_target_hours", null] },
          value: nullable("number"), reason: nullable("string"),
        },
      },
    },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function snapshot(db: any, tzOffsetMin: number, clientToday: string) {
  const t = clientToday;
  const from = addDays(t, -27);
  const q = async <T,>(table: string, build: (b: any) => any = (b) => b) => { const { data, error } = await build(db.from(table).select("*")); if (error) throw error; return (data || []) as T[]; };
  const [profileRows, nutrition, hydration, activity, sleep, recovery, workouts, plans, pe, habits, habitLogs, body, events, programs, meals] = await Promise.all([
    q<Profile>("profiles"),
    q<NutritionLog>("nutrition_logs", (b) => b.gte("date", from).order("logged_at")),
    q<HydrationLog>("hydration_logs", (b) => b.gte("date", from)),
    q<ActivityLog>("activity_logs", (b) => b.gte("date", from)),
    q<SleepLog>("sleep_logs", (b) => b.gte("date", from).order("date")),
    q<RecoveryLog>("recovery_logs", (b) => b.gte("date", addDays(t, -13)).order("date")),
    q<Workout>("workouts", (b) => b.gte("date", addDays(t, -41)).order("date")),
    q<WorkoutPlan>("workout_plans", (b) => b.eq("archived", false).order("position")),
    q<PlanExercise & { exercises: { name: string; muscle_group: string } }>("plan_exercises", (b) => b.select("*, exercises(name, muscle_group)").order("position")),
    q<Habit>("habits", (b) => b.eq("archived", false)),
    q<HabitLog>("habit_logs", (b) => b.gte("date", addDays(t, -13))),
    q<BodyMeasurement>("body_measurements", (b) => b.gte("date", addDays(t, -90)).order("date")),
    q<CalendarEvent>("calendar_events", (b) => b.lte("start_at", new Date(Date.now() + 8 * 86400_000).toISOString())),
    q<Program>("transformation_programs", (b) => b.in("status", ["active", "paused"])),
    q<Meal>("meals", (b) => b.order("use_count", { ascending: false }).limit(15)),
  ]);
  const p = profileRows[0];
  if (!p) throw new Error("Profile not found");
  const wIds = workouts.filter((w) => w.status === "completed").map((w) => w.id);
  const sets = wIds.length ? await q<WorkoutSet>("workout_sets", (b) => b.in("workout_id", wIds).eq("completed", true)) : [];
  const days = [];
  for (let k = addDays(t, -13); k <= t; k = addDays(k, 1)) {
    const training = isTrainingDay(p, plans, k);
    const s = dayScore(p, k, { nutrition: nutrition.filter((x) => x.date === k), hydration: hydration.filter((x) => x.date === k), activity: activity.filter((x) => x.date === k), sleep: sleep.find((x) => x.date === k), workouts: workouts.filter((x) => x.date === k), habits, habitLogs: habitLogs.filter((x) => x.date === k) }, training);
    days.push({ date: k, training_day: training, score: s.score, calories: s.totals.calories, protein: s.totals.protein, carbs: s.totals.carbs, fat: s.totals.fat, water_ml: s.totals.water, walk_km: s.totals.walk, sleep_h: Math.round(s.totals.sleepH * 10) / 10, nutrition_logged: nutrition.some((n) => n.date === k), workout_done: s.parts[0].achieved, habits: s.parts.find((x) => x.key === "habits")?.detail });
  }
  const todayLogs = nutrition.filter((n) => n.date === t);
  const tdTargets = dayScore(p, t, { nutrition: todayLogs, hydration: [], activity: [], sleep: undefined, workouts: [], habits: [], habitLogs: [] }, isTrainingDay(p, plans, t)).targets;
  const eaten = sumMacros(todayLogs);
  const weights = body.filter((b) => b.weight_kg != null).map((b) => ({ date: b.date, value: Number(b.weight_kg) }));
  const roll = rollingAverage(weights, 7);
  const occ = expandEvents(events, t, addDays(t, 7)).map((o) => ({ date: o.date, start: o.start.toISOString(), end: o.end.toISOString(), title: o.event.title, type: o.event.type, completed: o.completed }));
  const rec = recovery.find((r) => r.date === t);
  return {
    now_local_date: t, utc_offset_minutes: -tzOffsetMin, timezone: p.timezone,
    profile: { name: p.name, age: p.age, sex: p.sex, height_cm: p.height_cm, weight_kg: p.weight_kg, goal_weight_kg: p.goal_weight_kg, goal: p.fitness_goal, experience: p.experience, workout_days: p.workout_days, preferred_workout_time: p.preferred_workout_time, dietary_prefs: p.dietary_prefs, fasting: p.fasting_enabled ? `${p.eating_window_start}-${p.eating_window_end}` : null, units: { weight: p.unit_weight, volume: p.unit_volume } },
    targets: { calories: p.calorie_target, protein: p.protein_target, carbs: p.carbs_target, fat: p.fat_target, fiber: p.fiber_target, rest_day_calorie_delta: p.rest_day_calorie_delta, water_ml: p.water_target_ml, walk_km: p.walk_target_km, sleep_h: p.sleep_target_hours },
    today: { targets: tdTargets, eaten, remaining: { calories: tdTargets.calories - eaten.calories, protein: Math.round((tdTargets.protein - eaten.protein) * 10) / 10, carbs: tdTargets.carbs - eaten.carbs, fat: tdTargets.fat - eaten.fat }, foods: todayLogs.map((n) => `${n.meal_category}: ${n.name} (${n.quantity} ${n.unit}, ${Math.round(n.calories)} kcal, P${n.protein})`), walk_km: walkDistance(activity.filter((a) => a.date === t)), readiness: readiness(rec, sleep.find((s) => s.date === t) ? sleep.find((s) => s.date === t)!.duration_min / 60 : null, Number(p.sleep_target_hours)) },
    last_14_days: days,
    workouts_last_6_weeks: workouts.map((w) => ({ date: w.date, name: w.name, status: w.status, minutes: w.duration_seconds ? Math.round(w.duration_seconds / 60) : null, volume: Number(w.total_volume), top_sets: Object.values(sets.filter((s) => s.workout_id === w.id).reduce<Record<string, string>>((a, s) => { const cur = a[s.exercise_name]; const v = `${s.exercise_name} ${s.weight}x${s.reps}${s.is_pr ? " (PR)" : ""}`; if (!cur || Number(s.weight) > Number(cur.split(" ").at(-1)?.split("x")[0])) a[s.exercise_name] = v; return a; }, {})) })),
    plans: plans.map((pl) => ({ name: pl.name, type: pl.split_type, days: pl.scheduled_days, exercises: pe.filter((x) => x.plan_id === pl.id).map((x) => `${x.exercises?.name}: ${x.sets}x${x.reps} @ ${x.weight}`) })),
    body: { latest: weights.at(-1) ?? null, rolling_7d_avg: roll.at(-1)?.avg ?? null, trend_kg_per_week_4w: trendPerWeek(weights.filter((w) => w.date >= addDays(t, -27))), entries: body.length },
    sleep_last_14: sleep.filter((s) => s.date >= addDays(t, -13)).map((s) => ({ date: s.date, hours: Math.round((s.duration_min / 60) * 10) / 10, quality: s.quality })),
    recovery_last_7: recovery.filter((r) => r.date >= addDays(t, -6)),
    habits: habits.map((h) => ({ name: h.name, frequency: h.frequency, done_last_14: habitLogs.filter((l) => l.habit_id === h.id && l.completed).length })),
    calendar_next_7_days: occ,
    program: programs[0] ? { name: programs[0].name, start: programs[0].start_date, duration: programs[0].duration_days, status: programs[0].status, objectives: programs[0].daily_objectives } : null,
    saved_meals: meals.map((m) => ({ name: m.name, ...sumMacros(m.items) })),
  };
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: u, error: ue } = await db.auth.getUser(auth.slice(7));
  if (ue || !u.user) return NextResponse.json({ error: "Session expired — sign in again" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").slice(0, 4000).trim();
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  let snap;
  try { snap = await snapshot(db, Number(body.tzOffset) || 0, /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : dateKey()); }
  catch (e) { return NextResponse.json({ error: `Couldn't read your data: ${(e as Error).message}` }, { status: 500 }); }

  const { data: hist } = await db.from("ai_messages").select("role, content").order("created_at", { ascending: false }).limit(16);
  const history = ((hist || []) as { role: "user" | "assistant"; content: string }[]).reverse();
  // the API requires alternating roles starting with user
  const msgs: Anthropic.Beta.BetaMessageParam[] = [];
  for (const h of history) { if (!msgs.length && h.role !== "user") continue; if (msgs.at(-1)?.role === h.role) continue; msgs.push({ role: h.role, content: h.content }); }
  if (msgs.at(-1)?.role === "user") msgs.pop();
  msgs.push({ role: "user", content: `<snapshot>\n${JSON.stringify(snap)}\n</snapshot>\n\n${message}` });

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: msgs,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ reply: "I can't help with that one. For anything medical, please check with a qualified professional.", proposals: [] });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    let parsed: { reply: string; proposals: Record<string, unknown>[] };
    try { parsed = JSON.parse(text); } catch { parsed = { reply: text || "Sorry — I couldn't produce an answer.", proposals: [] }; }
    const proposals = (parsed.proposals || []).map((p) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null)));
    await db.from("ai_messages").insert([{ user_id: u.user.id, role: "user", content: message }, { user_id: u.user.id, role: "assistant", content: parsed.reply, proposals }]);
    return NextResponse.json({ reply: parsed.reply, proposals });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "The assistant is busy — try again in a moment." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "Assistant API key is invalid." }, { status: 500 });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Assistant error (${e.status ?? "network"})` }, { status: 502 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
