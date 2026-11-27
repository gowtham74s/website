// Demo mode: realistic sample history, every row flagged is_demo=true so it is clearly labelled in the UI
// and can be removed in one click (Settings → Demo data) without touching real logs.
import { addDays, dateKey, weekday } from "./calc";
import { insertRows, queryClient } from "./data";
import { supabase } from "./supabase";
import { createHabits, createProgram, createSplit, STARTER_HABITS } from "./templates";
import type { PlanExercise, Profile } from "./types";

let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const jitter = (v: number, pct: number) => v * (1 + (rnd() * 2 - 1) * pct);

export async function loadDemoData(p: Profile) {
  seed = 42;
  const today = dateKey();
  const DAYS = 28;
  const start = addDays(today, -DAYS);
  const plans = await createSplit("ppl", { isDemo: true });
  const { data: pe } = await supabase.from("plan_exercises").select("*, exercises(name, muscle_group)").in("plan_id", plans.map((x) => x.id));
  const planEx = (pe || []) as (PlanExercise & { exercises: { name: string; muscle_group: string } })[];
  const baseW: Record<string, number> = { "Barbell Bench Press": 70, "Incline Dumbbell Press": 24, "Overhead Press": 42.5, "Lateral Raise": 9, "Triceps Pushdown": 30, "Overhead Triceps Extension": 22.5, Deadlift: 120, "Pull-up": 0, "Barbell Row": 65, "Face Pull": 25, "Barbell Curl": 30, "Hammer Curl": 14, "Back Squat": 95, "Romanian Deadlift": 80, "Leg Press": 160, "Lying Leg Curl": 40, "Standing Calf Raise": 60, "Hanging Leg Raise": 0 };

  const workouts: Record<string, unknown>[] = [], sets: Record<string, unknown>[] = [], food: Record<string, unknown>[] = [], water: Record<string, unknown>[] = [];
  const act: Record<string, unknown>[] = [], sleep: Record<string, unknown>[] = [], rec: Record<string, unknown>[] = [], body: Record<string, unknown>[] = [];
  let weight = (p.weight_kg || 80) + 2.2;
  for (let i = 0; i <= DAYS; i++) {
    const k = addDays(start, i), wd = weekday(k), isToday = k === today, week = Math.floor(i / 7);
    const plan = plans.find((_, j) => [[1, 4], [2, 5], [3, 6]][j].includes(wd));
    if (plan && !isToday && rnd() > 0.12) {
      const wid = crypto.randomUUID();
      const st = new Date(`${k}T18:05:00`);
      let vol = 0;
      planEx.filter((x) => x.plan_id === plan.id).sort((a, b) => a.position - b.position).forEach((x, order) => {
        const w = (baseW[x.exercises.name] ?? 20) + (baseW[x.exercises.name] ? week * (["quads", "hamstrings", "back"].includes(x.exercises.muscle_group) ? 5 : 2.5) : 0);
        for (let s = 1; s <= x.sets; s++) {
          const reps = Math.max(3, x.reps - (s === x.sets && rnd() > 0.6 ? 1 : 0));
          vol += w * reps;
          sets.push({ workout_id: wid, exercise_id: x.exercise_id, exercise_name: x.exercises.name, muscle_group: x.exercises.muscle_group, exercise_order: order, set_number: s, target_reps: x.reps, reps, weight: w, rest_seconds: x.rest_seconds, completed: true, completed_at: st.toISOString(), is_pr: false, is_demo: true });
        }
      });
      const dur = Math.round(jitter(62, 0.15)) * 60;
      workouts.push({ id: wid, plan_id: plan.id, name: plan.name, date: k, status: "completed", started_at: st.toISOString(), ended_at: new Date(st.getTime() + dur * 1000).toISOString(), duration_seconds: dur, total_volume: Math.round(vol), is_demo: true });
    }
    const frac = isToday ? Math.min(1, new Date().getHours() / 22) : 1;
    const meals: [string, string, number, number, number, number][] = [
      ["breakfast", "Oats, whey & banana", 540, 44, 72, 9], ["lunch", "Chicken, rice & dal", 720, 52, 85, 16], ["snack", "Greek yogurt & almonds", 310, 22, 14, 18], ["dinner", "Paneer tikka & roti", 640, 34, 52, 30],
    ];
    meals.slice(0, Math.max(isToday ? 0 : 3, Math.round(meals.length * frac))).forEach(([c, n, cal, pr, cb, f], j) =>
      food.push({ date: k, meal_category: c, name: n, quantity: 1, unit: "serving", calories: Math.round(jitter(cal, 0.12)), protein: Math.round(jitter(pr, 0.12)), carbs: Math.round(jitter(cb, 0.15)), fat: Math.round(jitter(f, 0.15)), fiber: Math.round(jitter(7, 0.3)), logged_at: new Date(`${k}T${String(8 + j * 4).padStart(2, "0")}:15:00`).toISOString(), is_demo: true }));
    const glasses = Math.round(jitter(12.5, 0.2) * frac);
    for (let g = 0; g < glasses; g++) water.push({ date: k, amount_ml: 250, logged_at: new Date(`${k}T${String(7 + Math.floor((g * 14) / Math.max(1, glasses))).padStart(2, "0")}:${g % 2 ? "40" : "05"}:00`).toISOString(), is_demo: true });
    if (!isToday || frac > 0.6) act.push({ date: k, type: "walk", distance_km: Math.round(jitter(4.1, 0.3) * 10) / 10, duration_min: Math.round(jitter(48, 0.25)), steps: Math.round(jitter(8400, 0.25)), active_calories: Math.round(jitter(230, 0.2)), source: "demo", logged_at: new Date(`${k}T19:30:00`).toISOString(), is_demo: true });
    const bedM = Math.round(jitter(23 * 60 + 20, 0.02)), sleepM = Math.round(jitter(440, 0.1));
    const bed = new Date(`${addDays(k, -1)}T00:00:00`); bed.setMinutes(bedM);
    sleep.push({ date: k, bedtime: bed.toISOString(), wake_time: new Date(bed.getTime() + sleepM * 60000).toISOString(), duration_min: sleepM, quality: Math.max(1, Math.min(5, Math.round(jitter(3.8, 0.25)))), refreshed: Math.max(1, Math.min(5, Math.round(jitter(3.6, 0.3)))), is_demo: true });
    rec.push({ date: k, energy: Math.round(jitter(7, 0.25)), soreness: Math.round(jitter(4, 0.4)), stress: Math.round(jitter(4, 0.4)), motivation: Math.round(jitter(7.5, 0.2)), fatigue: Math.round(jitter(4, 0.4)), is_demo: true });
    weight -= 0.08 + (rnd() - 0.5) * 0.05;
    if (i % 2 === 0 || isToday) body.push({ date: k, weight_kg: Math.round((weight + (rnd() - 0.5) * 0.9) * 10) / 10, waist_cm: i % 7 === 0 ? Math.round((88 - i * 0.08) * 10) / 10 : null, is_demo: true });
  }
  await insertRows("workouts", workouts);
  await insertRows("workout_sets", sets);
  await insertRows("nutrition_logs", food);
  await insertRows("hydration_logs", water);
  await insertRows("activity_logs", act);
  await insertRows("sleep_logs", sleep);
  await insertRows("recovery_logs", rec);
  await insertRows("body_measurements", body);
  const habits = await createHabits(STARTER_HABITS.slice(0, 6).map((h) => h.name), true, new Date(`${start}T00:00:00`).toISOString());
  const hl: Record<string, unknown>[] = [];
  habits.forEach((h) => { for (let i = 0; i < DAYS; i++) if (rnd() > 0.22) hl.push({ habit_id: h.id, date: addDays(start, i), completed: true, is_demo: true }); });
  await insertRows("habit_logs", hl);
  await createProgram("75-Day Transformation (demo)", 75, addDays(today, -20), true);
  const mon = addDays(today, -((weekday(today) + 6) % 7));
  await insertRows("calendar_events", [
    { title: "Work — deep focus", type: "work", start_at: new Date(`${mon}T09:30:00`).toISOString(), end_at: new Date(`${mon}T13:00:00`).toISOString(), recurrence: "weekdays", is_demo: true },
    { title: "Team stand-up", type: "meeting", start_at: new Date(`${mon}T10:00:00`).toISOString(), end_at: new Date(`${mon}T10:20:00`).toISOString(), recurrence: "weekdays", reminder_minutes: 5, is_demo: true },
    { title: "Lunch", type: "meal", start_at: new Date(`${mon}T13:15:00`).toISOString(), end_at: new Date(`${mon}T13:45:00`).toISOString(), recurrence: "daily", is_demo: true },
    { title: "Gym", type: "workout", start_at: new Date(`${mon}T18:00:00`).toISOString(), end_at: new Date(`${mon}T19:15:00`).toISOString(), recurrence: "weekdays", reminder_minutes: 30, is_demo: true },
    { title: "Evening walk", type: "walk", start_at: new Date(`${mon}T19:30:00`).toISOString(), end_at: new Date(`${mon}T20:15:00`).toISOString(), recurrence: "daily", is_demo: true },
  ]);
  queryClient.invalidateQueries();
}
