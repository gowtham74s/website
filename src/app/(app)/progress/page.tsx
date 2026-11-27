"use client";
import { Camera, Columns2, Flag, Flame, ImageIcon, Pause, Play, Plus, RotateCcw, Scale as ScaleIcon, Target, Trash2, Trophy, CalendarPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { addDays, diffDays, objectivesMet, programDay, rollingAverage, trendPerWeek } from "@/lib/calc";
import { deleteById, insertRows, queryClient, updateById, useRows } from "@/lib/data";
import { today, useMeasurements, useProfile, useRange, useScores } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { createProgram } from "@/lib/templates";
import type { BodyMeasurement, Goal, Program, ProgressPhoto } from "@/lib/types";
import { lOut, lUnit, wOut, wUnit } from "@/lib/units";
import { ChartFrame, Legend, LineSeries } from "@/components/charts";
import { WeightSheet } from "@/components/loggers";
import { useSession } from "@/lib/auth";
import { Badge, Bar, Button, Card, Chip, Confirm, cx, Empty, Field, IconButton, Input, Metric, PageHeader, Ring, Section, Segmented, Select, Sheet, Textarea, useAction, useToast } from "@/components/ui";

export default function Page() { return <Suspense><ProgressPage /></Suspense>; }

function ProgressPage() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"body" | "photos" | "program" | "goals">((sp.get("tab") as "body") || "body");
  return (
    <div className="anim-rise">
      <PageHeader title="Progress" sub="Trends over noise — rolling averages, not daily swings." />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "body", label: "Body" }, { value: "photos", label: "Photos" }, { value: "program", label: "Program" }, { value: "goals", label: "Goals" }]} />
      {tab === "body" && <Body />}
      {tab === "photos" && <Photos />}
      {tab === "program" && <ProgramTab />}
      {tab === "goals" && <Goals />}
    </div>
  );
}

