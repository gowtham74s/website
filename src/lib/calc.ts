// Pure, framework-free calculations. Everything the app reports is derived here from logged rows,
// so it is unit-tested (see __tests__/calc.test.ts) and never relies on hardcoded numbers.
import type {
  ActivityLog, CalendarEvent, Food, Habit, HabitLog, HydrationLog, Macros, NutritionLog, Profile, Program,
  RecoveryLog, ScoreKey, SleepLog, Workout, WorkoutPlan, WorkoutSet, MealItem,
} from "./types";

// ---------------------------------------------------------------- dates (local time, yyyy-mm-dd keys)
export const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k: string) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (k: string, n: number) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
export const diffDays = (a: string, b: string) => Math.round((parseKey(a).getTime() - parseKey(b).getTime()) / 86400000);
export const weekday = (k: string) => parseKey(k).getDay();
export const rangeKeys = (from: string, to: string) => { const out: string[] = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; };
export const startOfWeekKey = (k: string, weekStartsOn = 1) => { const wd = weekday(k); return addDays(k, -((wd - weekStartsOn + 7) % 7)); };

// ---------------------------------------------------------------- nutrition
export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Scale a food's per-serving macros to an arbitrary quantity expressed in the food's serving unit. */
export function scaleFood(food: Pick<Food, keyof Macros | "serving_size">, quantity: number): Macros {
  const f = food.serving_size > 0 ? quantity / food.serving_size : 0;
  return {
    calories: Math.round(food.calories * f), protein: round1(food.protein * f), carbs: round1(food.carbs * f),
    fat: round1(food.fat * f), fiber: round1(food.fiber * f),
  };
}

export function sumMacros(rows: Partial<Macros>[]): Macros {
  const t = rows.reduce<Macros>((a, r) => ({
    calories: a.calories + (Number(r.calories) || 0), protein: a.protein + (Number(r.protein) || 0),
    carbs: a.carbs + (Number(r.carbs) || 0), fat: a.fat + (Number(r.fat) || 0), fiber: a.fiber + (Number(r.fiber) || 0),
  }), { ...ZERO });
  return { calories: Math.round(t.calories), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat), fiber: round1(t.fiber) };
}

/** Recipe nutrition: total of all ingredients, and per serving. */
export function recipeNutrition(ingredients: { quantity: number; food: Food | undefined }[], servings: number) {
  const total = sumMacros(ingredients.filter((i) => i.food).map((i) => scaleFood(i.food!, i.quantity)));
  const s = servings > 0 ? servings : 1;
  const perServing = sumMacros([{ calories: total.calories / s, protein: total.protein / s, carbs: total.carbs / s, fat: total.fat / s, fiber: total.fiber / s }]);
  return { total, perServing };
}

export const mealItemsTotal = (items: MealItem[]) => sumMacros(items);

export interface Targets { calories: number; protein: number; carbs: number; fat: number; fiber: number; water: number; walkKm: number; sleepH: number }

/** Day-type aware targets: rest days apply the profile's calorie delta (carbs absorb the change). */
export function dailyTargets(p: Profile, isTrainingDay: boolean): Targets {
  const delta = isTrainingDay ? 0 : p.rest_day_calorie_delta || 0;
  return {
    calories: p.calorie_target + delta, protein: p.protein_target,
    carbs: Math.max(0, Math.round(p.carbs_target + delta / 4)), fat: p.fat_target, fiber: p.fiber_target,
    water: p.water_target_ml, walkKm: Number(p.walk_target_km), sleepH: Number(p.sleep_target_hours),
  };
}

export const remaining = (target: number, consumed: number) => Math.max(0, Math.round((target - consumed) * 10) / 10);
export const pct = (v: number, t: number) => (t > 0 ? Math.min(100, Math.round((v / t) * 100)) : 0);

