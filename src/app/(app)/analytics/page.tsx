"use client";
import { ArrowDownRight, ArrowUpRight, Info, Lightbulb, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, avg, habitScheduled, rollingAverage, startOfWeekKey, trendPerWeek, walkDistance } from "@/lib/calc";
import { useMeasurements, today, useProfile, useRange, useScores } from "@/lib/hooks";
import type { ScoreKey } from "@/lib/types";
import { wOut, wUnit } from "@/lib/units";
import { BarSeries, ChartFrame, LineSeries } from "@/components/charts";
import { Bar, Card, cx, Metric, PageHeader, Ring, Section, Segmented } from "@/components/ui";

const TIPS: Record<ScoreKey, string> = {
  workout: "Schedule sessions on fixed days in Workout → Plans and add them to your calendar so they're protected time.",
  nutrition: "Log as you eat rather than at night, and save your common meals so logging is one tap.",
  protein: "Anchor 30–40 g protein in each meal; a shake or Greek yogurt closes most gaps.",
  water: "Turn on interval water reminders and use the +500 ml quick add with each meal.",
  walk: "A 20-minute walk after lunch and dinner covers most daily targets.",
  sleep: "Set a wind-down reminder 30 min before bedtime and keep wake time consistent, even on weekends.",
  habits: "Trim habits to the few that matter, or link them to targets so they auto-complete.",
};