// ---------------------------------------------------------------- body
function Body() {
  const act = useAction();
  const { profile } = useProfile();
  const m = useMeasurements();
  const [log, setLog] = useState(false);
  const [span, setSpan] = useState<"30" | "90" | "365">("90");
  if (!profile) return null;
  const from = addDays(today(), -Number(span));
  const pts = m.rows.filter((r) => r.weight_kg != null).map((r) => ({ date: r.date, value: Number(r.weight_kg) }));
  // one value per day (average of same-day entries)
  const perDay = [...pts.reduce((acc, p) => acc.set(p.date, [...(acc.get(p.date) || []), p.value]), new Map<string, number[]>())].map(([date, v]) => ({ date, value: v.reduce((a, b) => a + b, 0) / v.length }));
  const roll = rollingAverage(perDay, 7).filter((p) => p.date >= from);
  const recent = perDay.filter((p) => p.date >= addDays(today(), -27));
  const trend = trendPerWeek(recent);
  const latestAvg = roll[roll.length - 1]?.avg;
  const monthAgo = rollingAverage(perDay, 7).filter((p) => p.date <= addDays(today(), -28)).pop()?.avg;
  const weekAvg = (off: number) => { const w = perDay.filter((p) => p.date > addDays(today(), -7 * (off + 1)) && p.date <= addDays(today(), -7 * off)); return w.length ? w.reduce((a, p) => a + p.value, 0) / w.length : null; };
  const goal = profile.goal_weight_kg;
  const startW = perDay[0]?.value;
  const goalProgress = goal && startW && latestAvg ? Math.max(0, Math.min(1, (startW - latestAvg) / (startW - goal))) : null;
  const meas = m.rows.filter((r) => r.date >= from && (r.waist_cm || r.chest_cm || r.arms_cm || r.thighs_cm)).map((r) => ({ date: r.date, waist: lOut(r.waist_cm, profile), chest: lOut(r.chest_cm, profile), arms: lOut(r.arms_cm, profile), thighs: lOut(r.thighs_cm, profile) }));
  const U = wUnit(profile);
  const fmt = (kg: number | null | undefined) => (kg == null ? "—" : wOut(kg, profile));
  const delta = (a?: number | null, b?: number | null) => (a != null && b != null ? Math.round(((wOut(a, profile) ?? 0) - (wOut(b, profile) ?? 0)) * 10) / 10 : null);
  const wChange = delta(weekAvg(0), weekAvg(1)), mChange = delta(latestAvg, monthAgo);

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric label="7-day average" value={fmt(latestAvg)} unit={U} sub={perDay.length ? `latest entry ${fmt(perDay[perDay.length - 1].value)}` : "no entries"} /></Card>
        <Card className="p-4"><Metric label="Weekly avg change" value={wChange == null ? "—" : `${wChange > 0 ? "+" : ""}${wChange}`} unit={wChange == null ? "" : U} sub="this week vs last" /></Card>
        <Card className="p-4"><Metric label="4-week change" value={mChange == null ? "—" : `${mChange > 0 ? "+" : ""}${mChange}`} unit={mChange == null ? "" : U} sub="rolling avg vs 28 days ago" /></Card>
        <Card className="p-4"><Metric label="Trend" value={trend == null ? "—" : `${trend > 0 ? "+" : ""}${wOut(Math.abs(trend), profile)! * Math.sign(trend)}`} unit={trend == null ? "" : `${U}/wk`} sub="least-squares, last 4 weeks" /></Card>
      </div>
      {goalProgress != null && <Card className="mb-4 p-4"><div className="mb-2 flex justify-between text-sm"><span className="text-muted">Goal {fmt(goal)} {U} · started {fmt(startW)}</span><span className="num font-semibold">{Math.round(goalProgress * 100)}%</span></div><Bar value={goalProgress} height={8} /></Card>}
      <ChartFrame title="Body weight" right={<div className="flex items-center gap-3"><Legend items={[{ label: "Daily", color: "var(--muted)" }, { label: "7-day avg", color: "var(--good)" }]} /><Segmented size="sm" value={span} onChange={setSpan} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "365", label: "1y" }]} /></div>} height={240}>
        {roll.length > 1 ? <LineSeries data={roll.map((p) => ({ date: p.date, daily: wOut(p.value, profile), avg: wOut(p.avg, profile) }))} x="date" unit={U} target={goal ? wOut(goal, profile)! : undefined} lines={[{ key: "daily", name: "Daily", color: "var(--muted)", dashed: true, dot: true }, { key: "avg", name: "7-day avg", color: "var(--good)" }]} />
          : <div className="grid h-full place-items-center text-sm text-faint">Log your weight a few times to see a trend.</div>}
      </ChartFrame>
      <div className="my-4 flex gap-2"><Button variant="good" onClick={() => setLog(true)} icon={<ScaleIcon className="size-4" />}>Log weight & measurements</Button></div>
      {meas.length > 1 && <ChartFrame title={`Measurements (${lUnit(profile)})`} right={<Legend items={[{ label: "Waist", color: "var(--warm)" }, { label: "Chest", color: "var(--info)" }, { label: "Arms", color: "var(--violet)" }, { label: "Thighs", color: "var(--cyan)" }]} />} height={220}>
        <LineSeries data={meas} x="date" unit={lUnit(profile)} lines={[{ key: "waist", name: "Waist", color: "var(--warm)", dot: true }, { key: "chest", name: "Chest", color: "var(--info)", dot: true }, { key: "arms", name: "Arms", color: "var(--violet)", dot: true }, { key: "thighs", name: "Thighs", color: "var(--cyan)", dot: true }]} />
      </ChartFrame>}
      <Section title="Entries" className="mt-6">
        {m.rows.length ? <Card className="divide-y divide-line">{[...m.rows].reverse().slice(0, 40).map((r: BodyMeasurement) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1"><div className="text-sm font-medium">{new Date(`${r.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{r.is_demo && <Badge className="ml-2">Demo</Badge>}</div>
              <div className="num text-xs text-faint">{[r.waist_cm && `waist ${lOut(r.waist_cm, profile)}`, r.chest_cm && `chest ${lOut(r.chest_cm, profile)}`, r.arms_cm && `arms ${lOut(r.arms_cm, profile)}`, r.thighs_cm && `thighs ${lOut(r.thighs_cm, profile)}`, r.body_fat_pct && `${r.body_fat_pct}% bf`, r.notes].filter(Boolean).join(" · ")}</div></div>
            <span className="num font-semibold">{fmt(r.weight_kg)} {r.weight_kg != null && U}</span>
            <IconButton label="Delete" onClick={() => act(() => deleteById("body_measurements", r.id), "Removed")}><Trash2 className="size-4" /></IconButton>
          </div>
        ))}</Card> : <Card><Empty icon={<ScaleIcon className="size-5" />} title="No entries yet" body="Weigh in at the same time of day (e.g. after waking). The 7-day average smooths out water and food noise." /></Card>}
      </Section>
      <WeightSheet open={log} onClose={() => setLog(false)} full />
    </>
  );
}

