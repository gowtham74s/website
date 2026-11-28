"use client";
import { useMemo } from "react";
import { useSession } from "./auth";
import { updateById, useRows } from "./data";
import { addDays, dateKey, dayScore, isTrainingDay, type DayData } from "./calc";
import type {
  HealthDaily,
  ActivityLog, BodyMeasurement, CalendarEvent, Habit, HabitLog, HydrationLog, NutritionLog, Profile, Program,
  RecoveryLog, SleepLog, Workout, WorkoutPlan,
} from "./types";

export const DEFAULT_PROFILE: Omit<Profile, "id"> = {
  name: null, age: null, sex: null, height_cm: null, weight_kg: null, goal_weight_kg: null, fitness_goal: "recomposition",
  experience: "intermediate", workout_days: [1, 2, 3, 4, 5], preferred_workout_time: "18:00", dietary_prefs: [],
  calorie_target: 2200, protein_target: 150, carbs_target: 220, fat_target: 70, fiber_target: 30, rest_day_calorie_delta: -200,
  fasting_enabled: false, eating_window_start: "12:00", eating_window_end: "20:00", water_target_ml: 3000, walk_target_km: 4,
  steps_target: 8000, sleep_target_hours: 8, bedtime_target: "23:00", unit_weight: "kg", unit_length: "cm", unit_volume: "ml",
  timezone: "UTC", theme: "dark", score_weights: { workout: 20, nutrition: 15, protein: 15, water: 15, walk: 10, sleep: 15, habits: 10 },
  notification_settings: { enabled: false, quiet_start: "22:30", quiet_end: "07:00", max_per_hour: 3 }, google_calendar: {}, onboarded: false,
};

export function useProfile() {
  const { session } = useSession();
  const id = session?.user.id;
  const q = useRows<Profile>({ table: "profiles", filters: [["id", "eq", id]] }, !!id);
  const raw = q.rows[0];
  // stay null until the real row arrives, so defaults (e.g. onboarded=false) never drive redirects
  const profile: Profile | null = id && raw ? ({ ...DEFAULT_PROFILE, ...raw, id } as Profile) : null;
  if (profile) {
    // numeric columns arrive as strings from PostgREST
    for (const k of ["height_cm", "weight_kg", "goal_weight_kg", "walk_target_km", "sleep_target_hours"] as const)
      if (profile[k] != null) (profile as unknown as Record<string, number>)[k] = Number(profile[k]);
  }
  return { profile, loading: q.isLoading && !raw, update: (patch: Partial<Profile>) => updateById("profiles", id!, patch as Record<string, unknown>) };
}

export const today = () => dateKey();

/** All the logs needed for scores/analytics in a date range, fetched in parallel and cached. */
export function useRange(from: string, to: string) {
  const r = (table: Parameters<typeof useRows>[0]["table"], col = "date") => ({ table, filters: [[col, "gte", from], [col, "lte", to]] as [string, "gte" | "lte", string][] });
  const nutrition = useRows<NutritionLog>({ ...r("nutrition_logs"), order: [["logged_at", true]] });
  const hydration = useRows<HydrationLog>({ ...r("hydration_logs"), order: [["logged_at", true]] });
  const activity = useRows<ActivityLog>({ ...r("activity_logs"), order: [["logged_at", true]] });
  const sleep = useRows<SleepLog>({ ...r("sleep_logs"), order: [["date", true]] });
  const recovery = useRows<RecoveryLog>({ ...r("recovery_logs"), order: [["date", true]] });
  const workouts = useRows<Workout>({ ...r("workouts"), order: [["started_at", true]] });
  const habitLogs = useRows<HabitLog>(r("habit_logs"));
  const habits = useRows<Habit>({ table: "habits", filters: [["archived", "eq", false]], order: [["position", true]] });
  const plans = useRows<WorkoutPlan>({ table: "workout_plans", order: [["position", true]] });
  const loading = [nutrition, hydration, activity, sleep, workouts, habits].some((x) => x.isLoading && !x.data);
  return {
    loading, nutrition: nutrition.rows, hydration: hydration.rows, activity: activity.rows, sleep: sleep.rows,
    recovery: recovery.rows, workouts: workouts.rows, habitLogs: habitLogs.rows, habits: habits.rows, plans: plans.rows,
  };
}

export type RangeData = ReturnType<typeof useRange>;

export function dayData(d: RangeData, k: string): DayData {
  return {
    nutrition: d.nutrition.filter((x) => x.date === k), hydration: d.hydration.filter((x) => x.date === k),
    activity: d.activity.filter((x) => x.date === k), sleep: d.sleep.find((x) => x.date === k),
    workouts: d.workouts.filter((x) => x.date === k), habits: d.habits, habitLogs: d.habitLogs.filter((x) => x.date === k),
  };
}

export function useScores(profile: Profile | null, d: RangeData, from: string, to: string) {
  return useMemo(() => {
    if (!profile) return [];
    const out: { date: string; score: ReturnType<typeof dayScore>; training: boolean }[] = [];
    for (let k = from; k <= to; k = addDays(k, 1)) {
      const training = isTrainingDay(profile, d.plans, k);
      out.push({ date: k, score: dayScore(profile, k, dayData(d, k), training), training });
    }
    return out;
  }, [profile, d, from, to]);
}

export function useActiveProgram() {
  const q = useRows<Program>({ table: "transformation_programs", filters: [["status", "in", ["active", "paused"]]], order: [["created_at", false]] });
  return q.rows[0];
}

export function useMeasurements() {
  return useRows<BodyMeasurement>({ table: "body_measurements", order: [["date", true]] });
}

export function useEvents(fromISO: string, toISO: string) {
  // recurring events may start before the window, so fetch everything that starts before the window end
  const q = useRows<CalendarEvent>({ table: "calendar_events", filters: [["start_at", "lte", toISO]], order: [["start_at", true]] });
  return { ...q, rows: q.rows.filter((e) => e.recurrence !== "none" || e.end_at >= fromISO) };
}

export function useVitals(from: string, to: string) {
  return useRows<HealthDaily>({ table: "health_daily", filters: [["date", "gte", from], ["date", "lte", to]], order: [["date", true]] });
}