// ---------------------------------------------------------------- activity
export const STEP_KM = 0.000762; // average stride ≈ 0.76 m
/** Walking distance for the day: logged km, or estimated from steps when only steps were logged. */
export function walkDistance(rows: ActivityLog[]) {
  // When a Samsung daily step total exists for the day it already covers that day's walks,
  // so the individual Samsung workout rows are not added on top.
  const hasDaily = rows.some((r) => r.source === "samsung");
  return round1(rows.filter((r) => ["walk", "run", "hike"].includes(r.type) && !(hasDaily && r.source === "samsung_workout"))
    .reduce((a, r) => a + (Number(r.distance_km) > 0 ? Number(r.distance_km) : (r.steps || 0) * STEP_KM), 0) * 10) / 10;
}
export const totalSteps = (rows: ActivityLog[]) => rows.reduce((a, r) => a + (r.steps || 0), 0);

// ---------------------------------------------------------------- sleep / recovery
export function sleepMinutes(bedtimeISO: string, wakeISO: string) {
  let m = Math.round((new Date(wakeISO).getTime() - new Date(bedtimeISO).getTime()) / 60000);
  if (m < 0) m += 24 * 60;
  return m;
}

/** Sleep consistency: 100 when bedtimes are identical, falls with the std-dev of bedtime (minutes). */
export function sleepConsistency(logs: SleepLog[]) {
  if (logs.length < 2) return null;
  const mins = logs.map((l) => { const d = new Date(l.bedtime); let m = d.getHours() * 60 + d.getMinutes(); if (m < 12 * 60) m += 24 * 60; return m; });
  const mean = mins.reduce((a, b) => a + b, 0) / mins.length;
  const sd = Math.sqrt(mins.reduce((a, b) => a + (b - mean) ** 2, 0) / mins.length);
  return Math.max(0, Math.round(100 - sd * (100 / 120))); // 2h std-dev → 0
}

export type Readiness = { score: number; status: "normal" | "lighter" | "recovery"; label: string; advice: string };
/** Non-medical readiness heuristic from a check-in plus last night's sleep. */
export function readiness(r: RecoveryLog | undefined, sleepH: number | null, sleepTargetH: number): Readiness | null {
  if (!r) return null;
  const parts: number[] = [];
  if (r.energy != null) parts.push(r.energy);
  if (r.motivation != null) parts.push(r.motivation);
  if (r.soreness != null) parts.push(11 - r.soreness);
  if (r.stress != null) parts.push(11 - r.stress);
  if (r.fatigue != null) parts.push(11 - r.fatigue);
  if (!parts.length) return null;
  let score = (parts.reduce((a, b) => a + b, 0) / parts.length) * 10;
  if (sleepH != null && sleepTargetH > 0) score = score * 0.75 + Math.min(1, sleepH / sleepTargetH) * 100 * 0.25;
  score = Math.round(score);
  if (score >= 70) return { score, status: "normal", label: "Ready to train", advice: "Train as planned. Push your top sets if they feel good." };
  if (score >= 50) return { score, status: "lighter", label: "Train lighter", advice: "Keep the session but drop a set per exercise or reduce load ~10%. Prioritise technique." };
  return { score, status: "recovery", label: "Recovery day", advice: "Consider a walk, mobility or full rest today. This is guidance, not medical advice — if you feel unwell, consult a professional." };
}

// ---------------------------------------------------------------- workouts
export const epley = (w: number, reps: number) => (reps <= 1 ? w : w * (1 + reps / 30));
export const setVolume = (s: Pick<WorkoutSet, "weight" | "reps" | "completed">) => (s.completed ? (Number(s.weight) || 0) * (s.reps || 0) : 0);

/** A set is a PR if it beats the best previous weight or the best previous estimated 1RM for that exercise. */
export function isPersonalRecord(set: { weight: number; reps: number }, history: { weight: number; reps: number | null }[]) {
  if (!set.reps || set.weight <= 0) return false;
  const prev = history.filter((h) => (h.reps || 0) > 0);
  if (!prev.length) return false; // first ever session is a baseline, not a PR
  const bestW = Math.max(...prev.map((h) => Number(h.weight)));
  const best1 = Math.max(...prev.map((h) => epley(Number(h.weight), h.reps || 0)));
  return set.weight > bestW || epley(set.weight, set.reps) > best1 + 0.01;
}

const LOWER = new Set(["quads", "hamstrings", "glutes", "calves", "back"]);
export type Overload = { action: "increase" | "reps" | "hold" | "none"; weight: number; reps: number; reason: string };
/**
 * Progressive-overload suggestion from the last recorded sessions of one exercise.
 * sessions: newest first, each the list of completed working sets.
 */
