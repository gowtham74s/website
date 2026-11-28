"use client";
import { BedDouble, HeartPulse, Moon, Pencil, Trash2, Upload, Wind, Droplet } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, avg, readiness, sleepConsistency } from "@/lib/calc";
import { deleteById, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { RecoveryLog, SleepLog } from "@/lib/types";
import { fmtMin } from "@/lib/units";
import { BarSeries, ChartFrame, Legend, LineSeries, StackSeries } from "@/components/charts";
import { CheckInSheet, SleepSheet } from "@/components/loggers";
import { SamsungImportSheet } from "@/components/samsung-import";
import { SLEEP_COLORS, StageBar, hasStages } from "@/components/sleep-viz";
import { Badge, Button, Card, cx, IconButton, Metric, PageHeader, Ring, Section, Segmented, useAction } from "@/components/ui";
const t12 = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function SleepPage() {
  const act = useAction();
  const { profile } = useProfile();
  const t = today();
  const [span, setSpan] = useState<"30" | "90">("30");
  const from = addDays(t, -(Number(span) - 1));
  const sleep = useRows<SleepLog>({ table: "sleep_logs", filters: [["date", "gte", addDays(t, -89)]], order: [["date", true]] });
  const rec = useRows<RecoveryLog>({ table: "recovery_logs", filters: [["date", "gte", addDays(t, -29)]], order: [["date", true]] });
  const [edit, setEdit] = useState<SleepLog | null | "new">(null);
  const [checkin, setCheckin] = useState(false);
  const [importing, setImporting] = useState(false);
  const inSpan = sleep.rows.filter((s) => s.date >= from);
  const series = useMemo(() => {
    const out = [];
    for (let k = from; k <= t; k = addDays(k, 1)) {
      const s = sleep.rows.find((x) => x.date === k);
      const h = (m: number | null | undefined) => (m != null ? Math.round((m / 60) * 10) / 10 : null);
      out.push({ date: k, hours: s ? h(s.duration_min) : null, deep: s && hasStages(s) ? h(s.deep_min) : null, light: s && hasStages(s) ? h(s.light_min) : null, rem: s && hasStages(s) ? h(s.rem_min) : null, awake: s && hasStages(s) ? h(s.awake_min) : null, other: s && !hasStages(s) ? h(s.duration_min) : null, score: s?.score ?? null, spo2: s?.spo2_avg != null ? Number(s.spo2_avg) : null, spo2min: s?.spo2_min != null ? Number(s.spo2_min) : null, snore: s?.snoring_min ?? null });
    }
    return out;
  }, [sleep.rows, from, t]);
  if (!profile) return null;

  const target = Number(profile.sleep_target_hours);
  const last = [...sleep.rows].reverse()[0];
  const last7 = sleep.rows.filter((s) => s.date > addDays(t, -7));
  const avg7 = avg(last7.map((s) => s.duration_min / 60));
  const debt = Math.round(last7.reduce((a, s) => a + (s.duration_min / 60 - target), 0) * 10) / 10;
  const cons = sleepConsistency(last7);
  const scores = inSpan.map((s) => s.score).filter((x): x is number => x != null);
  const staged = inSpan.filter(hasStages);
  const stageAvg = (k: "deep_min" | "rem_min" | "light_min" | "awake_min") => Math.round(avg(staged.map((s) => Number(s[k] ?? 0))));
  const snoreNights = inSpan.filter((s) => (s.snoring_min ?? 0) > 0);
  const spo2Nights = inSpan.filter((s) => s.spo2_avg != null);
  const todayRec = rec.rows.find((r) => r.date === t);
  const lastNight = sleep.rows.find((s) => s.date === t);
  const ready = readiness(todayRec, lastNight ? lastNight.duration_min / 60 : null, target);
  const recSeries = rec.rows.map((r) => ({ date: r.date, readiness: readiness(r, (sleep.rows.find((s) => s.date === r.date)?.duration_min ?? 0) / 60 || null, target)?.score ?? null, energy: r.energy != null ? r.energy * 10 : null, soreness: r.soreness != null ? r.soreness * 10 : null }));
  const stageSeries = [{ key: "deep", name: "Deep", color: SLEEP_COLORS.deep }, { key: "light", name: "Light", color: SLEEP_COLORS.light }, { key: "rem", name: "REM", color: SLEEP_COLORS.rem }, { key: "awake", name: "Awake", color: SLEEP_COLORS.awake }, { key: "other", name: "No stage data", color: "var(--muted)" }];

  return (
    <div className="anim-rise">
      <PageHeader title="Sleep & recovery" sub={`Target ${target} h · bedtime ${profile.bedtime_target.slice(0, 5)}`} action={<>
        <Button size="sm" onClick={() => setImporting(true)} icon={<Upload className="size-4" />}><span className="hidden sm:inline">Import</span></Button>
        <Button size="sm" variant="good" onClick={() => setEdit("new")} icon={<BedDouble className="size-4" />}>Log sleep</Button>
      </>} />

      {/* last night */}
      {last ? (
        <Card className="hero-grad mb-4 p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              {last.score != null ? (
                <Ring value={last.score / 100} size={110} stroke={10} color={last.score >= 70 ? "var(--good)" : last.score >= 50 ? "var(--warm)" : "var(--bad)"}>
                  <div><div className="num font-display text-3xl font-semibold">{last.score}</div><div className="text-[10px] uppercase tracking-wider text-faint">Sleep score</div></div>
                </Ring>
              ) : <div className="grid size-[110px] place-items-center rounded-full bg-card-2"><Moon className="size-8 text-violet" /></div>}
              <div className="sm:hidden"><div className="num font-display text-3xl font-semibold">{fmtMin(last.duration_min)}</div><div className="text-sm text-faint">{last.date === t ? "Last night" : new Date(`${last.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="hidden items-baseline gap-2 sm:flex"><span className="num font-display text-4xl font-semibold">{fmtMin(last.duration_min)}</span><span className="text-sm text-faint">{last.date === t ? "last night" : new Date(`${last.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{last.source === "samsung" && " · Samsung Health"}</span></div>
              <div className="num mt-1 text-sm text-muted">{t12(last.bedtime)} → {t12(last.wake_time)}{(last.sessions ?? 1) > 1 ? ` · ${last.sessions} sessions` : ""} · {last.duration_min / 60 >= target - 0.25 ? <span className="text-good">target met</span> : <span className="text-warm">{fmtMin(Math.round(target * 60 - last.duration_min))} short</span>}</div>
              {hasStages(last) && <div className="mt-4"><StageBar s={last} /></div>}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-5">
            <Metric label="Efficiency" value={last.efficiency != null ? `${Math.round(Number(last.efficiency))}%` : "—"} sub="time asleep in bed" />
            <Metric label="Snoring" value={last.snoring_min != null ? fmtMin(last.snoring_min) : "—"} sub={last.snoring_min != null ? (last.snoring_min ? "detected" : "none detected") : "not recorded"} />
            <Metric label="Blood oxygen" value={last.spo2_avg != null ? `${Number(last.spo2_avg)}%` : "—"} sub={last.spo2_min != null ? `lowest ${Number(last.spo2_min)}%` : "not recorded"} tone={last.spo2_min != null && Number(last.spo2_min) < 90 ? "warm" : undefined} />
            <Metric label="Physical recovery" value={last.physical_recovery != null ? Math.round(Number(last.physical_recovery)) : "—"} sub="Samsung, 0–100" />
            <Metric label="Mental recovery" value={last.mental_recovery != null ? Math.round(Number(last.mental_recovery)) : "—"} sub="Samsung, 0–100" />
          </div>
          {last.quality != null && <p className="mt-3 text-xs text-faint">Your rating: quality {last.quality}/5{last.refreshed ? ` · refreshed ${last.refreshed}/5` : ""}</p>}
        </Card>
      ) : (
        <Card className="mb-4 p-6 text-center">
          <Moon className="mx-auto mb-2 size-8 text-violet" />
          <div className="font-medium">No sleep logged yet</div>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Log last night in 10 seconds, or import your watch&apos;s sleep (stages, score, snoring and blood oxygen) from Samsung Health.</p>
          <div className="mt-4 flex justify-center gap-2"><Button variant="good" onClick={() => setEdit("new")}>Log sleep</Button><Button onClick={() => setImporting(true)} icon={<Upload className="size-4" />}>Import</Button></div>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric label="7-day average" value={avg7 || "—"} unit={avg7 ? "h" : ""} tone={avg7 >= target - 0.25 ? "good" : avg7 ? "warm" : undefined} sub={`${last7.length} nights logged`} /></Card>
        <Card className="p-4"><Metric label={debt >= 0 ? "7-day surplus" : "7-day deficit"} value={`${debt > 0 ? "+" : ""}${debt}`} unit="h" tone={debt >= 0 ? "good" : debt < -3 ? "bad" : "warm"} sub={`vs ${target}h target`} /></Card>
        <Card className="p-4"><Metric label="Avg sleep score" value={scores.length ? Math.round(avg(scores)) : "—"} sub={scores.length ? `${scores.length} scored nights` : "needs watch data"} /></Card>
        <Card className="p-4"><Metric label="Bedtime consistency" value={cons ?? "—"} unit={cons != null ? "/100" : ""} sub="spread of bedtimes" /></Card>
      </div>

      <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Trends</h2><Segmented size="sm" value={span} onChange={setSpan} options={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} /></div>
      <ChartFrame title="Sleep by stage (hours, dashed = target)" right={<Legend items={[{ label: "Deep", color: SLEEP_COLORS.deep }, { label: "Light", color: SLEEP_COLORS.light }, { label: "REM", color: SLEEP_COLORS.rem }, { label: "Awake", color: SLEEP_COLORS.awake }]} />} height={220}>
        <StackSeries data={series} x="date" unit="h" target={target} series={stageSeries} />
      </ChartFrame>
      {staged.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {([["deep_min", "Avg deep", SLEEP_COLORS.deep], ["light_min", "Avg light", SLEEP_COLORS.light], ["rem_min", "Avg REM", SLEEP_COLORS.rem], ["awake_min", "Avg awake", SLEEP_COLORS.awake]] as const).map(([k, l, c]) => (
            <Card key={k} className="flex items-center gap-3 p-3"><span className="h-8 w-1.5 rounded-full" style={{ background: c }} /><Metric label={l} value={fmtMin(stageAvg(k))} sub={`${staged.length} nights`} /></Card>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Sleep score" height={180}>
          {scores.length > 1 ? <LineSeries gaps data={series} x="date" domain={[0, 100]} lines={[{ key: "score", name: "Score", color: "var(--good)", dot: true }]} /> : <div className="grid h-full place-items-center text-sm text-faint">Import watch sleep to see your score trend.</div>}
        </ChartFrame>
        <ChartFrame title={<span className="flex items-center gap-1.5"><Droplet className="size-3.5" />Overnight blood oxygen (%)</span>} right={<Legend items={[{ label: "Average", color: "var(--cyan)" }, { label: "Lowest", color: "var(--warm)", dashed: true }]} />} height={180}>
          {spo2Nights.length > 0 ? <LineSeries gaps data={series} x="date" unit="%" domain={[75, 100]} lines={[{ key: "spo2", name: "Average", color: "var(--cyan)", dot: true }, { key: "spo2min", name: "Lowest", color: "var(--warm)", dashed: true, dot: true }]} /> : <div className="grid h-full place-items-center text-sm text-faint">No overnight SpO₂ in this period.</div>}
        </ChartFrame>
      </div>
      <div className="mt-4">
        <ChartFrame title={<span className="flex items-center gap-1.5"><Wind className="size-3.5" />Snoring (minutes per night)</span>} sub={snoreNights.length ? `${snoreNights.length} of ${inSpan.length} nights` : undefined} height={150}>
          {inSpan.some((s) => s.snoring_min != null) ? <BarSeries data={series} x="date" y="snore" name="Snoring" unit="min" color="var(--warm)" /> : <div className="grid h-full place-items-center text-sm text-faint">Snoring is detected by your phone when Samsung Health snore detection is on.</div>}
        </ChartFrame>
      </div>
      {spo2Nights.some((s) => Number(s.spo2_min) < 90) && <p className="mt-2 text-xs text-faint">Readings below 90% can be measurement noise from a loose band. If low readings are frequent or you feel unrested, talk to a doctor — this app doesn&apos;t diagnose.</p>}

      <Section title="Recovery" className="mt-6" action={<Button size="sm" onClick={() => setCheckin(true)} icon={<HeartPulse className="size-4" />}>{todayRec ? "Update check-in" : "Check in"}</Button>}>
        <Card className="p-4 sm:p-5">
          {ready ? (
            <div className="flex items-center gap-4">
              <div className={cx("num grid size-16 shrink-0 place-items-center rounded-2xl text-2xl font-semibold", ready.status === "normal" ? "bg-good-soft text-good" : ready.status === "lighter" ? "bg-warm-soft text-warm" : "bg-bad-soft text-bad")}>{ready.score}</div>
              <div><div className="text-lg font-semibold">{ready.label}</div><p className="text-sm text-muted">{ready.advice}</p></div>
            </div>
          ) : <p className="text-sm text-muted">No check-in today. Rate energy, soreness, stress and motivation to get a training recommendation. This is a self-assessment guide, not a medical evaluation.</p>}
        </Card>
        {recSeries.length > 1 && <div className="mt-4"><ChartFrame title="Readiness & inputs" right={<Legend items={[{ label: "Readiness", color: "var(--good)" }, { label: "Energy ×10", color: "var(--warm)", dashed: true }, { label: "Soreness ×10", color: "var(--bad)", dashed: true }]} />} height={200}>
          <LineSeries data={recSeries} x="date" domain={[0, 100]} lines={[{ key: "readiness", name: "Readiness", color: "var(--good)", dot: true }, { key: "energy", name: "Energy ×10", color: "var(--warm)", dashed: true }, { key: "soreness", name: "Soreness ×10", color: "var(--bad)", dashed: true }]} />
        </ChartFrame></div>}
      </Section>

      <Section title="Nights" className="mt-6">
        {sleep.rows.length ? <Card className="divide-y divide-line">{[...sleep.rows].reverse().slice(0, 60).map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-sm font-medium">{new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{s.score != null && <Badge tone={s.score >= 70 ? "good" : s.score >= 50 ? "warm" : "bad"}>score {s.score}</Badge>}{s.is_demo && <Badge>Demo</Badge>}</div>
              <div className="num text-xs text-faint">{t12(s.bedtime)} → {t12(s.wake_time)}{s.deep_min != null ? ` · deep ${fmtMin(s.deep_min)} · REM ${fmtMin(s.rem_min ?? 0)}` : ""}{s.snoring_min ? ` · snoring ${s.snoring_min}m` : ""}{s.spo2_avg != null ? ` · SpO₂ ${Number(s.spo2_avg)}%` : ""}{s.quality ? ` · quality ${s.quality}/5` : ""}</div>
              {hasStages(s) && <div className="mt-1.5 max-w-xs"><StageBar s={s} compact /></div>}
            </div>
            <span className={cx("num font-semibold", s.duration_min / 60 >= target - 0.25 ? "text-good" : "text-fg")}>{fmtMin(s.duration_min)}</span>
            <IconButton label="Edit" onClick={() => setEdit(s)}><Pencil className="size-4" /></IconButton>
            <IconButton label="Delete" onClick={() => act(() => deleteById("sleep_logs", s.id), "Removed")}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}</Card> : <p className="text-sm text-muted">No sleep logged yet.</p>}
      </Section>
      <SleepSheet key={edit === "new" ? "new" : edit?.id} open={!!edit} onClose={() => setEdit(null)} existing={edit && edit !== "new" ? edit : undefined} />
      <CheckInSheet key={todayRec?.id ?? "c"} open={checkin} onClose={() => setCheckin(false)} existing={todayRec} />
      <SamsungImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