// ---------------------------------------------------------------- photos (private storage)
function Photos() {
  const act = useAction();
  const toast = useToast();
  const { session } = useSession();
  const photos = useRows<ProgressPhoto>({ table: "progress_photos", order: [["date", true]] });
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pose, setPose] = useState("front");
  const [filter, setFilter] = useState("all");
  const [compare, setCompare] = useState<[string, string] | null>(null);
  const paths = photos.rows.map((p) => p.storage_path).join("|");
  useEffect(() => {
    if (!photos.rows.length) return;
    supabase.storage.from("progress-photos").createSignedUrls(photos.rows.map((p) => p.storage_path), 3600).then(({ data }) => {
      const m: Record<string, string> = {}; data?.forEach((d, i) => { if (d.signedUrl) m[photos.rows[i].id] = d.signedUrl; }); setUrls(m);
    });
  }, [paths]); // eslint-disable-line react-hooks/exhaustive-deps
  const upload = async (file: File) => {
    if (!session) return;
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${session.user.id}/${today()}-${pose}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error } = await supabase.storage.from("progress-photos").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      await insertRows("progress_photos", { date: today(), storage_path: path, pose });
      toast("Photo saved privately");
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
    setBusy(false);
  };
  const remove = (p: ProgressPhoto) => act(async () => { await supabase.storage.from("progress-photos").remove([p.storage_path]); await deleteById("progress_photos", p.id); }, "Photo deleted");
  const list = photos.rows.filter((p) => filter === "all" || p.pose === filter);
  const a = compare && photos.rows.find((p) => p.id === compare[0]), b = compare && photos.rows.find((p) => p.id === compare[1]);
  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" value={pose} onChange={setPose} options={[{ value: "front", label: "Front" }, { value: "side", label: "Side" }, { value: "back", label: "Back" }]} />
          <label className={cx("inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-good px-4 text-sm font-medium text-black", busy && "opacity-50")}>
            <Camera className="size-4" />{busy ? "Uploading…" : "Add photo"}
            <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
          {photos.rows.length >= 2 && <Button onClick={() => setCompare([photos.rows[0].id, photos.rows[photos.rows.length - 1].id])} icon={<Columns2 className="size-4" />}>Compare</Button>}
        </div>
        <p className="mt-2 text-xs text-faint">Stored in a private bucket only your account can read. Links shown here expire after an hour.</p>
      </Card>
      <div className="no-scrollbar mb-3 flex gap-1.5">{["all", "front", "side", "back"].map((x) => <Chip key={x} active={filter === x} onClick={() => setFilter(x)}>{x}</Chip>)}</div>
      {list.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-line bg-card">
              {urls[p.id] ? <img src={urls[p.id]} alt={`${p.pose} ${p.date}`} className="aspect-[3/4] w-full object-cover" /> : <div className="grid aspect-[3/4] place-items-center"><ImageIcon className="size-6 text-faint" /></div>}
              <div className="flex items-center justify-between px-3 py-2 text-xs"><span className="num">{p.date}</span><span className="capitalize text-faint">{p.pose}</span></div>
              <button aria-label="Delete photo" onClick={() => remove(p)} className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/60 text-white opacity-0 transition group-hover:opacity-100"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      ) : <Card><Empty icon={<Camera className="size-5" />} title="No progress photos" body="Same light, same pose, every 2–4 weeks. Compare mode puts any two side by side." /></Card>}
      <Sheet open={!!compare} onClose={() => setCompare(null)} title="Compare" wide>
        {compare && (
          <div className="grid grid-cols-2 gap-3">
            {[0, 1].map((i) => { const sel = i === 0 ? a : b; return (
              <div key={i}>
                <Select value={compare[i]} onChange={(e) => setCompare(i === 0 ? [e.target.value, compare[1]] : [compare[0], e.target.value])} className="mb-2 text-sm">{photos.rows.map((p) => <option key={p.id} value={p.id}>{p.date} · {p.pose}</option>)}</Select>
                {sel && urls[sel.id] && <img src={urls[sel.id]} alt="" className="aspect-[3/4] w-full rounded-xl object-cover" />}
              </div>
            ); })}
            {a && b && <p className="col-span-2 text-center text-sm text-muted">{Math.abs(diffDays(b.date, a.date))} days apart</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- transformation program
function ProgramTab() {
  const act = useAction();
  const t = today();
  const progs = useRows<Program>({ table: "transformation_programs", order: [["created_at", false]] });
  const active = progs.rows.find((p) => p.status === "active" || p.status === "paused");
  const { profile } = useProfile();
  const from = active ? (active.start_date > addDays(t, -120) ? active.start_date : addDays(t, -120)) : t;
  const data = useRange(from, t);
  const scores = useScores(profile, data, from, t);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<null | "restart" | "complete">(null);
  if (!active) return (
    <>
      <Card><Empty icon={<Flag className="size-5" />} title="No active program" body="A program gives you a day counter, daily objectives, streaks and milestones — e.g. a 75-day transformation." action={<Button variant="good" onClick={() => setCreating(true)}>Start a program</Button>} /></Card>
      {progs.rows.length > 0 && <Section title="Past programs" className="mt-6"><Card className="divide-y divide-line">{progs.rows.map((p) => <div key={p.id} className="flex justify-between px-4 py-3 text-sm"><span>{p.name}</span><Badge>{p.status}</Badge></div>)}</Card></Section>}
      <ProgramSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
  const pd = programDay(active, t);
  const days = scores.filter((s) => s.date >= active.start_date && s.date < t);
  const met = days.map((s) => ({ date: s.date, ...objectivesMet(s.score.parts, active.daily_objectives) }));
  const fullDays = met.filter((m) => m.all).length;
  let streak = 0; for (let i = met.length - 1; i >= 0 && met[i].all; i--) streak++;
  let best = 0, run = 0; met.forEach((m) => { run = m.all ? run + 1 : 0; best = Math.max(best, run); });
  const objRate = met.length ? Math.round((met.reduce((a, m) => a + m.count, 0) / (met.length * active.daily_objectives.length)) * 100) : 0;
  const week = met.slice(-7);
  const weekScore = week.length ? Math.round((week.reduce((a, m) => a + m.count, 0) / (week.length * active.daily_objectives.length)) * 100) : 0;
  const todayObj = scores.length ? objectivesMet(scores[scores.length - 1].score.parts, active.daily_objectives) : null;
  const labels: Record<string, string> = { workout: "Workout per plan", protein: "Hit protein", calories: "Follow calories", water: "Drink water target", walk: "Walk target", sleep: "Sleep target", habits: "Complete habits" };

  return (
    <>
      <Card className="hero-grad mb-4 p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <Ring value={pd.progress / 100} size={150} stroke={12} color="var(--warm)"><div><div className="text-[11px] uppercase tracking-wider text-faint">Day</div><div className="num font-display text-5xl font-semibold">{pd.day}</div><div className="text-xs text-faint">of {active.duration_days}</div></div></Ring>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-semibold tracking-tight">{active.name}</h2>{active.status === "paused" && <Badge tone="warm">Paused</Badge>}{active.is_demo && <Badge>Demo</Badge>}</div>
            <div className="num mt-1 text-sm text-muted">Started {new Date(`${active.start_date}T12:00`).toLocaleDateString()} · {pd.remaining} days remaining{active.paused_days ? ` · ${active.paused_days} paused days` : ""}</div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Perfect days" value={`${fullDays}/${met.length}`} />
              <Metric label="Objectives hit" value={`${objRate}%`} />
              <Metric label="This week" value={`${weekScore}%`} />
              <Metric label="Streak" value={<span className="flex items-center gap-1"><Flame className="size-4 text-warm" />{streak}</span>} sub={`best ${best}`} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {active.status === "active"
            ? <Button size="sm" onClick={() => act(() => updateById("transformation_programs", active.id, { status: "paused", paused_at: t }), "Program paused")} icon={<Pause className="size-3.5" />}>Pause</Button>
            : <Button size="sm" variant="warm" onClick={() => act(() => updateById("transformation_programs", active.id, { status: "active", paused_at: null, paused_days: (active.paused_days || 0) + Math.max(0, diffDays(t, active.paused_at || t)) }), "Program resumed")} icon={<Play className="size-3.5" />}>Resume</Button>}
          <Button size="sm" onClick={() => act(() => updateById("transformation_programs", active.id, { duration_days: active.duration_days + 7 }), "Extended by 7 days")} icon={<CalendarPlus className="size-3.5" />}>Extend +7</Button>
          <Button size="sm" onClick={() => setConfirm("restart")} icon={<RotateCcw className="size-3.5" />}>Restart</Button>
          <Button size="sm" onClick={() => setConfirm("complete")} icon={<Trophy className="size-3.5" />}>Mark complete</Button>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-[13px] font-medium text-muted">Today&apos;s objectives</div>
          <div className="space-y-2">{todayObj?.list.map((o) => <div key={o.key} className="flex items-center gap-3"><span className={cx("grid size-6 place-items-center rounded-full", o.met ? "bg-good text-black" : "bg-[var(--ring-track)]")}>{o.met && <Target className="size-3.5" />}</span><span className={cx("text-sm", o.met ? "text-fg" : "text-muted")}>{labels[o.key] ?? o.key}</span></div>)}</div>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-[13px] font-medium text-muted">Milestones</div>
          <div className="space-y-2">{(active.milestones || []).map((m) => { const reached = pd.day >= m.day; return <div key={m.day} className="flex items-center gap-3"><span className={cx("num grid h-7 w-12 place-items-center rounded-lg text-xs font-semibold", reached ? "bg-warm-soft text-warm" : "bg-card-2 text-faint")}>D{m.day}</span><span className={cx("text-sm", reached ? "text-fg" : "text-muted")}>{m.title}</span>{reached && <Trophy className="size-3.5 text-warm" />}</div>; })}</div>
        </Card>
      </div>
      <Section title="Daily record" className="mt-6">
        <Card className="p-4">
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: active.duration_days }, (_, i) => addDays(active.start_date, i + (active.paused_days || 0))).map((k, i) => { const m = met.find((x) => x.date === k); return <div key={k} title={`Day ${i + 1} · ${k}${m ? ` · ${m.count}/${active.daily_objectives.length}` : ""}`} className={cx("num grid size-7 place-items-center rounded-md text-[10px]", m ? (m.all ? "bg-good text-black" : m.count / active.daily_objectives.length >= 0.6 ? "bg-warm-soft text-warm" : "bg-bad-soft text-bad") : k === t ? "ring-1 ring-fg" : "bg-card-2 text-faint")}>{i + 1}</div>; })}
          </div>
          <p className="mt-3 text-xs text-faint">Green = all objectives met · amber = most · red = fewer than 60%. Missed days are shown as they happened.</p>
        </Card>
      </Section>
      <Confirm open={confirm === "restart"} onClose={() => setConfirm(null)} title="Restart program from today?" body="Day count resets to 1. Your logged data isn't affected." confirmLabel="Restart" danger={false} onConfirm={() => act(() => updateById("transformation_programs", active.id, { start_date: t, paused_days: 0, paused_at: null, status: "active" }), "Restarted")} />
      <Confirm open={confirm === "complete"} onClose={() => setConfirm(null)} title="Mark program complete?" body="It moves to past programs. You can start a new one any time." confirmLabel="Complete" danger={false} onConfirm={() => act(async () => { await updateById("transformation_programs", active.id, { status: "completed" }); queryClient.invalidateQueries(); }, "Program completed")} />
    </>
  );
}

function ProgramSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const act = useAction();
  const [name, setName] = useState("75-Day Transformation");
  const [days, setDays] = useState(75);
  const [start, setStart] = useState(today());
  return (
    <Sheet open={open} onClose={onClose} title="New program" footer={<Button variant="good" className="w-full" onClick={() => act(async () => { await createProgram(name, days, start); onClose(); }, "Program started")}>Start program</Button>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Duration (days)"><Input inputMode="numeric" value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} /></Field><Field label="Start date"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
        <p className="text-sm text-muted">Daily objectives: workout per plan, protein, calories, water, walking, sleep and habits — all measured against your profile targets.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- goals
function Goals() {
  const act = useAction();
  const goals = useRows<Goal>({ table: "goals", order: [["created_at", false]] });
  const { profile } = useProfile();
  const m = useMeasurements();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", metric: "weight", start_value: "", target_value: "", target_date: "" });
  const current = (g: Goal) => { const last = [...m.rows].reverse().find((r) => (g.metric === "weight" ? r.weight_kg : g.metric === "waist" ? r.waist_cm : null) != null); return g.metric === "weight" ? last?.weight_kg : g.metric === "waist" ? last?.waist_cm : null; };
  return (
    <>
      <Button className="mb-4" variant="good" onClick={() => setOpen(true)} icon={<Plus className="size-4" />}>New goal</Button>
      {goals.rows.length ? <div className="grid gap-3 md:grid-cols-2">{goals.rows.map((g) => {
        const cur = current(g); const s = Number(g.start_value), tv = Number(g.target_value);
        const prog = cur != null && g.start_value != null && g.target_value != null && s !== tv ? Math.max(0, Math.min(1, (s - Number(cur)) / (s - tv))) : null;
        return (
          <Card key={g.id} className="p-4">
            <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{g.title}</div><div className="num text-xs text-faint">{g.metric}{g.target_value != null && ` · target ${g.target_value}`}{g.target_date && ` by ${g.target_date}`}</div></div>
              <div className="flex items-center gap-1"><Badge tone={g.status === "achieved" ? "good" : "neutral"}>{g.status}</Badge>{g.status === "active" && <IconButton label="Mark achieved" onClick={() => act(() => updateById("goals", g.id, { status: "achieved" }), "Goal achieved")}><Trophy className="size-4" /></IconButton>}<IconButton label="Delete" onClick={() => act(() => deleteById("goals", g.id))}><Trash2 className="size-4" /></IconButton></div></div>
            {prog != null && <div className="mt-3"><div className="num mb-1 flex justify-between text-xs text-muted"><span>now {Math.round(Number(cur) * 10) / 10}</span><span>{Math.round(prog * 100)}%</span></div><Bar value={prog} /></div>}
          </Card>
        );
      })}</div> : <Card><Empty icon={<Target className="size-5" />} title="No goals yet" body="Weight and waist goals track progress from your measurements automatically; custom goals are tracked manually." /></Card>}
      <Sheet open={open} onClose={() => setOpen(false)} title="New goal" footer={<Button variant="good" className="w-full" disabled={!f.title.trim()} onClick={() => act(async () => { await insertRows("goals", { title: f.title.trim(), metric: f.metric, start_value: f.start_value ? Number(f.start_value) : (f.metric === "weight" ? profile?.weight_kg : null), target_value: f.target_value ? Number(f.target_value) : null, target_date: f.target_date || null }); setOpen(false); }, "Goal added")}>Save goal</Button>}>
        <div className="space-y-3">
          <Field label="Goal"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Reach 72 kg" /></Field>
          <Field label="Track"><Select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}><option value="weight">Body weight (kg)</option><option value="waist">Waist (cm)</option><option value="custom">Custom (manual)</option></Select></Field>
          <div className="grid grid-cols-3 gap-3"><Field label="Start"><Input inputMode="decimal" value={f.start_value} onChange={(e) => setF({ ...f, start_value: e.target.value })} placeholder={f.metric === "weight" && profile?.weight_kg ? String(profile.weight_kg) : ""} /></Field><Field label="Target"><Input inputMode="decimal" value={f.target_value} onChange={(e) => setF({ ...f, target_value: e.target.value })} /></Field><Field label="By"><Input type="date" value={f.target_date} onChange={(e) => setF({ ...f, target_date: e.target.value })} /></Field></div>
        </div>
      </Sheet>
    </>
  );
}