export function suggestOverload(sessions: { weight: number; reps: number | null }[][], targetReps: number, muscle: string | null, lowReadiness = false): Overload {
  const last = sessions[0]?.filter((s) => (s.reps || 0) > 0);
  if (!last || !last.length) return { action: "none", weight: 0, reps: targetReps, reason: "No history yet — log this exercise once to get suggestions." };
  const topW = Math.max(...last.map((s) => Number(s.weight)));
  const atTop = last.filter((s) => Number(s.weight) === topW);
  const hitAll = atTop.every((s) => (s.reps || 0) >= targetReps);
  if (lowReadiness) return { action: "hold", weight: topW, reps: targetReps, reason: "Readiness is low today — repeat last session's load." };
  if (hitAll) {
    const step = muscle && LOWER.has(muscle) ? 5 : 2.5;
    return { action: "increase", weight: topW + step, reps: targetReps, reason: `You hit ${targetReps}+ reps on every set at ${topW}. Add ${step}.` };
  }
  const prev = sessions[1]?.filter((s) => (s.reps || 0) > 0);
  const lastReps = atTop.reduce((a, s) => a + (s.reps || 0), 0);
  const prevReps = prev?.filter((s) => Number(s.weight) === topW).reduce((a, s) => a + (s.reps || 0), 0) ?? 0;
  if (prev && prevReps > 0 && lastReps < prevReps) return { action: "hold", weight: topW, reps: targetReps, reason: "Reps dropped vs. the session before — hold the weight and recover well." };
  return { action: "reps", weight: topW, reps: targetReps, reason: `Stay at ${topW} and add a rep or two until every set reaches ${targetReps}.` };
}

export function isTrainingDay(p: Profile, plans: WorkoutPlan[], k: string) {
  const wd = weekday(k);
  return plans.some((pl) => !pl.archived && pl.split_type !== "rest" && pl.scheduled_days?.includes(wd)) || (!plans.some((pl) => pl.scheduled_days?.length) && p.workout_days?.includes(wd));
}
export const planForDay = (plans: WorkoutPlan[], k: string) => plans.filter((p) => !p.archived && p.scheduled_days?.includes(weekday(k))).sort((a, b) => a.position - b.position)[0];

// ---------------------------------------------------------------- habits
export function habitScheduled(h: Habit, k: string) {
  if (h.archived) return false;
  if (h.created_at && k < h.created_at.slice(0, 10)) return false;
  return h.frequency === "weekly" ? true : (h.days?.length ? h.days.includes(weekday(k)) : true);
}

/** Current & best streaks. Daily habits: consecutive scheduled days done (today pending doesn't break). Weekly: consecutive weeks meeting target. */
export function habitStreaks(h: Habit, logs: HabitLog[], today: string) {
  const done = new Set(logs.filter((l) => l.habit_id === h.id && l.completed).map((l) => l.date));
  const created = h.created_at ? h.created_at.slice(0, 10) : [...done].sort()[0] ?? today;
  let current = 0, best = 0, run = 0;
  if (h.frequency === "weekly") {
    const weeks: string[] = [];
    for (let w = startOfWeekKey(created); w <= today; w = addDays(w, 7)) weeks.push(w);
    const met = weeks.map((w) => rangeKeys(w, addDays(w, 6)).filter((k) => done.has(k)).length >= h.target_per_week);
    met.forEach((m) => { run = m ? run + 1 : 0; best = Math.max(best, run); });
    // current: count back from last week; this week counts if already met
    current = 0;
    for (let i = met.length - 1; i >= 0; i--) { if (met[i]) current++; else if (i === met.length - 1) continue; else break; }
    return { current, best };
  }
  const days = rangeKeys(created < today ? created : today, today).filter((k) => habitScheduled({ ...h, created_at: undefined }, k));
  days.forEach((k) => { run = done.has(k) ? run + 1 : 0; best = Math.max(best, run); });
  for (let i = days.length - 1; i >= 0; i--) {
    if (done.has(days[i])) current++;
    else if (days[i] === today) continue;
    else break;
  }
  return { current, best };
}