export default function AnalyticsPage() {
  const { profile } = useProfile();
  const [period, setPeriod] = useState<"week" | "month">("week");
  const t = today();
  const len = period === "week" ? 7 : 30;
  // current period ends yesterday (completed days only) + previous period for comparison
  const end = addDays(t, -1), start = addDays(end, -(len - 1)), prevStart = addDays(start, -len);
  const data = useRange(prevStart, t);
  const scores = useScores(profile, data, prevStart, end);
  const m = useMeasurements();

  const rep = useMemo(() => {
    const build = (from: string, to: string) => {
      const ds = scores.filter((s) => s.date >= from && s.date <= to);
      const logged = (k: string) => data.nutrition.some((n) => n.date === k);
      const nutDays = ds.filter((d) => logged(d.date));
      const sleepD = data.sleep.filter((s) => s.date >= from && s.date <= to);
      const wk = data.workouts.filter((w) => w.status === "completed" && w.date >= from && w.date <= to);
      const planned = ds.filter((d) => d.training).length;
      const habitSched = ds.reduce((a, d) => a + data.habits.filter((h) => h.frequency === "daily" && habitScheduled(h, d.date)).length, 0);
      const habitDone = data.habitLogs.filter((l) => l.date >= from && l.date <= to && l.completed && data.habits.some((h) => h.id === l.habit_id && h.frequency === "daily")).length;
      const parts = (k: ScoreKey) => ds.map((d) => d.score.parts.find((p) => p.key === k)!).filter((p) => p.applicable);
      const contrib = (Object.keys(TIPS) as ScoreKey[]).map((k) => { const ps = parts(k); return { key: k, label: ds[0]?.score.parts.find((p) => p.key === k)?.label ?? k, rate: ps.length ? Math.round((ps.filter((p) => p.achieved).length / ps.length) * 100) : null, avgValue: ps.length ? Math.round(avg(ps.map((p) => p.value)) * 100) : null, weight: ds[0]?.score.parts.find((p) => p.key === k)?.weight ?? 0 }; });
      return {
        days: ds.length, score: Math.round(avg(ds.map((d) => d.score.score))), workouts: wk.length, planned,
        volume: Math.round(wk.reduce((a, w) => a + Number(w.total_volume || 0), 0)),
        calories: Math.round(avg(nutDays.map((d) => d.score.totals.calories))), protein: Math.round(avg(nutDays.map((d) => d.score.totals.protein))), nutDays: nutDays.length,
        water: Math.round(avg(ds.map((d) => d.score.totals.water))), walk: avg(ds.map((d) => walkDistance(data.activity.filter((a) => a.date === d.date)))),
        sleep: avg(sleepD.map((s) => s.duration_min / 60)), sleepDays: sleepD.length,
        habits: habitSched ? Math.round((habitDone / habitSched) * 100) : null, contrib,
      };
    };
    return { cur: build(start, end), prev: build(prevStart, addDays(start, -1)) };
  }, [scores, data, start, end, prevStart]);

  const weight = useMemo(() => {
    const pts = m.rows.filter((r) => r.weight_kg != null).map((r) => ({ date: r.date, value: Number(r.weight_kg) }));
    const inCur = pts.filter((p) => p.date >= start && p.date <= end);
    return { trend: trendPerWeek(inCur), series: rollingAverage(pts, 7).filter((p) => p.date >= prevStart) };
  }, [m.rows, start, end, prevStart]);

  const daily = useMemo(() => scores.filter((s) => s.date >= start).map((s) => ({ date: s.date, score: s.score.score, calories: data.nutrition.some((n) => n.date === s.date) ? s.score.totals.calories : null })), [scores, start, data.nutrition]);
  const weekly = useMemo(() => {
    const out: { week: string; workouts: number; avgWeight: number | null }[] = [];
    for (let w = startOfWeekKey(addDays(t, -83)); w <= t; w = addDays(w, 7)) {
      const ws = m.rows.filter((r) => r.weight_kg != null && r.date >= w && r.date < addDays(w, 7));
      out.push({ week: w, workouts: data.workouts.filter((x) => x.status === "completed" && x.date >= w && x.date < addDays(w, 7)).length, avgWeight: ws.length ? Math.round(avg(ws.map((r) => Number(r.weight_kg))) * 10) / 10 : null });
    }
    return out;
  }, [m.rows, data.workouts, t]);

  if (!profile) return null;
  const { cur, prev } = rep;
  const weakest = cur.contrib.filter((c) => c.rate != null && c.weight > 0).sort((a, b) => (a.rate! - b.rate!) || b.weight - a.weight).slice(0, 2);
  const U = wUnit(profile);
  const summary = [
    `${cur.workouts} of ${cur.planned} planned workouts completed`,
    cur.nutDays ? `averaged ${cur.calories} kcal and ${cur.protein} g protein on ${cur.nutDays} logged day${cur.nutDays > 1 ? "s" : ""}` : "no nutrition logged",
    cur.sleepDays ? `slept ${cur.sleep} h on average (${cur.sleepDays} nights logged)` : "no sleep logged",
    weight.trend != null ? `weight trending ${weight.trend > 0 ? "up" : weight.trend < 0 ? "down" : "flat"} ${Math.abs(wOut(weight.trend, profile) ?? 0)} ${U}/week` : null,
  ].filter(Boolean).join("; ");

  return (
    <div className="anim-rise">
      <PageHeader title="Analytics" sub={`${period === "week" ? "Last 7" : "Last 30"} completed days vs the ${period === "week" ? "7" : "30"} before. Missing logs count as missed.`} action={<Segmented size="sm" value={period} onChange={setPeriod} options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} />} />

      <Card className="hero-grad mb-4 p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Ring value={cur.score / 100} size={128} stroke={11}><div><div className="num font-display text-4xl font-semibold">{cur.score}</div><div className="text-[11px] uppercase tracking-wider text-faint">Fitness score</div></div></Ring>
          <div className="flex-1">
            <div className="flex items-center gap-2"><Delta a={cur.score} b={prev.score} /><span className="text-sm text-muted">vs previous {period} ({prev.score})</span></div>
            <p className="mt-2 text-[15px] leading-relaxed">{summary.charAt(0).toUpperCase() + summary.slice(1)}.</p>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-faint"><Info className="mt-0.5 size-3.5 shrink-0" />Score = weighted average of daily target completion (weights editable in Settings). Rest days exclude the workout component.</p>
          </div>
        </div>
      </Card>

      <Section title="What's driving the score">
        <Card className="p-4 sm:p-5">
          <div className="space-y-3">
            {cur.contrib.map((c) => { const p = prev.contrib.find((x) => x.key === c.key); return (
              <div key={c.key} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 sm:grid-cols-[140px_1fr_120px]">
                <div className="text-sm font-medium">{c.label}<span className="ml-1 text-xs text-faint">×{c.weight}</span></div>
                <Bar value={(c.rate ?? 0) / 100} color={c.rate == null ? "var(--line)" : (c.rate ?? 0) >= 80 ? "var(--good)" : (c.rate ?? 0) >= 50 ? "var(--warm)" : "var(--bad)"} height={8} />
                <div className="num flex items-center justify-end gap-2 text-sm">{c.rate == null ? <span className="text-faint">n/a</span> : <><span className="font-semibold">{c.rate}%</span>{p?.rate != null && <Delta a={c.rate} b={p.rate} small />}</>}</div>
              </div>
            ); })}
          </div>
          <p className="mt-3 text-xs text-faint">% of days the target was fully met.</p>
        </Card>
        {weakest.length > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2">{weakest.map((w) => <Card key={w.key} className="flex gap-3 p-4"><Lightbulb className="size-5 shrink-0 text-warm" /><div><div className="text-sm font-semibold">Biggest lever: {w.label.toLowerCase()} ({w.rate}%)</div><p className="mt-0.5 text-sm text-muted">{TIPS[w.key]}</p></div></Card>)}</div>}
      </Section>

      <Section title={period === "week" ? "Weekly report" : "Monthly report"}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Workouts" v={`${cur.workouts}/${cur.planned}`} a={cur.workouts} b={prev.workouts} sub="done / planned" />
          <Stat label="Training volume" v={`${(cur.volume / 1000).toFixed(1)} t`} a={cur.volume} b={prev.volume} />
          <Stat label="Avg calories" v={cur.nutDays ? cur.calories : "—"} a={cur.calories} b={prev.calories} sub={`target ${profile.calorie_target}`} neutral />
          <Stat label="Avg protein" v={cur.nutDays ? `${cur.protein} g` : "—"} a={cur.protein} b={prev.protein} sub={`target ${profile.protein_target} g`} />
          <Stat label="Avg water" v={`${(cur.water / 1000).toFixed(1)} L`} a={cur.water} b={prev.water} sub={`target ${(profile.water_target_ml / 1000).toFixed(1)} L`} />
          <Stat label="Avg walking" v={`${cur.walk} km`} a={cur.walk} b={prev.walk} sub={`target ${profile.walk_target_km} km`} />
          <Stat label="Avg sleep" v={cur.sleepDays ? `${cur.sleep} h` : "—"} a={cur.sleep} b={prev.sleep} sub={`${cur.sleepDays} nights logged`} />
          <Stat label="Habit completion" v={cur.habits != null ? `${cur.habits}%` : "—"} a={cur.habits ?? 0} b={prev.habits ?? 0} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Daily score" height={190}><BarSeries data={daily} x="date" y="score" name="Score" colorFn={(r) => (Number(r.score) >= 80 ? "var(--good)" : Number(r.score) >= 50 ? "var(--warm)" : "var(--muted)")} /></ChartFrame>
        <ChartFrame title={`Weight, 7-day average (${U})`} sub={weight.trend != null ? `${weight.trend > 0 ? "+" : ""}${wOut(weight.trend, profile)} ${U}/wk` : undefined} height={190}>
          {weight.series.length > 1 ? <LineSeries data={weight.series.map((p) => ({ date: p.date, avg: wOut(p.avg, profile) }))} x="date" unit={U} lines={[{ key: "avg", name: "7-day avg", color: "var(--good)" }]} /> : <div className="grid h-full place-items-center text-sm text-faint">Not enough weigh-ins.</div>}
        </ChartFrame>
      </div>
      <Section title="Calories vs weight" className="mt-6">
        <p className="mb-3 text-sm text-muted">Shown as two aligned charts (not one dual-axis chart) so neither scale distorts the other.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="Calories (logged days)" height={170}><BarSeries data={daily} x="date" y="calories" name="Calories" unit="kcal" target={profile.calorie_target} color="var(--warm)" /></ChartFrame>
          <ChartFrame title={`Weight trend (${U})`} height={170}>{weight.series.filter((p) => p.date >= start).length > 1 ? <LineSeries data={weight.series.filter((p) => p.date >= start).map((p) => ({ date: p.date, avg: wOut(p.avg, profile) }))} x="date" unit={U} lines={[{ key: "avg", name: "7-day avg", color: "var(--good)" }]} /> : <div className="grid h-full place-items-center text-sm text-faint">Not enough weigh-ins.</div>}</ChartFrame>
        </div>
      </Section>
      <Section title="Workout consistency vs progress (12 weeks)" className="mt-2">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="Workouts per week" height={170}><BarSeries data={weekly} x="week" y="workouts" name="Workouts" color="var(--warm)" /></ChartFrame>
          <ChartFrame title={`Weekly average weight (${U})`} height={170}>{weekly.filter((w) => w.avgWeight != null).length > 1 ? <LineSeries data={weekly.map((w) => ({ week: w.week, w: w.avgWeight != null ? wOut(w.avgWeight, profile) : null }))} x="week" unit={U} lines={[{ key: "w", name: "Avg weight", color: "var(--good)", dot: true }]} /> : <div className="grid h-full place-items-center text-sm text-faint">Not enough weigh-ins.</div>}</ChartFrame>
        </div>
      </Section>
    </div>
  );
}

function Delta({ a, b, small }: { a: number; b: number; small?: boolean }) {
  const d = Math.round((a - b) * 10) / 10;
  const I = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus;
  return <span className={cx("num inline-flex items-center gap-0.5 font-semibold", small ? "text-xs" : "text-sm", d > 0 ? "text-good" : d < 0 ? "text-bad" : "text-faint")}><I className={small ? "size-3" : "size-4"} />{Math.abs(d)}</span>;
}

function Stat({ label, v, a, b, sub, neutral }: { label: string; v: React.ReactNode; a: number; b: number; sub?: string; neutral?: boolean }) {
  return <Card className="p-4"><Metric label={label} value={v} sub={sub} /><div className="mt-1 flex items-center gap-1 text-xs text-faint">{neutral ? <span className="num">prev {b}</span> : <><Delta a={a} b={b} small /><span>vs prev</span></>}</div></Card>;
}

