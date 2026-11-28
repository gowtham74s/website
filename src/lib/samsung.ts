// Samsung Health export parser (Samsung Health → Settings → Download personal data).
// The export is a folder/zip of CSV files named like `com.samsung.shealth.exercise.20261127123456.csv`.
// Each CSV starts with a metadata line, then a header row whose column names are often prefixed
// (e.g. `com.samsung.health.exercise.start_time`). Times are UTC with a separate `time_offset`
// column such as `UTC+0530`. Pure functions only — unit-tested in __tests__/samsung.test.ts.

export type ActivityKind = "walk" | "run" | "cycle" | "cardio" | "swim" | "hike" | "other";

export interface SamsungDailySteps { date: string; steps: number; distance_km: number; calories: number; active_min: number; resting_calories: number }
export interface SamsungWater { date: string; logged_at: string; amount_ml: number }
export interface SamsungExercise { date: string; start: string; end: string; type: ActivityKind; label: string; duration_min: number; distance_km: number; calories: number; avg_hr: number | null; max_hr: number | null }
export interface SamsungSleep {
  date: string; bedtime: string; wake_time: string; duration_min: number; sessions: number;
  score: number | null; efficiency: number | null; physical_recovery: number | null; mental_recovery: number | null;
  deep_min: number | null; light_min: number | null; rem_min: number | null; awake_min: number | null;
  snoring_min: number | null; spo2_avg: number | null; spo2_min: number | null;
}
export interface SamsungWeight { date: string; weight_kg: number; body_fat_pct: number | null }
export interface SamsungVitals {
  date: string; resting_hr: number | null; avg_hr: number | null; min_hr: number | null; max_hr: number | null; hr_samples: number;
  stress_avg: number | null; stress_min: number | null; stress_max: number | null; stress_samples: number;
  spo2_avg: number | null; spo2_min: number | null; floors: number | null;
}
export interface SamsungData {
  steps: SamsungDailySteps[]; exercises: SamsungExercise[]; sleep: SamsungSleep[]; weight: SamsungWeight[]; water: SamsungWater[];
  vitals: SamsungVitals[]; heightCm: number | null; files: string[]; skipped: string[]; calorieGoal: number | null;
}

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
  // Line 1 is metadata ("com.samsung.shealth.exercise,6316006,3").
  const first = splitCsvLine(lines[0]);
  const h = /^com\.samsung\.[\w.]+$/.test(first[0]?.trim() ?? "") && /^\d+$/.test(first[1]?.trim() ?? "") ? 1 : 0;
  const header = splitCsvLine(lines[h]).map((c) => c.trim().replace(/^com\.samsung\.(s?health)\.[\w.]*?\.(?=[a-z0-9_]+$)/, ""));
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
const opt = (s: string | undefined) => { const n = Number(s); return s !== undefined && s !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Samsung Health exercise_type codes (most common ones).
const EXERCISE_TYPES: Record<number, [ActivityKind, string]> = {
  1001: ["walk", "Walking"], 1002: ["run", "Running"], 11007: ["cycle", "Cycling"], 13001: ["hike", "Hiking"],
  14001: ["swim", "Swimming"], 14002: ["swim", "Swimming (open water)"], 15003: ["cardio", "Indoor cycling"],
  15004: ["cardio", "Elliptical"], 15005: ["cardio", "Rowing machine"], 15006: ["walk", "Treadmill"], 15001: ["cardio", "Step machine"],
  10004: ["other", "Weight training"], 10005: ["other", "Strength workout"], 10007: ["other", "Circuit training"], 0: ["other", "Workout"],
};

// Samsung sleep stage codes.
const STAGES: Record<string, "awake" | "light" | "deep" | "rem"> = { "40001": "awake", "40002": "light", "40003": "deep", "40004": "rem" };

// Every Samsung Health CSV starts with a line naming its data type, e.g.
// `com.samsung.shealth.activity.day_summary,7014003,6`. We recognise files by that line first, so it works
// even when a phone's file picker renames the file; the file name (`<type>.<timestamp>[_n].csv`) is the fallback.
const KINDS: Record<string, string> = {
  "activity.day_summary": "activity_day", "calories_burned.details": "calories_burned",
  "tracker.pedometer_day_summary": "day_summary", "pedometer_day_summary": "day_summary", "step_daily_trend": "daily_trend",
  "exercise": "exercise", "sleep": "sleep", "sleep_stage": "sleep_stage", "sleep_snoring": "snoring",
  "weight": "weight", "height": "height", "water_intake": "water", "active_calories.goal": "calorie_goal",
  "tracker.heart_rate": "heart_rate", "tracker.oxygen_saturation": "spo2", "stress": "stress", "tracker.floors_day_summary": "floors",
};
export function dataTypeOf(name: string, text?: string): string | null {
  const first = text?.replace(/^﻿/, "").split(/\r?\n/, 1)[0]?.split(",")[0]?.trim().toLowerCase();
  if (first && /^com\.samsung\.[a-z0-9_.]+$/.test(first)) return first;
  const n = (name.toLowerCase().split(/[\\/]/).pop() || "").replace(/^[0-9a-f]{8}-/, "");
  return n.match(/(com\.samsung\.[a-z0-9_.]+?)\.\d{8,}(?:_\d+)?(?:\s*\(\d+\))?\.csv$/)?.[1] ?? null;
}
const fileKind = (name: string, text?: string) => {
  const t = dataTypeOf(name, text);
  return t ? KINDS[t.replace(/^com\.samsung\.s?health\./, "")] ?? null : null;
};

/** True for any Samsung Health CSV (used or not) — so we can tell "wrong files" from "unsupported data". */
export const isSamsungFile = (name: string, text?: string) => dataTypeOf(name, text) !== null;

/** Turn the CSV files of a Samsung Health export into normalized records. */
export function parseSamsungExport(files: { name: string; text: string }[]): SamsungData {
  const out: SamsungData = { steps: [], exercises: [], sleep: [], weight: [], water: [], vitals: [], heightCm: null, files: [], skipped: [], calorieGoal: null };
  const stepsByDate = new Map<string, SamsungDailySteps & { prio: number }>();
  const resting = new Map<string, { rest: number; active: number }>();
  const dayKey = (v: string | undefined) => {
    if (!v) return null;
    if (/^\d{11,}$/.test(v)) { const d = new Date(Number(v)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    return v.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null; // day_time is already the local calendar day
  };
  // collected first, combined after every file is read (files can arrive in any order)
  type Session = { id: string; s: Date; e: Date; off: number; mins: number; score: number | null; eff: number | null; phys: number | null; ment: number | null };
  const sessions: Session[] = [];
  const stageMin = new Map<string, Record<string, number>>();
  const snores: { s: number; ms: number }[] = [];
  const spo2: { t: number; date: string; v: number | null; min: number | null }[] = [];
  const hr = new Map<string, number[]>();
  const stress = new Map<string, number[]>();
  const floors = new Map<string, number>();

  for (const f of files) {
    const kind = fileKind(f.name, f.text);
    if (!kind) { if (isSamsungFile(f.name, f.text)) out.skipped.push(f.name.split("/").pop()!); continue; }
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
        const avg = opt(r.mean_heart_rate), max = opt(r.max_heart_rate);
        out.exercises.push({
          date: localDateKey(s, off), start: s.toISOString(), end: (e ?? new Date(s.getTime() + durMs)).toISOString(),
          type, label, duration_min: Math.round(durMs / 60000),
          distance_km: Math.round((num(r.distance) / 1000) * 100) / 100, calories: Math.round(num(r.calorie)),
          avg_hr: avg && avg > 30 ? Math.round(avg) : null, max_hr: max && max > 30 ? Math.round(max) : null,
        });
      }
    } else if (kind === "sleep") {
      for (const r of rows) {
        const s = parseUtc(r.start_time), e = parseUtc(r.end_time);
        if (!s || !e || e <= s) continue;
        const score = opt(r.sleep_score), eff = opt(r.efficiency);
        sessions.push({
          id: r.datauuid || `${r.start_time}`, s, e, off: offsetMinutes(r.time_offset), mins: Math.round((e.getTime() - s.getTime()) / 60000),
          score: score && score > 0 ? Math.round(score) : null, eff: eff && eff > 0 ? r1(eff) : null,
          phys: opt(r.physical_recovery), ment: opt(r.mental_recovery),
        });
      }
    } else if (kind === "sleep_stage") {
      for (const r of rows) {
        const st = STAGES[r.stage]; const s = parseUtc(r.start_time), e = parseUtc(r.end_time);
        if (!st || !s || !e || !r.sleep_id) continue;
        const m = stageMin.get(r.sleep_id) ?? { awake: 0, light: 0, deep: 0, rem: 0 };
        m[st] += (e.getTime() - s.getTime()) / 60000;
        stageMin.set(r.sleep_id, m);
      }
    } else if (kind === "snoring") {
      for (const r of rows) { const s = parseUtc(r.start_time); const ms = num(r.duration); if (s && ms > 0) snores.push({ s: s.getTime(), ms }); }
    } else if (kind === "spo2") {
      for (const r of rows) {
        const s = parseUtc(r.start_time); if (!s) continue;
        const v = num(r.spo2), mn = num(r.min);
        const val = v >= 70 && v <= 100 ? v : null, low = mn >= 70 && mn <= 100 ? mn : null;
        if (val == null && low == null) continue;
        spo2.push({ t: s.getTime(), date: localDateKey(s, offsetMinutes(r.time_offset)), v: val, min: low ?? val });
      }
    } else if (kind === "heart_rate") {
      for (const r of rows) {
        const s = parseUtc(r.start_time); const v = num(r.heart_rate);
        if (!s || v < 30 || v > 230) continue;
        const d = localDateKey(s, offsetMinutes(r.time_offset));
        (hr.get(d) ?? hr.set(d, []).get(d)!).push(v);
      }
    } else if (kind === "stress") {
      for (const r of rows) {
        const s = parseUtc(r.start_time); if (!s || r.score === "") continue;
        const v = num(r.score); if (v < 0 || v > 100) continue;
        const d = localDateKey(s, offsetMinutes(r.time_offset));
        (stress.get(d) ?? stress.set(d, []).get(d)!).push(v);
      }
    } else if (kind === "floors") {
      for (const r of rows) { const d = dayKey(r.day_time); if (d) floors.set(d, Math.round(num(r.floor_count))); }
    } else if (kind === "height") {
      for (const r of rows) { const h = num(r.height); if (h >= 100 && h <= 250) out.heightCm = Math.round(h); }
    } else if (kind === "weight") {
      for (const r of rows) {
        const s = parseUtc(r.start_time || r.create_time); const w = num(r.weight);
        if (!s || w < 20 || w > 400) continue;
        const bf = num(r.body_fat);
        out.weight.push({ date: localDateKey(s, offsetMinutes(r.time_offset)), weight_kg: Math.round(w * 10) / 10, body_fat_pct: bf > 0 && bf < 70 ? Math.round(bf * 10) / 10 : null });
      }
    }
  }

  // ---- sleep: enrich each session with stages, snoring and SpO2, then merge sessions by wake-up date
  const nights = new Map<string, { list: Session[] }>();
  for (const s of sessions) {
    const d = localDateKey(s.e, s.off);
    (nights.get(d) ?? nights.set(d, { list: [] }).get(d)!).list.push(s);
  }
  for (const [date, { list }] of nights) {
    const mins = list.reduce((a, s) => a + s.mins, 0);
    if (mins < 60) continue; // ignore short naps on their own
    const main = list.reduce((a, b) => (b.mins > a.mins ? b : a));
    const st = list.map((s) => stageMin.get(s.id)).filter(Boolean) as Record<string, number>[];
    const sum = (k: string) => (st.length ? Math.round(st.reduce((a, m) => a + (m[k] || 0), 0)) : null);
    const inside = (t: number) => list.some((s) => t >= s.s.getTime() && t <= s.e.getTime());
    const sn = snores.filter((x) => inside(x.s));
    const ox = spo2.filter((x) => inside(x.t));
    const oxV = ox.map((x) => x.v).filter((v): v is number => v != null), oxMin = ox.map((x) => x.min).filter((v): v is number => v != null);
    const bed = list.reduce((a, s) => (s.s < a ? s.s : a), list[0].s), wake = list.reduce((a, s) => (s.e > a ? s.e : a), list[0].e);
    out.sleep.push({
      date, bedtime: bed.toISOString(), wake_time: wake.toISOString(), duration_min: mins, sessions: list.length,
      score: main.score, efficiency: main.eff, physical_recovery: main.phys, mental_recovery: main.ment,
      deep_min: sum("deep"), light_min: sum("light"), rem_min: sum("rem"), awake_min: sum("awake"),
      snoring_min: sn.length ? Math.round(sn.reduce((a, x) => a + x.ms, 0) / 60000) : snores.length ? 0 : null,
      spo2_avg: oxV.length ? r1(mean(oxV)) : null, spo2_min: oxMin.length ? Math.min(...oxMin) : null,
    });
  }

  // ---- daily vitals
  const days = new Set([...hr.keys(), ...stress.keys(), ...floors.keys(), ...spo2.map((x) => x.date)]);
  for (const date of days) {
    const h = (hr.get(date) ?? []).slice().sort((a, b) => a - b);
    const lowN = Math.max(1, Math.round(h.length * 0.1));
    const s = stress.get(date) ?? [];
    const ox = spo2.filter((x) => x.date === date);
    const oxV = ox.map((x) => x.v).filter((v): v is number => v != null), oxMin = ox.map((x) => x.min).filter((v): v is number => v != null);
    const fl = floors.get(date);
    const v: SamsungVitals = {
      date, hr_samples: h.length, stress_samples: s.length,
      resting_hr: h.length >= 5 ? Math.round(mean(h.slice(0, lowN))) : null, avg_hr: h.length ? Math.round(mean(h)) : null,
      min_hr: h.length ? Math.round(h[0]) : null, max_hr: h.length ? Math.round(h[h.length - 1]) : null,
      stress_avg: s.length ? Math.round(mean(s)) : null, stress_min: s.length ? Math.round(Math.min(...s)) : null, stress_max: s.length ? Math.round(Math.max(...s)) : null,
      spo2_avg: oxV.length ? r1(mean(oxV)) : null, spo2_min: oxMin.length ? Math.min(...oxMin) : null, floors: fl ?? null,
    };
    if (v.hr_samples || v.stress_samples || v.spo2_avg != null || v.spo2_min != null || (v.floors ?? 0) > 0) out.vitals.push(v);
  }

  out.steps = [...stepsByDate.values()].map(({ prio: _p, ...r }) => {
    const c = resting.get(r.date);
    return { ...r, resting_calories: c?.rest ?? 0, calories: r.calories || c?.active || 0 };
  }).sort((a, b) => a.date.localeCompare(b.date));
  out.water.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  out.exercises.sort((a, b) => a.start.localeCompare(b.start));
  out.sleep.sort((a, b) => a.date.localeCompare(b.date));
  out.vitals.sort((a, b) => a.date.localeCompare(b.date));
  // keep one weight per day (the last one)
  out.weight = [...new Map(out.weight.sort((a, b) => a.date.localeCompare(b.date)).map((w) => [w.date, w])).values()];
  return out;
}
