"use client";
import { Bell, Droplets, Flame, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { addDays, remaining } from "@/lib/calc";
import { deleteById, insertRows, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { HydrationLog } from "@/lib/types";
import { vol, volIn } from "@/lib/units";
import { BarSeries, ChartFrame } from "@/components/charts";
import { useAddWater } from "@/components/loggers";
import { Button, Card, IconButton, Input, Metric, PageHeader, Ring, Section, useAction } from "@/components/ui";

export default function Page() { return <Suspense><Hydration /></Suspense>; }

function Hydration() {
  const sp = useSearchParams();
  const act = useAction();
  const { profile } = useProfile();
  const addWater = useAddWater();
  const t = today();
  const from = addDays(t, -29);
  const logs = useRows<HydrationLog>({ table: "hydration_logs", filters: [["date", "gte", from]], order: [["logged_at", true]] });
  const [custom, setCustom] = useState("");
  const did = useRef(false);
  useEffect(() => { const a = Number(sp.get("add")); if (a && !did.current) { did.current = true; addWater(a); } }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const todays = logs.rows.filter((l) => l.date === t);
  const total = todays.reduce((a, l) => a + l.amount_ml, 0);
  const daily = useMemo(() => { const out = []; for (let k = from; k <= t; k = addDays(k, 1)) out.push({ date: k, ml: logs.rows.filter((l) => l.date === k).reduce((a, l) => a + l.amount_ml, 0) }); return out; }, [logs.rows, from, t]);
  if (!profile) return null;
  const target = profile.water_target_ml;
  let streak = 0; for (let i = daily.length - 2; i >= 0 && daily[i].ml >= target; i--) streak++;
  if (total >= target) streak++;
  const hours = Array.from({ length: 18 }, (_, i) => i + 6).map((h) => ({ hour: `${h}:00`, ml: todays.filter((l) => new Date(l.logged_at).getHours() === h).reduce((a, l) => a + l.amount_ml, 0) }));
  const past = daily.slice(0, -1).filter((d) => d.ml > 0);
  const avg7 = past.slice(-7).reduce((a, d) => a + d.ml, 0) / Math.max(1, past.slice(-7).length);

  return (
    <div className="anim-rise">
      <PageHeader title="Hydration" sub={`Target ${vol(target, profile)} a day`} action={<Link href="/settings#reminders"><Button size="sm" icon={<Bell className="size-4" />}>Reminders</Button></Link>} />
      <Card className="mb-4 p-5">
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Ring value={total / target} size={180} stroke={14} color="var(--cyan)">
            <div><Droplets className="mx-auto mb-1 size-5 text-cyan" /><div className="num font-display text-4xl font-semibold">{vol(total, profile)}</div><div className="text-sm text-faint">of {vol(target, profile)}</div></div>
          </Ring>
          <div className="w-full flex-1">
            <div className="mb-4 grid grid-cols-3 gap-3"><Metric label="Remaining" value={vol(remaining(target, total), profile)} /><Metric label="Streak" value={<span className="flex items-center gap-1"><Flame className="size-4 text-warm" />{streak}</span>} unit="days" /><Metric label="7-day avg" value={vol(Math.round(avg7), profile)} /></div>
            <div className="grid grid-cols-3 gap-2">{[250, 500, 750].map((ml) => <Button key={ml} size="xl" onClick={() => addWater(ml)} className="num text-base">+{ml} ml</Button>)}</div>
            <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = Number(custom); if (v > 0) { addWater(Math.round(volIn(v, profile))); setCustom(""); } }}>
              <Input inputMode="decimal" placeholder={`Custom amount (${profile.unit_volume})`} value={custom} onChange={(e) => setCustom(e.target.value)} /><Button type="submit">Add</Button>
            </form>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Today by hour" height={180}><BarSeries data={hours} x="hour" y="ml" name="Water" unit="ml" color="var(--cyan)" xFmt={(v) => v.replace(":00", "")} /></ChartFrame>
        <ChartFrame title="Last 30 days (dashed = target)" height={180}><BarSeries data={daily} x="date" y="ml" name="Water" unit="ml" target={target} colorFn={(r) => (Number(r.ml) >= target ? "var(--good)" : "var(--cyan)")} /></ChartFrame>
      </div>
      <Section title="Today's timeline" className="mt-6">
        {todays.length ? <Card className="divide-y divide-line">{[...todays].reverse().map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-2.5"><Droplets className="size-4 text-cyan" /><span className="num flex-1 text-sm">{new Date(l.logged_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span className="num font-semibold">{vol(l.amount_ml, profile)}</span><IconButton label="Delete" onClick={() => act(() => deleteById("hydration_logs", l.id), "Removed", () => insertRows("hydration_logs", { ...l }))}><Trash2 className="size-4" /></IconButton></div>
        ))}</Card> : <p className="text-sm text-muted">No water logged yet today. One tap above logs a glass.</p>}
      </Section>
    </div>
  );
}
