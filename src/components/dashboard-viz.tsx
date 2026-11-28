"use client";
// Interactive dashboard pieces: a 7-day strip to drill into any day, and trend tiles whose bars select a day
// (cross-filtering the whole dashboard, Power BI–style) and whose titles open the detail page.
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { activeCalories, sumMacros, totalSteps, walkDistance } from "@/lib/calc";
import type { RangeData } from "@/lib/hooks";
import type { HealthDaily, Profile } from "@/lib/types";
import { cx, Ring } from "./ui";

type DayScore = { date: string; score: { score: number }; training: boolean };
const wd = (k: string) => new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" });
const dm = (k: string) => Number(k.slice(8));

export function WeekStrip({ scores, selected, today, onSelect }: { scores: DayScore[]; selected: string; today: string; onSelect: (d: string) => void }) {
  return (
    <div className="mb-4 grid grid-cols-7 gap-1.5" role="tablist" aria-label="Choose a day">
      {scores.map((s) => {
        const on = s.date === selected;
        return (
          <button key={s.date} role="tab" aria-selected={on} onClick={() => onSelect(s.date)} title={`${s.date}: score ${s.score.score}`}
            className={cx("flex flex-col items-center gap-1 rounded-2xl border py-2 transition active:scale-95", on ? "border-fg/30 bg-card-2" : "border-line bg-card hover:border-line-2")}>
            <span className={cx("text-[10px] font-semibold uppercase", s.date === today ? "text-good" : "text-faint")}>{s.date === today ? "Today" : wd(s.date)}</span>
            <Ring value={s.score.score / 100} size={34} stroke={4}><span className="num text-[10px] font-semibold">{s.score.score}</span></Ring>
            <span className={cx("num text-[11px]", on ? "font-semibold text-fg" : "text-muted")}>{dm(s.date)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface Series { key: string; title: string; href: string; unit: string; color: string; target?: number; values: { date: string; v: number | null }[]; fmt?: (v: number) => string; higherIsBetter?: boolean }

function Spark({ s, selected, onSelect }: { s: Series; selected: string; onSelect: (d: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(s.target ?? 0, ...s.values.map((x) => x.v ?? 0), 1);
  const shown = s.values.find((x) => x.date === (hover ?? selected));
  const vals = s.values.map((x) => x.v).filter((v): v is number => v != null);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const f = s.fmt ?? ((v: number) => Math.round(v).toLocaleString());
  return (
    <div className="rounded-2xl border border-line bg-card p-3.5">
      <Link href={s.href} className="group flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted group-hover:text-fg">{s.title}</div>
          <div className="num mt-0.5 text-lg font-semibold">{shown?.v != null ? f(shown.v) : "—"}<span className="ml-0.5 text-xs font-normal text-faint">{shown?.v != null ? s.unit : ""}</span></div>
          <div className="num text-[11px] text-faint">{hover ? new Date(`${hover}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : `14-day avg ${mean != null ? f(mean) : "—"}`}</div>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint group-hover:text-fg" />
      </Link>
      <div className="mt-2 flex h-12 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {s.values.map((x) => {
          const h = x.v != null ? Math.max(4, (x.v / max) * 100) : 0;
          const hit = s.target != null && x.v != null && (s.higherIsBetter === false ? x.v <= s.target : x.v >= s.target);
          return (
            <button key={x.date} aria-label={`${x.date}: ${x.v != null ? f(x.v) + " " + s.unit : "no data"}`} onClick={() => onSelect(x.date)} onMouseEnter={() => setHover(x.date)} onFocus={() => setHover(x.date)}
              className="relative flex h-full flex-1 items-end rounded-[3px] hover:bg-card-2">
              <span className={cx("w-full rounded-t-[3px] transition-[height,opacity]", x.date === selected ? "opacity-100" : "opacity-60")} style={{ height: `${h}%`, background: hit ? "var(--good)" : s.color, outline: x.date === selected ? "1.5px solid var(--fg)" : undefined, outlineOffset: 1 }} />
              {x.v == null && <span className="absolute bottom-0 h-[2px] w-full rounded bg-line" />}
            </button>
          );
        })}
      </div>
      {s.target != null && <div className="mt-1 text-[10px] text-faint">target {f(s.target)} {s.unit} · green = met</div>}
    </div>
  );
}

export function TrendTiles({ data, scores, vitals, profile, selected, onSelect }: { data: RangeData; scores: DayScore[]; vitals: HealthDaily[]; profile: Profile; selected: string; onSelect: (d: string) => void }) {
  const series = useMemo<Series[]>(() => {
    const days = scores.map((s) => s.date);
    const by = <T extends { date: string }>(rows: T[], k: string) => rows.filter((r) => r.date === k);
    const per = (fn: (k: string) => number | null) => days.map((k) => ({ date: k, v: fn(k) }));
    return [
      { key: "steps", title: "Steps", href: "/activity", unit: "", color: "var(--info)", target: profile.steps_target || undefined, values: per((k) => { const r = by(data.activity, k); return r.length ? totalSteps(r) : null; }) },
      { key: "dist", title: "Walking distance", href: "/activity", unit: "km", color: "var(--info)", target: Number(profile.walk_target_km) || undefined, fmt: (v) => (Math.round(v * 10) / 10).toString(), values: per((k) => { const r = by(data.activity, k); return r.length ? walkDistance(r) : null; }) },
      { key: "kcal", title: "Active calories", href: "/activity", unit: "kcal", color: "var(--warm)", values: per((k) => { const r = by(data.activity, k); return r.length ? activeCalories(r, profile.weight_kg, profile.height_cm).active : null; }) },
      { key: "sleep", title: "Sleep", href: "/sleep", unit: "h", color: "var(--violet)", target: Number(profile.sleep_target_hours), fmt: (v) => (Math.round(v * 10) / 10).toString(), values: per((k) => { const s = data.sleep.find((x) => x.date === k); return s ? s.duration_min / 60 : null; }) },
      { key: "water", title: "Water", href: "/hydration", unit: "L", color: "var(--cyan)", target: profile.water_target_ml / 1000, fmt: (v) => v.toFixed(1), values: per((k) => { const r = by(data.hydration, k); return r.length ? r.reduce((a, x) => a + x.amount_ml, 0) / 1000 : null; }) },
      { key: "cal", title: "Calories eaten", href: "/nutrition", unit: "kcal", color: "var(--warm)", target: profile.calorie_target, higherIsBetter: false, values: per((k) => { const r = by(data.nutrition, k); return r.length ? sumMacros(r).calories : null; }) },
      { key: "protein", title: "Protein", href: "/nutrition", unit: "g", color: "var(--good)", target: profile.protein_target, values: per((k) => { const r = by(data.nutrition, k); return r.length ? sumMacros(r).protein : null; }) },
      { key: "rhr", title: "Resting heart rate", href: "/vitals", unit: "bpm", color: "var(--bad)", values: per((k) => vitals.find((v) => v.date === k)?.resting_hr ?? null) },
    ];
  }, [data, scores, vitals, profile]);
  const visible = series.filter((s) => s.values.some((x) => x.v != null));
  if (!visible.length) return null;
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Last 14 days</h2>
        <span className="text-xs text-faint">Tap a bar to view that day · tap a title for details</span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{visible.map((s) => <Spark key={s.key} s={s} selected={selected} onSelect={(d) => { onSelect(d); window.scrollTo({ top: 0, behavior: "smooth" }); }} />)}</div>
    </section>
  );
}

