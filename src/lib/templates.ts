// Starter content the user can opt into (splits, habits, reminders, program). Nothing here is shown as data
// until the user explicitly creates it, and all of it is fully editable afterwards.
import { supabase } from "./supabase";
import { deleteRows, insertRows, queryClient } from "./data";
import type { Exercise, Profile } from "./types";
import { dateKey } from "./calc";

export type SplitKind = "ppl" | "upper_lower" | "full_body" | "bro";

const SPLITS: Record<SplitKind, { name: string; split_type: string; color: string; days: number[]; ex: [string, number, number][] }[]> = {
  ppl: [
    { name: "Push", split_type: "push", color: "#f59e0b", days: [1, 4], ex: [["Barbell Bench Press", 4, 6], ["Incline Dumbbell Press", 3, 10], ["Overhead Press", 3, 8], ["Lateral Raise", 4, 15], ["Triceps Pushdown", 3, 12], ["Overhead Triceps Extension", 3, 12]] },
    { name: "Pull", split_type: "pull", color: "#60a5fa", days: [2, 5], ex: [["Deadlift", 3, 5], ["Pull-up", 3, 8], ["Barbell Row", 3, 8], ["Face Pull", 3, 15], ["Barbell Curl", 3, 10], ["Hammer Curl", 3, 12]] },
    { name: "Legs", split_type: "legs", color: "#10b981", days: [3, 6], ex: [["Back Squat", 4, 6], ["Romanian Deadlift", 3, 8], ["Leg Press", 3, 12], ["Lying Leg Curl", 3, 12], ["Standing Calf Raise", 4, 12], ["Hanging Leg Raise", 3, 12]] },
  ],
  upper_lower: [
    { name: "Upper A", split_type: "upper", color: "#f59e0b", days: [1], ex: [["Barbell Bench Press", 4, 6], ["Barbell Row", 4, 8], ["Overhead Press", 3, 8], ["Lat Pulldown", 3, 10], ["Lateral Raise", 3, 15], ["Barbell Curl", 3, 10]] },
    { name: "Lower A", split_type: "lower", color: "#10b981", days: [2], ex: [["Back Squat", 4, 6], ["Romanian Deadlift", 3, 8], ["Leg Extension", 3, 15], ["Lying Leg Curl", 3, 12], ["Standing Calf Raise", 4, 12]] },
    { name: "Upper B", split_type: "upper", color: "#a78bfa", days: [4], ex: [["Incline Dumbbell Press", 4, 10], ["Pull-up", 4, 8], ["Dumbbell Shoulder Press", 3, 10], ["Seated Cable Row", 3, 12], ["Triceps Pushdown", 3, 12], ["Hammer Curl", 3, 12]] },
    { name: "Lower B", split_type: "lower", color: "#22d3ee", days: [5], ex: [["Deadlift", 3, 5], ["Bulgarian Split Squat", 3, 10], ["Leg Press", 3, 12], ["Seated Leg Curl", 3, 12], ["Plank", 3, 60]] },
  ],
  full_body: [
    { name: "Full Body A", split_type: "full_body", color: "#f59e0b", days: [1], ex: [["Back Squat", 3, 6], ["Barbell Bench Press", 3, 8], ["Barbell Row", 3, 8], ["Lateral Raise", 3, 15], ["Plank", 3, 45]] },
    { name: "Full Body B", split_type: "full_body", color: "#10b981", days: [3], ex: [["Deadlift", 3, 5], ["Overhead Press", 3, 8], ["Pull-up", 3, 8], ["Walking Lunge", 3, 12], ["Hammer Curl", 3, 12]] },
    { name: "Full Body C", split_type: "full_body", color: "#60a5fa", days: [5], ex: [["Front Squat", 3, 6], ["Incline Dumbbell Press", 3, 10], ["Seated Cable Row", 3, 12], ["Romanian Deadlift", 3, 8], ["Triceps Pushdown", 3, 12]] },
  ],
  bro: [
    { name: "Chest & Back", split_type: "chest_back", color: "#f59e0b", days: [1], ex: [["Barbell Bench Press", 4, 8], ["Barbell Row", 4, 8], ["Incline Dumbbell Press", 3, 10], ["Lat Pulldown", 3, 10], ["Cable Fly", 3, 12]] },
    { name: "Legs", split_type: "legs", color: "#10b981", days: [2], ex: [["Back Squat", 4, 6], ["Leg Press", 3, 12], ["Romanian Deadlift", 3, 8], ["Leg Extension", 3, 15], ["Standing Calf Raise", 4, 12]] },
    { name: "Shoulders", split_type: "shoulders", color: "#a78bfa", days: [4], ex: [["Overhead Press", 4, 6], ["Lateral Raise", 4, 15], ["Reverse Fly", 3, 15], ["Face Pull", 3, 15], ["Shrug", 3, 12]] },
    { name: "Arms", split_type: "arms", color: "#22d3ee", days: [5], ex: [["Close-grip Bench Press", 3, 8], ["Barbell Curl", 3, 10], ["Skull Crusher", 3, 10], ["Incline Dumbbell Curl", 3, 12], ["Triceps Pushdown", 3, 12], ["Hammer Curl", 3, 12]] },
  ],
};

async function libraryByName() {
  const { data, error } = await supabase.from("exercises").select("*").limit(1000);
  if (error) throw error;
  return new Map((data as Exercise[]).map((e) => [e.name, e]));
}

