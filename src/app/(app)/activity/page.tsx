"use client";
import { Flame, Footprints, MapPin, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { activeCalories, addDays, avg, estimateActiveCalories, remaining, startOfWeekKey, totalSteps, walkDistance } from "@/lib/calc";
import { deleteById, insertRows, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { ActivityLog } from "@/lib/types";
import { fmtMin, fmtSec } from "@/lib/units";
import { BarSeries, ChartFrame } from "@/components/charts";
import { ActivitySheet } from "@/components/loggers";
import { SamsungImportCard } from "@/components/samsung-import";
import { Badge, Bar, Button, Card, IconButton, Metric, PageHeader, Section, Sheet, Stepper, useAction, useToast } from "@/components/ui";

export default function Page() { return <Suspense><ActivityPage /></Suspense>; }

const hav = (a: GeolocationCoordinates, b: GeolocationCoordinates) => {
  const R = 6371, toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b.latitude - a.latitude), dLon = toR(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.latitude)) * Math.cos(toR(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function ActivityPage() {
  const sp = useSearchParams();
  const act = useAction();
  const { profile } = useProfile();
  const t = today();
  const from = addDays(t, -55);
  const logs = useRows<ActivityLog>({ table: "activity_logs", filters: [["date", "gte", from]], order: [["logged_at", false]] });
  const [manual, setManual] = useState(false);
  const [walk, setWalk] = useState(sp.get("walk") === "1");
  const daily = useMemo(() => { const out = []; for (let k = addDays(t, -27); k <= t; k = addDays(k, 1)) { const r = logs.rows.filter((l) => l.date === k); out.push({ date: k, km: walkDistance(r), steps: totalSteps(r) }); } return out; }, [logs.rows, t]);
  if (!profile) return null;
  const todayRows = logs.rows.filter((l) => l.date === t);
  const km = walkDistance(todayRows);
  const target = Number(profile.walk_target_km);
  let streak = 0; for (let i = daily.length - 2; i >= 0 && daily[i].km >= target; i--) streak++;
  if (km >= target) streak++;
  const weekStart = startOfWeekKey(t);
  const thisWeek = daily.filter((d) => d.date >= weekStart);
  const lastWeeks = [1, 2, 3].map((w) => daily.filter((d) => d.date >= addDays(weekStart, -7 * w) && d.date < addDays(weekStart, -7 * (w - 1))));
  const cardio = todayRows.filter((r) => !["walk", "hike"].includes(r.type)).reduce((a, r) => a + r.duration_min, 0);
  const cal = activeCalories(todayRows, profile.weight_kg, profile.height_cm);
  const kcalDays = daily.map((d) => ({ date: d.date, kcal: activeCalories(logs.rows.filter((l) => l.date === d.date), profile.weight_kg, profile.height_cm).active }));

  return (
    <div className="anim-rise">
      <PageHeader title="Activity" sub={`Daily target ${target} km${profile.steps_target ? ` · ${profile.steps_target.toLocaleString()} steps` : ""}`} />
      <Card className="mb-4 p-5">
        <div className="flex items-baseline gap-2"><span className="num font-display text-5xl font-semibold">{km}</span><span className="text-faint">/ {target} km today</span>{km >= target && <Badge tone="good">Target hit</Badge>}</div>
        <Bar value={target ? km / target : 0} color="var(--info)" className="mt-4" height={10} />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Remaining" value={remaining(target, km)} unit="km" />
          <Metric label="Steps" value={totalSteps(todayRows).toLocaleString()} />
          <Metric label="Active time" value={fmtMin(todayRows.filter((r) => r.source !== "samsung_workout" || !todayRows.some((x) => x.source === "samsung")).reduce((a, r) => a + r.duration_min, 0))} sub={cardio ? `${cardio} min cardio` : undefined} />
          <Metric label="Walking streak" value={<span className="flex items-center gap-1"><Flame className="size-4 text-warm" />{streak}</span>} unit="days" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-bg-2 p-3">
          <Metric label="Active calories" value={cal.active.toLocaleString()} unit="kcal" sub={cal.estimated && cal.recorded ? `${cal.recorded} recorded + ${cal.estimated} estimated` : cal.estimated ? "estimated from steps, distance & time" : cal.recorded ? "from your watch / logs" : "nothing logged yet"} />
          <Metric label="Total burned" value={cal.total ? cal.total.toLocaleString() : "—"} unit={cal.total ? "kcal" : ""} sub={cal.total ? `incl. ${cal.resting.toLocaleString()} resting (Samsung)` : "needs resting calories from Samsung import"} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="good" size="lg" onClick={() => setWalk(true)} icon={<Play className="size-4" />}>Start walk</Button>
          <Button size="lg" onClick={() => setManual(true)} icon={<Plus className="size-4" />}>Log activity</Button>
        </div>
        <p className="mt-3 text-xs text-faint">Wearing a Galaxy watch or band? Import your Samsung Health data below. Live automatic sync needs a native Android app.</p>
      </Card>
      <div className="mb-4"><SamsungImportCard /></div>
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><Metric label="This week" value={Math.round(thisWeek.reduce((a, d) => a + d.km, 0) * 10) / 10} unit="km" /></Card>
        <Card className="p-4"><Metric label="Weekly avg (daily)" value={avg(daily.slice(-7).map((d) => d.km))} unit="km" /></Card>
        {lastWeeks.slice(0, 2).map((w, i) => <Card key={i} className="p-4"><Metric label={i === 0 ? "Last week" : "2 weeks ago"} value={Math.round(w.reduce((a, d) => a + d.km, 0) * 10) / 10} unit="km" /></Card>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Walking distance, last 28 days (dashed = target)" height={200}><BarSeries data={daily} x="date" y="km" name="Distance" unit="km" target={target} colorFn={(r) => (Number(r.km) >= target ? "var(--good)" : "var(--info)")} /></ChartFrame>
        <ChartFrame title="Active calories, last 28 days" height={200}><BarSeries data={kcalDays} x="date" y="kcal" name="Active" unit="kcal" color="var(--warm)" /></ChartFrame>
      </div>
      <Section title="Recent activity" className="mt-6">
        {logs.rows.length ? <Card className="divide-y divide-line">{logs.rows.slice(0, 20).map((l) => (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3">
            <Footprints className="size-4 text-info" />
            <div className="min-w-0 flex-1"><div className="text-sm font-medium capitalize">{l.source === "samsung" ? "Daily steps" : l.source === "samsung_workout" && l.notes ? l.notes : l.type} · {Number(l.distance_km)} km{l.is_demo && <Badge className="ml-2">Demo</Badge>}</div><div className="num text-xs text-faint">{new Date(`${l.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {l.duration_min} min{l.steps ? ` · ${l.steps.toLocaleString()} steps` : ""} · {l.active_calories || `~${estimateActiveCalories(l, profile.weight_kg, profile.height_cm).kcal}`} kcal{l.source === "gps" ? " · GPS" : l.source?.startsWith("samsung") ? " · Samsung Health" : ""}</div></div>
            <IconButton label="Delete" onClick={() => act(() => deleteById("activity_logs", l.id), "Removed")}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}</Card> : <p className="text-sm text-muted">No activity logged yet.</p>}
      </Section>
      <ActivitySheet open={manual} onClose={() => setManual(false)} />
      <WalkTracker open={walk} onClose={() => setWalk(false)} />
    </div>
  );
}

function WalkTracker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const { profile } = useProfile();
  const [state, setState] = useState<"idle" | "running" | "paused" | "done">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [km, setKm] = useState(0);
  const [gps, setGps] = useState<"off" | "on" | "denied">("off");
  const last = useRef<GeolocationCoordinates | null>(null);
  const watch = useRef<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef<Date | null>(null);
  const stopGps = () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); watch.current = null; };
  const startGps = () => {
    if (!("geolocation" in navigator)) return setGps("denied");
    watch.current = navigator.geolocation.watchPosition((p) => {
      setGps("on");
      if (p.coords.accuracy > 40) return; // ignore noisy fixes
      if (last.current) { const d = hav(last.current, p.coords); if (d > 0.003 && d < 0.2) setKm((k) => Math.round((k + d) * 1000) / 1000); }
      last.current = p.coords;
    }, () => setGps("denied"), { enableHighAccuracy: true, maximumAge: 3000 });
  };
  const start = () => { started.current ??= new Date(); setState("running"); tick.current = setInterval(() => setElapsed((e) => e + 1), 1000); startGps(); };
  const pause = () => { setState("paused"); if (tick.current) clearInterval(tick.current); stopGps(); last.current = null; };
  const stop = () => { pause(); setState("done"); };
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); stopGps(); }, []);
  const save = async () => {
    try {
      const d = Math.round(km * 100) / 100;
      const mins = Math.max(1, Math.round(elapsed / 60));
      const kcal = estimateActiveCalories({ type: "walk", distance_km: d, duration_min: mins }, profile?.weight_kg, profile?.height_cm).kcal;
      const [row] = await insertRows("activity_logs", { date: today(), type: "walk", distance_km: d, duration_min: mins, active_calories: kcal, steps: Math.round(d / 0.000762), source: gps === "on" ? "gps" : "manual", logged_at: new Date().toISOString() });
      toast(`Walk saved · ${d} km`, { undo: () => deleteById("activity_logs", row.id) });
      setState("idle"); setElapsed(0); setKm(0); started.current = null; onClose();
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
  return (
    <Sheet open={open} onClose={() => { if (state === "running") pause(); onClose(); }} title="Walk">
      <div className="py-4 text-center">
        <div className="num font-display text-6xl font-semibold tracking-tight">{fmtSec(elapsed)}</div>
        <div className="num mt-2 text-2xl text-info">{km.toFixed(2)} km</div>
        <div className="num mt-1 text-sm text-warm">≈ {estimateActiveCalories({ type: "walk", distance_km: km, duration_min: elapsed / 60 }, profile?.weight_kg, profile?.height_cm).kcal} kcal</div>
        <div className="mt-1 flex items-center justify-center gap-1 text-xs text-faint"><MapPin className="size-3" />{gps === "on" ? "GPS tracking" : gps === "denied" ? "GPS unavailable — set distance when you finish" : "GPS starts with the walk"}</div>
      </div>
      {state === "done" ? (
        <div className="space-y-3"><Stepper label="Distance (adjust if needed)" unit="km" value={Math.round(km * 100) / 100} step={0.1} onChange={setKm} /><Button variant="good" size="lg" className="w-full" onClick={save}>Save walk</Button></div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {state === "running" ? <Button size="xl" onClick={pause} icon={<Pause className="size-5" />}>Pause</Button> : <Button size="xl" variant="good" onClick={start} icon={<Play className="size-5" />}>{state === "paused" ? "Resume" : "Start"}</Button>}
          <Button size="xl" variant="danger" disabled={state === "idle"} onClick={stop} icon={<Square className="size-5" />}>Finish</Button>
        </div>
      )}
    </Sheet>
  );
}
