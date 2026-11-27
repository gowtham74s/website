import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scaleFood, sumMacros, recipeNutrition, walkDistance, sleepMinutes, readiness, isPersonalRecord, suggestOverload,
  habitStreaks, rollingAverage, trendPerWeek, dayScore, programDay, expandEvents, findConflicts, addDays, calorieScore,
} from "../calc.ts";

const food = { serving_size: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 } as any;

test("scaleFood scales linearly by quantity", () => {
  assert.deepEqual(scaleFood(food, 150), { calories: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0 });
  assert.equal(scaleFood(food, 0).calories, 0);
});

test("sumMacros and recipe per-serving", () => {
  assert.equal(sumMacros([{ calories: 100, protein: 10 }, { calories: 50.4, protein: 2.25 }]).calories, 150);
  const r = recipeNutrition([{ quantity: 200, food }, { quantity: 100, food }], 3);
  assert.equal(r.total.calories, 495);
  assert.equal(r.perServing.calories, 165);
});

test("walk distance falls back to steps", () => {
  const rows: any[] = [{ type: "walk", distance_km: 2, steps: 0 }, { type: "walk", distance_km: 0, steps: 2624 }, { type: "cycle", distance_km: 10 }];
  assert.equal(walkDistance(rows), 4);
});

test("sleep across midnight", () => {
  assert.equal(sleepMinutes("2026-01-01T23:30:00", "2026-01-02T07:00:00"), 450);
});

test("readiness bands", () => {
  const hi = readiness({ energy: 9, motivation: 9, soreness: 2, stress: 2, fatigue: 2 } as any, 8, 8)!;
  assert.equal(hi.status, "normal");
  const lo = readiness({ energy: 2, motivation: 3, soreness: 9, stress: 8, fatigue: 9 } as any, 5, 8)!;
  assert.equal(lo.status, "recovery");
  assert.equal(readiness(undefined, 8, 8), null);
});

test("PR detection", () => {
  const hist = [{ weight: 80, reps: 8 }, { weight: 85, reps: 5 }];
  assert.equal(isPersonalRecord({ weight: 87.5, reps: 3 }, hist), true);
  assert.equal(isPersonalRecord({ weight: 80, reps: 10 }, hist), true); // e1RM 106.7 > 101.3
  assert.equal(isPersonalRecord({ weight: 80, reps: 6 }, hist), false);
  assert.equal(isPersonalRecord({ weight: 100, reps: 5 }, []), false);
});

test("progressive overload", () => {
  assert.equal(suggestOverload([], 8, "chest").action, "none");
  const inc = suggestOverload([[{ weight: 60, reps: 8 }, { weight: 60, reps: 9 }]], 8, "chest");
  assert.deepEqual([inc.action, inc.weight], ["increase", 62.5]);
  assert.equal(suggestOverload([[{ weight: 100, reps: 8 }]], 8, "quads").weight, 105);
  assert.equal(suggestOverload([[{ weight: 60, reps: 6 }]], 8, "chest").action, "reps");
  assert.equal(suggestOverload([[{ weight: 60, reps: 6 }], [{ weight: 60, reps: 8 }]], 8, "chest").action, "hold");
});

test("habit streaks: pending today does not break streak", () => {
  const today = "2026-03-10";
  const h: any = { id: "h", frequency: "daily", days: [0, 1, 2, 3, 4, 5, 6], created_at: "2026-03-01T00:00:00Z", archived: false, target_per_week: 7 };
  const logs: any[] = ["2026-03-07", "2026-03-08", "2026-03-09"].map((date) => ({ habit_id: "h", date, completed: true }));
  logs.push({ habit_id: "h", date: "2026-03-03", completed: true }, { habit_id: "h", date: "2026-03-04", completed: true }, { habit_id: "h", date: "2026-03-05", completed: true }, { habit_id: "h", date: "2026-03-02", completed: true });
  const s = habitStreaks(h, logs, today);
  assert.equal(s.current, 3);
  assert.equal(s.best, 4);
});

test("rolling average and trend", () => {
  const pts = Array.from({ length: 14 }, (_, i) => ({ date: addDays("2026-01-01", i), value: 80 - i * 0.1 }));
  const r = rollingAverage(pts, 7);
  assert.equal(r[6].avg, 79.7);
  assert.equal(trendPerWeek(pts), -0.7);
});

test("calorie score penalises both under and over", () => {
  assert.equal(calorieScore(2000, 2000), 1);
  assert.ok(calorieScore(1000, 2000) < 0.6);
  assert.ok(calorieScore(2600, 2000) < 0.7);
});

test("day score excludes workout on rest days", () => {
  const p: any = { calorie_target: 2000, protein_target: 150, carbs_target: 200, fat_target: 70, fiber_target: 30, rest_day_calorie_delta: 0, water_target_ml: 3000, walk_target_km: 4, sleep_target_hours: 8, score_weights: {} };
  const d: any = { nutrition: [{ calories: 2000, protein: 150 }], hydration: [{ amount_ml: 3000 }], activity: [{ type: "walk", distance_km: 4 }], sleep: { duration_min: 480 }, workouts: [], habits: [], habitLogs: [] };
  assert.equal(dayScore(p, "2026-03-10", d, false).score, 100);
  assert.ok(dayScore(p, "2026-03-10", d, true).score < 100);
});

test("program day with pauses", () => {
  const prog: any = { start_date: "2026-01-01", duration_days: 75, paused_days: 2, status: "active" };
  const r = programDay(prog, "2026-01-10");
  assert.equal(r.day, 8);
  assert.equal(r.remaining, 67);
});

test("recurring events and conflicts", () => {
  const ev = (id: string, s: string, e: string, recurrence = "none"): any => ({ id, start_at: s, end_at: e, recurrence, all_day: false, recurrence_exceptions: [], completed_dates: [] });
  const occ = expandEvents([ev("a", "2026-03-02T09:00:00", "2026-03-02T10:00:00", "weekdays"), ev("b", "2026-03-04T09:30:00", "2026-03-04T10:30:00")], "2026-03-01", "2026-03-08");
  assert.equal(occ.filter((o) => o.event.id === "a").length, 5);
  assert.equal(findConflicts(occ).length, 1);
});