export async function createSplit(kind: SplitKind, opts: { isDemo?: boolean } = {}) {
  const lib = await libraryByName();
  const plans = SPLITS[kind];
  const created: { id: string; name: string }[] = [];
  for (const [i, p] of plans.entries()) {
    const [plan] = await insertRows("workout_plans", { name: p.name, split_type: p.split_type, color: p.color, scheduled_days: p.days, position: i, estimated_minutes: 60, is_demo: !!opts.isDemo });
    const rows = p.ex.map(([n, sets, reps], j) => { const e = lib.get(n); return e ? { plan_id: plan.id, exercise_id: e.id, position: j, sets, reps, weight: 0, rest_seconds: e.default_rest_seconds, is_demo: !!opts.isDemo } : null; }).filter(Boolean) as Record<string, unknown>[];
    if (rows.length) await insertRows("plan_exercises", rows);
    created.push({ id: plan.id as string, name: p.name });
  }
  return created;
}

export const STARTER_HABITS = [
  { name: "Workout", auto_metric: "workout", color: "#f59e0b" },
  { name: "Hit protein target", auto_metric: "protein", color: "#10b981" },
  { name: "Drink water target", auto_metric: "water", color: "#22d3ee" },
  { name: "Walk target distance", auto_metric: "walk", color: "#60a5fa" },
  { name: "Sleep on time", auto_metric: null, color: "#a78bfa" },
  { name: "Eat according to plan", auto_metric: null, color: "#10b981" },
  { name: "Read 10 pages", auto_metric: null, color: "#f472b6" },
  { name: "No junk food", auto_metric: null, color: "#ef4444" },
  { name: "No unnecessary scrolling", auto_metric: null, color: "#9a9ca3" },
];

export const createHabits = (names: string[], isDemo = false, createdAt?: string) =>
  insertRows("habits", STARTER_HABITS.filter((h) => names.includes(h.name)).map((h, i) => ({ ...h, position: i, is_demo: isDemo, ...(createdAt && { created_at: createdAt }) })));

export function defaultReminders(p: Pick<Profile, "preferred_workout_time" | "bedtime_target">) {
  const minus = (t: string, m: number) => { const [h, mm] = t.split(":").map(Number); const x = (h * 60 + mm - m + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };
  return [
    { type: "wake", label: "Good morning — start with water", time: "07:00", enabled: false },
    { type: "water", label: "Hydration check", interval_minutes: 120, window_start: "08:00", window_end: "21:00", enabled: true },
    { type: "preworkout", label: "Pre-workout meal", time: minus(p.preferred_workout_time || "18:00", 90), enabled: false },
    { type: "workout", label: "Workout time", time: (p.preferred_workout_time || "18:00").slice(0, 5), enabled: true },
    { type: "walk", label: "Get your walk in", time: "17:30", enabled: false },
    { type: "protein", label: "Protein check — how close are you?", time: "19:30", enabled: false },
    { type: "checkin", label: "Daily recovery check-in", time: "08:30", enabled: true },
    { type: "sleep", label: "Wind down for bed", time: minus(p.bedtime_target || "23:00", 30), enabled: true },
  ];
}

export const createProgram = (name: string, duration: number, start = dateKey(), isDemo = false) =>
  insertRows("transformation_programs", {
    is_demo: isDemo, name, start_date: start, duration_days: duration, status: "active",
    primary_goals: ["Train consistently", "Hit protein daily"], secondary_goals: ["Sleep 7.5h+", "Walk daily"],
    daily_objectives: ["workout", "protein", "calories", "water", "walk", "sleep", "habits"],
    milestones: [7, 14, 30, 45, 60, duration].filter((d, i, a) => d <= duration && a.indexOf(d) === i).map((d) => ({ day: d, title: d === duration ? "Program complete" : `Day ${d}` })),
  });

/** Suggested targets (Mifflin–St Jeor, moderate activity). Shown as editable suggestions, never forced. */
export function suggestTargets(p: { weight_kg: number; height_cm: number; age: number; sex: string; fitness_goal: string; goal_weight_kg?: number | null }) {
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === "female" ? -161 : 5);
  const tdee = bmr * 1.5;
  const adj = { fat_loss: -0.2, recomposition: -0.1, maintenance: 0, muscle_gain: 0.1, endurance: 0 }[p.fitness_goal] ?? 0;
  const calories = Math.round((tdee * (1 + adj)) / 10) * 10;
  const refW = p.fitness_goal === "fat_loss" && p.goal_weight_kg ? Math.max(p.goal_weight_kg, p.weight_kg * 0.85) : p.weight_kg;
  const protein = Math.round(refW * 2.0);
  const fat = Math.round(p.weight_kg * 0.8);
  const carbs = Math.max(50, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calorie_target: calories, protein_target: protein, fat_target: fat, carbs_target: carbs, fiber_target: Math.round((calories / 1000) * 14), water_target_ml: Math.round((p.weight_kg * 35) / 250) * 250, tdee: Math.round(tdee) };
}

const DEMO_TABLES = ["workout_sets", "workouts", "plan_exercises", "workout_plans", "nutrition_logs", "meals", "hydration_logs", "activity_logs", "sleep_logs", "recovery_logs", "habit_logs", "habits", "calendar_events", "body_measurements", "transformation_programs", "goals", "recipes", "meal_plan_entries"] as const;

export async function clearDemoData() {
  for (const t of DEMO_TABLES) await deleteRows(t, { is_demo: true });
  queryClient.invalidateQueries();
}