export function habitCompletionRate(h: Habit, logs: HabitLog[], from: string, to: string) {
  const done = new Set(logs.filter((l) => l.habit_id === h.id && l.completed).map((l) => l.date));
  const sched = rangeKeys(from, to).filter((k) => habitScheduled(h, k));
  if (h.frequency === "weekly") {
    const weeks = Math.max(1, Math.ceil(sched.length / 7));
    return Math.min(100, Math.round((sched.filter((k) => done.has(k)).length / (weeks * h.target_per_week)) * 100));
  }
  return sched.length ? Math.round((sched.filter((k) => done.has(k)).length / sched.length) * 100) : 0;
}

// ---------------------------------------------------------------- weight trends
/** Trailing N-day rolling mean of weights (by calendar days, not by entry count). */
export function rollingAverage(points: { date: string; value: number }[], windowDays = 7) {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = addDays(p.date, -(windowDays - 1));
    const win = sorted.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: p.value, avg: Math.round((win.reduce((a, q) => a + q.value, 0) / win.length) * 100) / 100 };
  });
}

/** Least-squares slope in units per week — the honest "trend" number. */
export function trendPerWeek(points: { date: string; value: number }[]) {
  if (points.length < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => diffDays(p.date, x0)), ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (den === 0) return null;
  return Math.round((xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den) * 7 * 100) / 100;
}

// ---------------------------------------------------------------- daily score
export interface DayData {
  nutrition: NutritionLog[]; hydration: HydrationLog[]; activity: ActivityLog[]; sleep: SleepLog | undefined;
  workouts: Workout[]; habits: Habit[]; habitLogs: HabitLog[];
}
export interface ScorePart { key: ScoreKey; label: string; value: number; achieved: boolean; applicable: boolean; detail: string; weight: number }

const DEFAULT_WEIGHTS: Record<ScoreKey, number> = { workout: 20, nutrition: 15, protein: 15, water: 15, walk: 10, sleep: 15, habits: 10 };

export function calorieScore(consumed: number, target: number) {
  if (target <= 0) return 0;
  const r = consumed / target;
  if (r <= 1.1) return Math.min(1, r / 0.9);
  return Math.max(0, 1 - (r - 1.1) * 3);
}

export function dayScore(p: Profile, k: string, d: DayData, trainingDay: boolean) {
  const t = dailyTargets(p, trainingDay);
  const w = { ...DEFAULT_WEIGHTS, ...(p.score_weights || {}) };
  const n = sumMacros(d.nutrition);
  const water = d.hydration.reduce((a, h) => a + h.amount_ml, 0);
  const walk = walkDistance(d.activity);
  const sleepH = d.sleep ? d.sleep.duration_min / 60 : 0;
  const workoutDone = d.workouts.some((x) => x.status === "completed");
  const sched = d.habits.filter((h) => h.frequency === "daily" && habitScheduled(h, k));
  const doneH = sched.filter((h) => d.habitLogs.some((l) => l.habit_id === h.id && l.date === k && l.completed)).length;
  const calR = t.calories ? n.calories / t.calories : 0;
  const parts: ScorePart[] = [
    { key: "workout", label: "Workout", value: workoutDone ? 1 : 0, achieved: workoutDone, applicable: trainingDay || workoutDone, detail: workoutDone ? "Completed" : trainingDay ? "Not done yet" : "Rest day", weight: w.workout },
    { key: "nutrition", label: "Calories", value: calorieScore(n.calories, t.calories), achieved: calR >= 0.9 && calR <= 1.1, applicable: true, detail: `${n.calories} / ${t.calories} kcal`, weight: w.nutrition },
    { key: "protein", label: "Protein", value: Math.min(1, t.protein ? n.protein / t.protein : 0), achieved: n.protein >= t.protein, applicable: true, detail: `${n.protein} / ${t.protein} g`, weight: w.protein },
    { key: "water", label: "Water", value: Math.min(1, t.water ? water / t.water : 0), achieved: water >= t.water, applicable: true, detail: `${(water / 1000).toFixed(2)} / ${(t.water / 1000).toFixed(1)} L`, weight: w.water },
    { key: "walk", label: "Walking", value: Math.min(1, t.walkKm ? walk / t.walkKm : 0), achieved: walk >= t.walkKm, applicable: t.walkKm > 0, detail: `${walk} / ${t.walkKm} km`, weight: w.walk },
    { key: "sleep", label: "Sleep", value: Math.min(1, t.sleepH ? sleepH / t.sleepH : 0), achieved: sleepH >= t.sleepH - 0.25, applicable: true, detail: d.sleep ? `${sleepH.toFixed(1)} / ${t.sleepH} h` : "Not logged", weight: w.sleep },
    { key: "habits", label: "Habits", value: sched.length ? doneH / sched.length : 0, achieved: sched.length > 0 && doneH === sched.length, applicable: sched.length > 0, detail: `${doneH} / ${sched.length} done`, weight: w.habits },
  ];
  const app = parts.filter((x) => x.applicable && x.weight > 0);
  const totalW = app.reduce((a, x) => a + x.weight, 0);
  const score = totalW ? Math.round((app.reduce((a, x) => a + x.value * x.weight, 0) / totalW) * 100) : 0;
  return { score, parts, totals: { ...n, water, walk, sleepH }, targets: t };
}

