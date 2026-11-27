import { supabase } from "./supabase";
import { dateKey } from "./calc";
import { insertRows, queryClient } from "./data";
import type { Exercise, PlanExercise, Workout, WorkoutSet } from "./types";

/** Most recent completed sets per exercise (newest session first), straight from the database. */
export async function lastSessions(exerciseIds: string[], sessions = 3) {
  if (!exerciseIds.length) return new Map<string, WorkoutSet[][]>();
  const { data, error } = await supabase.from("workout_sets").select("*, workouts!inner(status, date, started_at)")
    .in("exercise_id", exerciseIds).eq("completed", true).eq("workouts.status", "completed").order("completed_at", { ascending: false }).limit(800);
  if (error) throw error;
  const out = new Map<string, WorkoutSet[][]>();
  const rows = (data || []) as (WorkoutSet & { workouts: { started_at: string } })[];
  for (const id of exerciseIds) {
    const mine = rows.filter((r) => r.exercise_id === id);
    const byW = new Map<string, typeof mine>();
    mine.forEach((r) => byW.set(r.workout_id, [...(byW.get(r.workout_id) || []), r]));
    const ordered = [...byW.values()].sort((a, b) => b[0].workouts.started_at.localeCompare(a[0].workouts.started_at)).slice(0, sessions);
    out.set(id, ordered.map((s) => [...s].sort((a, b) => a.set_number - b.set_number) as WorkoutSet[]));
  }
  return out;
}

/** Create a workout session from a plan (or empty), pre-filling weights from your last session. */
export async function startWorkout(opts: { planId?: string | null; name: string; date?: string }) {
  let pe: (PlanExercise & { exercises: Exercise })[] = [];
  if (opts.planId) {
    const { data, error } = await supabase.from("plan_exercises").select("*, exercises(*)").eq("plan_id", opts.planId).order("position");
    if (!error) pe = (data || []) as typeof pe;
    else {
      // offline: build from the locally cached plan + exercise library
      const cached = (t: string) => queryClient.getQueryCache().findAll({ queryKey: ["rows", t] }).flatMap((q) => (q.state.data as Record<string, unknown>[]) || []);
      const lib = new Map((cached("exercises") as unknown as Exercise[]).map((e) => [e.id, e]));
      const seen = new Set<string>();
      pe = (cached("plan_exercises") as unknown as PlanExercise[]).filter((p) => p.plan_id === opts.planId && !seen.has(p.id) && seen.add(p.id) && lib.has(p.exercise_id))
        .sort((a, b) => a.position - b.position).map((p) => ({ ...p, exercises: lib.get(p.exercise_id)! }));
      if (!pe.length) throw error;
    }
  }
  const hist = await lastSessions(pe.map((p) => p.exercise_id), 1).catch(() => new Map<string, WorkoutSet[][]>());
  const [w] = await insertRows("workouts", { plan_id: opts.planId ?? null, name: opts.name, date: opts.date ?? dateKey(), status: "in_progress", started_at: new Date().toISOString() });
  const sets: Record<string, unknown>[] = [];
  pe.forEach((p, order) => {
    const last = hist.get(p.exercise_id)?.[0] || [];
    for (let s = 1; s <= p.sets; s++) {
      const prev = last[s - 1] ?? last[last.length - 1];
      sets.push({ workout_id: w.id, exercise_id: p.exercise_id, exercise_name: p.exercises.name, muscle_group: p.exercises.muscle_group, exercise_order: order, set_number: s, target_reps: p.reps, reps: p.reps, weight: prev ? Number(prev.weight) : Number(p.weight) || 0, rest_seconds: p.rest_seconds, completed: false });
    }
  });
  if (sets.length) await insertRows("workout_sets", sets);
  return w as unknown as Workout;
}

export function addExerciseSets(workoutId: string, ex: Exercise, order: number, count = ex.default_sets, weight = ex.default_weight) {
  return insertRows("workout_sets", Array.from({ length: count }, (_, i) => ({
    workout_id: workoutId, exercise_id: ex.id, exercise_name: ex.name, muscle_group: ex.muscle_group, exercise_order: order, set_number: i + 1,
    target_reps: ex.default_reps, reps: ex.default_reps, weight, rest_seconds: ex.default_rest_seconds, completed: false,
  })));
}
