// Samsung Health export parser (Samsung Health → Settings → Download personal data).
// The export is a folder/zip of CSV files named like `com.samsung.shealth.exercise.20261127123456.csv`.
// Each CSV starts with a metadata line, then a header row whose column names are often prefixed
// (e.g. `com.samsung.health.exercise.start_time`). Times are UTC with a separate `time_offset`
// column such as `UTC+0530`. Pure functions only — unit-tested in __tests__/samsung.test.ts.

export type ActivityKind = "walk" | "run" | "cycle" | "cardio" | "swim" | "hike" | "other";

export interface SamsungDailySteps { date: string; steps: number; distance_km: number; calories: number; active_min: number; resting_calories: number }
export interface SamsungWater { date: string; logged_at: string; amount_ml: number }
export interface SamsungExercise { date: string; start: string; end: string; type: ActivityKind; label: string; duration_min: number; distance_km: number; calories: number }
export interface SamsungSleep { date: string; bedtime: string; wake_time: string; duration_min: number }
export interface SamsungWeight { date: string; weight_kg: number; body_fat_pct: number | null }
export interface SamsungData { steps: SamsungDailySteps[]; exercises: SamsungExercise[]; sleep: SamsungSleep[]; weight: SamsungWeight[]; water: SamsungWater[]; files: string[]; skipped: string[]; calorieGoal: number | null }

/** Minimal RFC-4180 CSV line splitter (handles quoted fields with commas/quotes). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Parse a Samsung CSV into objects keyed by the column name with any `com.samsung…` prefix stripped. */
export function parseSamsungCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  // Line 1 is metadata ("com.samsung.shealth.exercise,6316006,3"); header is the first line that has many columns.
  const first = splitCsvLine(lines[0]);
  const h = /^com\.samsung\.[\w.]+$/.test(first[0]?.trim() ?? "") && /^\d+$/.test(first[1]?.trim() ?? "") ? 1 : 0;
  const header = splitCsvLine(lines[h]).map((c) => c.trim().replace(/^com\.samsung\.(s?health)\.[\w.]*?\.(?=[a-z_]+$)/, ""));
  return lines.slice(h + 1).map((l) => {
    const cells = splitCsvLine(l); const row: Record<string, string> = {};
    header.forEach((k, i) => { if (k && row[k] === undefined) row[k] = (cells[i] ?? "").trim(); });
    return row;
  });
}