// ---------------------------------------------------------------- transformation program
export function programDay(prog: Program, today: string) {
  const ref = prog.status === "paused" && prog.paused_at ? prog.paused_at : today;
  const day = diffDays(ref, prog.start_date) + 1 - (prog.paused_days || 0);
  const clamped = Math.max(0, Math.min(prog.duration_days, day));
  return { day: clamped, remaining: Math.max(0, prog.duration_days - clamped), started: day >= 1, finished: day > prog.duration_days, progress: pct(clamped, prog.duration_days) };
}

/** Which program objectives were met on a day (keys match Program.daily_objectives). */
export function objectivesMet(parts: ScorePart[], objectives: string[]) {
  const map: Record<string, ScoreKey> = { workout: "workout", protein: "protein", calories: "nutrition", water: "water", walk: "walk", sleep: "sleep", habits: "habits" };
  const res = objectives.map((o) => { const p = parts.find((x) => x.key === map[o]); return { key: o, met: p ? (!p.applicable || p.achieved) : false }; });
  return { list: res, all: res.every((r) => r.met), count: res.filter((r) => r.met).length };
}

// ---------------------------------------------------------------- calendar
export interface Occurrence { event: CalendarEvent; date: string; start: Date; end: Date; completed: boolean }

/** Expand recurring events into concrete occurrences within [from, to] (date keys, inclusive). */
export function expandEvents(events: CalendarEvent[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const s = new Date(ev.start_at), e = new Date(ev.end_at);
    const dur = e.getTime() - s.getTime();
    const firstKey = dateKey(s);
    const push = (k: string) => {
      if (ev.recurrence_exceptions?.includes(k)) return;
      const st = parseKey(k); st.setHours(s.getHours(), s.getMinutes(), 0, 0);
      out.push({ event: ev, date: k, start: st, end: new Date(st.getTime() + dur), completed: ev.completed_dates?.includes(k) ?? false });
    };
    if (ev.recurrence === "none") { if (firstKey <= to && dateKey(e) >= from) push(firstKey); continue; }
    const until = ev.recurrence_until && ev.recurrence_until < to ? ev.recurrence_until : to;
    for (let k = firstKey > from ? firstKey : from; k <= until; k = addDays(k, 1)) {
      if (k < firstKey) continue;
      const wd = weekday(k);
      const ok = ev.recurrence === "daily" || (ev.recurrence === "weekdays" && wd >= 1 && wd <= 5)
        || (ev.recurrence === "weekly" && wd === s.getDay()) || (ev.recurrence === "monthly" && parseKey(k).getDate() === s.getDate());
      if (ok) push(k);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Pairs of timed occurrences on the same day that overlap. */
export function findConflicts(occ: Occurrence[]) {
  const timed = occ.filter((o) => !o.event.all_day).sort((a, b) => a.start.getTime() - b.start.getTime());
  const pairs: [Occurrence, Occurrence][] = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length && timed[j].start < timed[i].end; j++)
      if (timed[j].start < timed[i].end && timed[j].end > timed[i].start) pairs.push([timed[i], timed[j]]);
  return pairs;
}

// ---------------------------------------------------------------- generic stats
export const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
export function groupBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  rows.forEach((r) => { const k = key(r); m.set(k, [...(m.get(k) || []), r]); });
  return m;
}
