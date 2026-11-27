"use client";
import { BedDouble, HeartPulse, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, avg, readiness, sleepConsistency } from "@/lib/calc";
import { deleteById, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { RecoveryLog, SleepLog } from "@/lib/types";
import { fmtMin } from "@/lib/units";
import { BarSeries, ChartFrame, LineSeries, Legend } from "@/components/charts";
import { CheckInSheet, SleepSheet } from "@/components/loggers";
import { Badge, Button, Card, cx, IconButton, Metric, PageHeader, Section, useAction } from "@/components/ui";

export default function SleepPage() {
  const act = useAction();
  const { profile } = useProfile();
  const t = today();
  const from = addDays(t, -29);
  const sleep = useRows<SleepLog>({ table: "sleep_logs", filters: [["date", "gte", from]], order: [["date", true]] });
  const rec = useRows<RecoveryLog>({ table: "recovery_logs", filters: [["date", "gte", from]], order: [["date", true]] });
  const [edit, setEdit] = useState<SleepLog | null | "new">(null);
  const [checkin, setCheckin] = useState(false);
  const series = useMemo(() => { const out = []; for (let k = from; k <= t; k = addDays(k, 1)) { const s = sleep.rows.find((x) => x.date === k); out.push({ date: k, hours: s ? Math.round((s.duration_min / 60) * 10) / 10 : null }); } return out; }, [sleep.rows, from, t]);
  if (!profile) return null;
  const target = Number(profile.sleep_target_hours);
  const last7 = sleep.rows.filter((s) => s.date > addDays(t, -7));
  const avg7 = avg(last7.map((s) => s.duration_min / 60));
  const debt = Math.round(last7.reduce((a, s) => a + (s.duration_min / 60 - target), 0) * 10) / 10;
  const cons = sleepConsistency(last7);
  const todayRec = rec.rows.find((r) => r.date === t);
  const lastNight = sleep.rows.find((s) => s.date === t);
  const ready = readiness(todayRec, lastNight ? lastNight.duration_min / 60 : null, target);
  const recSeries = rec.rows.map((r) => ({ date: r.date, readiness: readiness(r, (sleep.rows.find((s) => s.date === r.date)?.duration_min ?? 0) / 60 || null, target)?.score ?? null, energy: r.energy, soreness: r.soreness }));

  return (
    <div className="anim-rise">
      <PageHeader title="Sleep & recovery" sub={`Target ${target} h · bedtime ${profile.bedtime_target.slice(0, 5)}`} action={<Button variant="good" onClick={() => setEdit("new")} icon={<BedDouble className="size-4" />}>Log sleep</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric label="Last night" value={lastNight ? fmtMin(lastNight.duration_min) : "—"} sub={lastNight?.quality ? `quality ${lastNight.quality}/5` : "not logged"} /></Card>
        <Card className="p-4"><Metric label="7-day average" value={avg7 || "—"} unit={avg7 ? "h" : ""} tone={avg7 >= target - 0.25 ? "good" : avg7 ? "warm" : undefined} /></Card>
        <Card className="p-4"><Metric label={debt >= 0 ? "7-day surplus" : "7-day deficit"} value={`${debt > 0 ? "+" : ""}${debt}`} unit="h" tone={debt >= 0 ? "good" : debt < -3 ? "bad" : "warm"} sub={`vs ${target}h × ${last7.length} logged nights`} /></Card>
        <Card className="p-4"><Metric label="Bedtime consistency" value={cons ?? "—"} unit={cons != null ? "/100" : ""} sub="based on bedtime spread" /></Card>
      </div>
      <ChartFrame title="Sleep duration, 30 days (dashed = target)" height={200}><BarSeries data={series} x="date" y="hours" name="Sleep" unit="h" target={target} colorFn={(r) => (Number(r.hours) >= target - 0.25 ? "var(--violet)" : "var(--muted)")} /></ChartFrame>

      <Section title="Recovery" className="mt-6" action={<Button size="sm" onClick={() => setCheckin(true)} icon={<HeartPulse className="size-4" />}>{todayRec ? "Update check-in" : "Check in"}</Button>}>
        <Card className="p-4 sm:p-5">
          {ready ? (
            <div className="flex items-center gap-4">
              <div className={cx("num grid size-16 shrink-0 place-items-center rounded-2xl text-2xl font-semibold", ready.status === "normal" ? "bg-good-soft text-good" : ready.status === "lighter" ? "bg-warm-soft text-warm" : "bg-bad-soft text-bad")}>{ready.score}</div>
              <div><div className="text-lg font-semibold">{ready.label}</div><p className="text-sm text-muted">{ready.advice}</p></div>
            </div>
          ) : <p className="text-sm text-muted">No check-in today. Rate energy, soreness, stress and motivation to get a training recommendation (normal, lighter or recovery). This is a self-assessment guide, not a medical evaluation.</p>}
        </Card>
        {recSeries.length > 1 && <div className="mt-4"><ChartFrame title="Readiness & inputs" right={<Legend items={[{ label: "Readiness", color: "var(--good)" }, { label: "Energy ×10", color: "var(--warm)", dashed: true }, { label: "Soreness ×10", color: "var(--bad)", dashed: true }]} />} height={200}>
          <LineSeries data={recSeries.map((r) => ({ ...r, energy: r.energy != null ? r.energy * 10 : null, soreness: r.soreness != null ? r.soreness * 10 : null }))} x="date" domain={[0, 100]} lines={[{ key: "readiness", name: "Readiness", color: "var(--good)", dot: true }, { key: "energy", name: "Energy ×10", color: "var(--warm)", dashed: true }, { key: "soreness", name: "Soreness ×10", color: "var(--bad)", dashed: true }]} />
        </ChartFrame></div>}
      </Section>

      <Section title="Sleep log" className="mt-6">
        {sleep.rows.length ? <Card className="divide-y divide-line">{[...sleep.rows].reverse().map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{new Date(`${s.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}{s.is_demo && <Badge className="ml-2">Demo</Badge>}</div>
              <div className="num text-xs text-faint">{new Date(s.bedtime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} → {new Date(s.wake_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{s.quality ? ` · quality ${s.quality}/5` : ""}{s.refreshed ? ` · refreshed ${s.refreshed}/5` : ""}{s.notes ? ` · ${s.notes}` : ""}</div>
            </div>
            <span className={cx("num font-semibold", s.duration_min / 60 >= target - 0.25 ? "text-good" : "text-fg")}>{fmtMin(s.duration_min)}</span>
            <IconButton label="Edit" onClick={() => setEdit(s)}><Pencil className="size-4" /></IconButton>
            <IconButton label="Delete" onClick={() => act(() => deleteById("sleep_logs", s.id), "Removed")}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}</Card> : <p className="text-sm text-muted">No sleep logged yet.</p>}
      </Section>
      <SleepSheet key={edit === "new" ? "new" : edit?.id} open={!!edit} onClose={() => setEdit(null)} existing={edit && edit !== "new" ? edit : undefined} />
      <CheckInSheet key={todayRec?.id ?? "c"} open={checkin} onClose={() => setCheckin(false)} existing={todayRec} />
    </div>
  );
}