/** "UTC+0530" → +330 minutes. */
export function offsetMinutes(off: string | undefined): number {
  const m = off?.match(/([+-])(\d{2}):?(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** Samsung time ("2026-03-01 22:30:00.000", UTC) → absolute Date. Also accepts epoch ms. */
export function parseUtc(s: string | undefined): Date | null {
  if (!s) return null;
  if (/^\d{11,}$/.test(s)) return new Date(Number(s));
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Local calendar date at the place the data was recorded. */
export function localDateKey(d: Date, offsetMin: number) {
  const x = new Date(d.getTime() + offsetMin * 60000);
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

const num = (s: string | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

// Samsung Health exercise_type codes (most common ones).
const EXERCISE_TYPES: Record<number, [ActivityKind, string]> = {
  1001: ["walk", "Walking"], 1002: ["run", "Running"], 11007: ["cycle", "Cycling"], 13001: ["hike", "Hiking"],
  14001: ["swim", "Swimming"], 14002: ["swim", "Swimming (open water)"], 15003: ["cardio", "Indoor cycling"],
  15004: ["cardio", "Elliptical"], 15005: ["cardio", "Rowing machine"], 15006: ["walk", "Treadmill"], 15001: ["cardio", "Step machine"],
  10004: ["other", "Weight training"], 10007: ["other", "Circuit training"], 0: ["other", "Workout"],
};

// Export file names look like `com.samsung.shealth.exercise.20261128114729_1.csv` (the `_n` part is optional).
const fileKind = (name: string) => {
  const n = (name.toLowerCase().split("/").pop() || "").replace(/^[0-9a-f]{8}-/, "");
  const is = (key: string) => new RegExp(`(^|[.-])${key.replace(/\./g, "\\.")}\\.\\d{8,}(_\\d+)?\\.csv$`).test(n);
  if (is("activity.day_summary")) return "activity_day";
  if (is("calories_burned.details")) return "calories_burned";
  if (is("tracker.pedometer_day_summary") || is("pedometer_day_summary")) return "day_summary";
  if (is("step_daily_trend")) return "daily_trend";
  if (is("shealth.exercise") || is("health.exercise")) return "exercise";
  if (is("shealth.sleep") || is("health.sleep")) return "sleep";
  if (is("health.weight") || is("shealth.weight")) return "weight";
  if (is("water_intake")) return "water";
  if (is("active_calories.goal")) return "calorie_goal";
  return null;
};

export const isSamsungFile = (name: string) => fileKind(name) !== null;

/** Turn the CSV files of a Samsung Health export into normalized records. */
export function parseSamsungExport(files: { name: string; text: string }[]): SamsungData {
  const out: SamsungData = { steps: [], exercises: [], sleep: [], weight: [], water: [], files: [], skipped: [], calorieGoal: null };
  const stepsByDate = new Map<string, SamsungDailySteps & { prio: number }>();
  const resting = new Map<string, { rest: number; active: number }>();
  const dayKey = (v: string | undefined) => {
    if (!v) return null;
    if (/^\d{11,}$/.test(v)) { const d = new Date(Number(v)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    return v.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null; // day_time is already the local calendar day
  };

  for (const f of files) {
    const kind = fileKind(f.name);
    if (!kind) { if (/\.csv$/i.test(f.name)) out.skipped.push(f.name.split("/").pop()!); continue; }
    out.files.push(f.name.split("/").pop()!);
    const rows = parseSamsungCsv(f.text);

    if (kind === "day_summary" || kind === "daily_trend" || kind === "activity_day") {
      for (const r of rows) {
        const date = dayKey(r.day_time) ?? (parseUtc(r.create_time) ? dayKey(String(parseUtc(r.create_time)!.getTime())) : null);
        if (!date) continue;
        const steps = Math.round(num(r.step_count || r.count));
        if (!steps) continue;
        // activity.day_summary is Samsung's own merged daily total; in daily_trend source_type -2 is the merged row.
        const prio = kind === "activity_day" ? 4 : kind === "daily_trend" ? (r.source_type === "-2" ? 3 : 1) : 2;
        const rec = { date, steps, distance_km: Math.round((num(r.distance) / 1000) * 100) / 100, calories: Math.round(num(r.calorie)), active_min: Math.round(num(r.active_time) / 60000), resting_calories: 0, prio };
        const ex = stepsByDate.get(date);
        if (!ex || prio > ex.prio || (prio === ex.prio && steps > ex.steps)) stepsByDate.set(date, rec);
      }
    } else if (kind === "calories_burned") {
      for (const r of rows) {
        const date = dayKey(r.day_time);
        if (date) resting.set(date, { rest: Math.round(num(r.rest_calorie)), active: Math.round(num(r.active_calorie)) });
      }
    } else if (kind === "water") {
      for (const r of rows) {
        const s = parseUtc(r.start_time); const ml = Math.round(num(r.amount));
        if (!s || ml <= 0 || ml > 5000) continue;
        out.water.push({ date: localDateKey(s, offsetMinutes(r.time_offset)), logged_at: s.toISOString(), amount_ml: ml });
      }
    } else if (kind === "calorie_goal") {
      const last = rows.filter((r) => num(r.value) > 0).pop();
      if (last) out.calorieGoal = Math.round(num(last.value));
    } else if (kind === "exercise") {
      for (const r of rows) {
        const s = parseUtc(r.start_time), e = parseUtc(r.end_time);
        if (!s) continue;
        const off = offsetMinutes(r.time_offset);
        const durMs = num(r.duration) || (e ? e.getTime() - s.getTime() : 0);
        const [type, label] = EXERCISE_TYPES[num(r.exercise_type)] ?? ["other", "Workout"];
        out.exercises.push({
          date: localDateKey(s, off), start: s.toISOString(), end: (e ?? new Date(s.getTime() + durMs)).toISOString(),
          type, label, duration_min: Math.round(durMs / 60000),
          distance_km: Math.round((num(r.distance) / 1000) * 100) / 100, calories: Math.round(num(r.calorie)),
        });
      }
    } else if (kind === "sleep") {
      // Samsung can split one night into several sessions; merge them by wake-up date.
      const byDate = new Map<string, { s: Date; e: Date; mins: number }>();
      for (const r of rows) {
        const s = parseUtc(r.start_time), e = parseUtc(r.end_time);
        if (!s || !e || e <= s) continue;
        const date = localDateKey(e, offsetMinutes(r.time_offset));
        const mins = Math.round((e.getTime() - s.getTime()) / 60000);
        const cur = byDate.get(date);
        byDate.set(date, cur ? { s: s < cur.s ? s : cur.s, e: e > cur.e ? e : cur.e, mins: cur.mins + mins } : { s, e, mins });
      }
      for (const [date, v] of byDate) if (v.mins >= 60) out.sleep.push({ date, bedtime: v.s.toISOString(), wake_time: v.e.toISOString(), duration_min: v.mins });
    } else if (kind === "weight") {
      for (const r of rows) {
        const s = parseUtc(r.start_time || r.create_time); const w = num(r.weight);
        if (!s || w < 20 || w > 400) continue;
        const bf = num(r.body_fat);
        out.weight.push({ date: localDateKey(s, offsetMinutes(r.time_offset)), weight_kg: Math.round(w * 10) / 10, body_fat_pct: bf > 0 && bf < 70 ? Math.round(bf * 10) / 10 : null });
      }
    }
  }
  out.steps = [...stepsByDate.values()].map(({ prio: _p, ...r }) => {
    const c = resting.get(r.date);
    return { ...r, resting_calories: c?.rest ?? 0, calories: r.calories || c?.active || 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  out.water.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  out.exercises.sort((a, b) => a.start.localeCompare(b.start));
  out.sleep.sort((a, b) => a.date.localeCompare(b.date));
  // keep one weight per day (the last one)
  out.weight = [...new Map(out.weight.sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, w])).values()];
  return out;
}
