"use client";
import { useEffect } from "react";
import { dayScore, habitScheduled, isTrainingDay } from "./calc";
import { upsertRow } from "./data";
import { dayData, today, useProfile, useRange } from "./hooks";

const metricKey: Record<string, string> = { workout: "workout", protein: "protein", calories: "nutrition", water: "water", walk: "walk", sleep: "sleep" };

/** Auto-complete metric-linked habits for today once the underlying target is reached. */
export function useAutoHabits() {
  const { profile } = useProfile();
  const t = today();
  const d = useRange(t, t);
  useEffect(() => {
    if (!profile || d.loading) return;
    const sc = dayScore(profile, t, dayData(d, t), isTrainingDay(profile, d.plans, t));
    d.habits.filter((h) => h.auto_metric && habitScheduled(h, t) && !d.habitLogs.some((l) => l.habit_id === h.id && l.date === t)).forEach((h) => {
      if (sc.parts.find((p) => p.key === metricKey[h.auto_metric!])?.achieved) upsertRow("habit_logs", { habit_id: h.id, date: t, completed: true }, "habit_id,date").catch(() => {});
    });
  }, [profile, d, t]);
}

