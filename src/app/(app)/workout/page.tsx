"use client";
import { ArrowDown, ArrowUp, Copy, Dumbbell, History, Pencil, Play, Plus, RotateCcw, Search, Trash2, Trophy, BookOpen, BarChart3, Archive } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { addDays, avg, epley, groupBy, planForDay, startOfWeekKey } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { today } from "@/lib/hooks";
import type { Exercise, PlanExercise, Workout, WorkoutPlan, WorkoutSet } from "@/lib/types";
import { fmtMin } from "@/lib/units";
import { startWorkout } from "@/lib/workout";
import { BarSeries, ChartFrame, LineSeries } from "@/components/charts";
import { ExerciseForm, MUSCLES, useExercises } from "@/components/exercise-picker";
import { Badge, Button, Card, Chip, Confirm, cx, Empty, IconButton, Input, Metric, PageHeader, Section, Segmented, Select, Sheet, useAction } from "@/components/ui";
import { PlanSheet } from "@/components/plan-sheet";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function WorkoutPage() { return <Suspense><WorkoutInner /></Suspense>; }

function WorkoutInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"plans" | "history" | "library" | "analytics">((sp.get("tab") as "plans") || "plans");
  return (
    <div className="anim-rise">
      <PageHeader title="Workout" sub="Plans, sessions, progression." />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "plans", label: "Plans" }, { value: "history", label: "History" }, { value: "library", label: "Exercises" }, { value: "analytics", label: "Analytics" }]} />
      {tab === "plans" && <Plans />}
      {tab === "history" && <HistoryTab />}
      {tab === "library" && <Library />}
      {tab === "analytics" && <Analytics />}
    </div>
  );
}

// ---------------------------------------------------------------- plans
function Plans() {
  const router = useRouter();
  const act = useAction();
  const t = today();
  const plans = useRows<WorkoutPlan>({ table: "workout_plans", filters: [["archived", "eq", false]], order: [["position", true]] });
  const pe = useRows<PlanExercise>({ table: "plan_exercises" });
  const active = useRows<Workout>({ table: "workouts", filters: [["status", "in", ["in_progress", "paused"]]], order: [["started_at", false]] });
  const [edit, setEdit] = useState<WorkoutPlan | "new" | null>(null);
  const [del, setDel] = useState<WorkoutPlan | null>(null);
  const todays = planForDay(plans.rows, t);

  const start = (p: WorkoutPlan | null) => act(async () => { const w = await startWorkout({ planId: p?.id, name: p?.name ?? "Quick workout" }); router.push(`/workout/session/${w.id}`); });
  const move = (i: number, dir: -1 | 1) => act(async () => {
    const list = [...plans.rows]; const j = i + dir; if (j < 0 || j >= list.length) return;
    await Promise.all([updateById("workout_plans", list[i].id, { position: j }), updateById("workout_plans", list[j].id, { position: i })]);
  });
  const duplicate = (p: WorkoutPlan) => act(async () => {
    const [n] = await insertRows("workout_plans", { name: `${p.name} (copy)`, split_type: p.split_type, color: p.color, scheduled_days: [], estimated_minutes: p.estimated_minutes, position: plans.rows.length, notes: p.notes });
    const rows = pe.rows.filter((x) => x.plan_id === p.id).map(({ id: _i, user_id: _u, plan_id: _p, ...r }) => ({ ...r, plan_id: n.id }));
    if (rows.length) await insertRows("plan_exercises", rows);
  }, "Plan duplicated");

  return (
    <>
      {active.rows[0] && (
        <Card className="mb-4 flex items-center justify-between gap-3 border-warm/40 bg-warm-soft p-4">
          <div><div className="text-xs font-semibold uppercase tracking-wider text-warm">In progress</div><div className="font-semibold">{active.rows[0].name}</div></div>
          <Button variant="warm" onClick={() => router.push(`/workout/session/${active.rows[0].id}`)} icon={<Play className="size-4" />}>Resume</Button>
        </Card>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Button variant="warm" size="xl" onClick={() => start(todays ?? null)} icon={<Play className="size-5" />}>{todays ? `Start ${todays.name}` : "Start empty workout"}</Button>
        <Button size="xl" onClick={() => setEdit("new")} icon={<Plus className="size-5" />}>New plan</Button>
      </div>
      <Section title="Your splits">
        {!plans.rows.length ? <Card><Empty icon={<Dumbbell className="size-5" />} title="No workout plans" body="Create a split like Push / Pull / Legs and schedule it on weekdays. Weights pre-fill from your last session." action={<Button onClick={() => setEdit("new")}>Create plan</Button>} /></Card> : (
          <div className="grid gap-3 md:grid-cols-2">
            {plans.rows.map((p, i) => {
              const ex = pe.rows.filter((x) => x.plan_id === p.id);
              return (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><Link href={`/workout/plan/${p.id}`} className="truncate text-lg font-semibold hover:underline">{p.name}</Link>{p === todays && <Badge tone="warm">Today</Badge>}{p.is_demo && <Badge>Demo</Badge>}</div>
                      <div className="text-sm capitalize text-muted">{p.split_type.replace("_", " ")} · {ex.length} exercises · ~{p.estimated_minutes} min</div>
                      <div className="mt-2 flex gap-1">{DAYS.map((d, k) => <span key={k} className={cx("grid size-6 place-items-center rounded-md text-[11px] font-semibold", p.scheduled_days?.includes(k) ? "bg-fg text-bg" : "bg-card-2 text-faint")}>{d}</span>)}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
                    <Button size="sm" variant="warm" onClick={() => start(p)} icon={<Play className="size-3.5" />}>Start</Button>
                    <Link href={`/workout/plan/${p.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] text-muted hover:bg-card-2 hover:text-fg"><Pencil className="size-3.5" />Edit</Link>
                    <div className="ml-auto flex">
                      <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconButton>
                      <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === plans.rows.length - 1}><ArrowDown className="size-4" /></IconButton>
                      <IconButton label="Duplicate" onClick={() => duplicate(p)}><Copy className="size-4" /></IconButton>
                      <IconButton label="Schedule & details" onClick={() => setEdit(p)}><Pencil className="size-4" /></IconButton>
                      <IconButton label="Archive" onClick={() => act(() => updateById("workout_plans", p.id, { archived: true }), "Plan archived", () => updateById("workout_plans", p.id, { archived: false }))}><Archive className="size-4" /></IconButton>
                      <IconButton label="Delete" onClick={() => setDel(p)}><Trash2 className="size-4" /></IconButton>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Section>
      <PlanSheet plan={edit} onClose={() => setEdit(null)} count={plans.rows.length} onCreated={(id) => router.push(`/workout/plan/${id}`)} />
      <Confirm open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name}?`} body="The plan and its exercise list are deleted. Past workouts stay in your history." onConfirm={() => del && act(() => deleteById("workout_plans", del.id), "Plan deleted")} />
    </>
  );
}

// ---------------------------------------------------------------- history
function HistoryTab() {
  const router = useRouter();
  const act = useAction();
  const ws = useRows<Workout>({ table: "workouts", filters: [["status", "eq", "completed"]], order: [["started_at", false]], limit: 200 });
  const [open, setOpen] = useState<Workout | null>(null);
  const sets = useRows<WorkoutSet>({ table: "workout_sets", filters: [["workout_id", "eq", open?.id ?? "-"]], order: [["exercise_order", true], ["set_number", true]] }, !!open);
  const repeat = (w: Workout) => act(async () => {
    const [nw] = await insertRows("workouts", { plan_id: w.plan_id, name: w.name, date: today(), status: "in_progress", started_at: new Date().toISOString() });
    const src = sets.rows.filter((s) => s.workout_id === w.id);
    if (src.length) await insertRows("workout_sets", src.map((s) => ({ workout_id: nw.id, exercise_id: s.exercise_id, exercise_name: s.exercise_name, muscle_group: s.muscle_group, exercise_order: s.exercise_order, set_number: s.set_number, target_reps: s.target_reps ?? s.reps, reps: s.reps, weight: s.weight, rest_seconds: s.rest_seconds, completed: false })));
    router.push(`/workout/session/${nw.id}`);
  });
  if (!ws.rows.length) return <Card><Empty icon={<History className="size-5" />} title="No completed workouts yet" body="Finished sessions appear here with every set, PR and total volume." /></Card>;
  return (
    <>
      <div className="space-y-2">
        {ws.rows.map((w) => (
          <Card key={w.id} as="button" onClick={() => setOpen(w)} className="flex w-full items-center gap-4 p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-warm-soft text-warm"><Dumbbell className="size-5" /></div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-semibold">{w.name}{w.is_demo && <Badge>Demo</Badge>}</div><div className="num text-sm text-muted">{new Date(`${w.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {fmtMin(Math.round((w.duration_seconds || 0) / 60))} · {Math.round(Number(w.total_volume)).toLocaleString()} kg</div></div>
          </Card>
        ))}
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name} footer={open && <div className="flex gap-2"><Button className="flex-1" icon={<RotateCcw className="size-4" />} onClick={() => repeat(open)}>Repeat this workout</Button><Button variant="danger" onClick={() => act(async () => { await deleteById("workouts", open.id); setOpen(null); }, "Workout deleted")}>Delete</Button></div>}>
        {open?.notes && <p className="mb-3 rounded-xl bg-bg-2 p-3 text-sm text-muted">{open.notes}</p>}
        {[...groupBy(sets.rows, (s) => `${s.exercise_order}|${s.exercise_name}`)].map(([k, ss]) => (
          <div key={k} className="mb-3">
            <div className="mb-1 font-medium">{k.split("|")[1]}</div>
            <div className="flex flex-wrap gap-1.5">{ss.map((s) => <span key={s.id} className={cx("num rounded-lg px-2 py-1 text-xs", s.completed ? "bg-card-2" : "bg-bg-2 text-faint line-through", s.is_pr && "bg-warm-soft text-warm")}>{s.weight}×{s.reps}{s.is_pr && " PR"}</span>)}</div>
          </div>
        ))}
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------- exercise library
function Library() {
  const { rows } = useExercises();
  const [q, setQ] = useState("");
  const [m, setM] = useState<string | null>(null);
  const [sel, setSel] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const list = rows.filter((e) => (!m || e.muscle_group === m) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="mb-3 flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input placeholder={`Search ${rows.length} exercises`} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div><Button onClick={() => setCreating(true)} icon={<Plus className="size-4" />}>New</Button></div>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1"><Chip active={!m} onClick={() => setM(null)}>All</Chip>{MUSCLES.map((x) => <Chip key={x} active={m === x} onClick={() => setM(x)}>{x}</Chip>)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((e) => (
          <Card key={e.id} as="button" onClick={() => setSel(e)} className="p-3.5">
            <div className="font-medium">{e.name}</div>
            <div className="mt-0.5 text-xs capitalize text-faint">{e.muscle_group} · {e.equipment} · {e.default_sets}×{e.default_reps}</div>
          </Card>
        ))}
      </div>
      <ExerciseDetail ex={sel} onClose={() => setSel(null)} />
      <Sheet open={creating} onClose={() => setCreating(false)} title="New exercise"><ExerciseForm onSaved={() => setCreating(false)} /></Sheet>
    </>
  );
}

function ExerciseDetail({ ex, onClose }: { ex: Exercise | null; onClose: () => void }) {
  const hist = useRows<{ date: string; top_weight: number; est_1rm: number; volume: number; top_reps: number }>({ table: "exercise_history", filters: [["exercise_id", "eq", ex?.id ?? "-"]], order: [["date", true]] }, !!ex);
  const best = hist.rows.reduce((a, h) => Math.max(a, Number(h.est_1rm) || 0), 0);
  const act = useAction();
  return (
    <Sheet open={!!ex} onClose={onClose} title={ex?.name} wide>
      {ex && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5 text-xs capitalize"><Badge>{ex.muscle_group}</Badge>{ex.secondary_muscles?.map((s) => <Badge key={s}>{s}</Badge>)}<Badge tone="info">{ex.equipment}</Badge><Badge>{ex.category}</Badge>{ex.tempo && <Badge>tempo {ex.tempo}</Badge>}</div>
          {ex.media_url && (/\.(png|jpe?g|gif|webp)$/i.test(ex.media_url) ? <img src={ex.media_url} alt={ex.name} className="max-h-60 rounded-xl" /> : <a href={ex.media_url} target="_blank" rel="noreferrer" className="text-sm text-good underline">Watch reference video</a>)}
          {ex.instructions && <div><div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-muted"><BookOpen className="size-4" />How to</div><p className="text-[15px] leading-relaxed">{ex.instructions}</p></div>}
          <div className="grid grid-cols-3 gap-3 rounded-2xl bg-bg-2 p-3"><Metric label="Default" value={`${ex.default_sets}×${ex.default_reps}`} /><Metric label="Rest" value={ex.default_rest_seconds} unit="s" /><Metric label="Best est. 1RM" value={best ? Math.round(best) : "—"} unit={best ? "kg" : ""} /></div>
          {ex.alternatives?.length > 0 && <div><div className="mb-1 text-sm font-medium text-muted">Alternatives</div><div className="flex flex-wrap gap-1.5">{ex.alternatives.map((a) => <Badge key={a}>{a}</Badge>)}</div></div>}
          {hist.rows.length > 1 ? <ChartFrame title="Estimated 1RM over time" height={180}><LineSeries data={hist.rows.map((h) => ({ date: h.date, e1rm: Math.round(Number(h.est_1rm)), top: Number(h.top_weight) }))} x="date" unit="kg" lines={[{ key: "e1rm", name: "Est. 1RM", color: "var(--warm)", dot: true }, { key: "top", name: "Top set", color: "var(--muted)", dashed: true }]} /></ChartFrame>
            : <p className="text-sm text-faint">Log this exercise in two sessions to see a strength trend.</p>}
          {ex.user_id && <Button variant="danger" onClick={() => act(async () => { await deleteById("exercises", ex.id); onClose(); }, "Exercise deleted")}>Delete custom exercise</Button>}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- analytics
function Analytics() {
  const t = today();
  const from = addDays(t, -89);
  const ws = useRows<Workout>({ table: "workouts", filters: [["status", "eq", "completed"], ["date", "gte", from]], order: [["date", true]] });
  const hist = useRows<{ exercise_id: string; exercise_name: string; muscle_group: string; date: string; est_1rm: number; volume: number; sets: number }>({ table: "exercise_history", filters: [["date", "gte", from]], order: [["date", true]] });
  const prs = useRows<WorkoutSet>({ table: "workout_sets", filters: [["is_pr", "eq", true]], order: [["completed_at", false]], limit: 20 });
  const [exId, setExId] = useState<string>("");

  const weeks = useMemo(() => {
    const m = new Map<string, { week: string; workouts: number; volume: number }>();
    for (let k = startOfWeekKey(from); k <= t; k = addDays(k, 7)) m.set(k, { week: k, workouts: 0, volume: 0 });
    ws.rows.forEach((w) => { const k = startOfWeekKey(w.date); const e = m.get(k); if (e) { e.workouts++; e.volume += Number(w.total_volume) || 0; } });
    return [...m.values()].map((w) => ({ ...w, volume: Math.round(w.volume) }));
  }, [ws.rows, from, t]);
  const last30 = ws.rows.filter((w) => w.date >= addDays(t, -29));
  const muscles = useMemo(() => {
    const m = new Map<string, number>();
    hist.rows.filter((h) => h.date >= addDays(t, -29)).forEach((h) => m.set(h.muscle_group || "other", (m.get(h.muscle_group || "other") || 0) + Number(h.sets)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([muscle, sets]) => ({ muscle, sets }));
  }, [hist.rows, t]);
  const exercises = useMemo(() => [...new Map(hist.rows.map((h) => [h.exercise_id, h.exercise_name])).entries()], [hist.rows]);
  const sel = exId || exercises[0]?.[0] || "";
  const trend = hist.rows.filter((h) => h.exercise_id === sel).map((h) => ({ date: h.date, e1rm: Math.round(Number(h.est_1rm)) }));
  if (!ws.rows.length) return <Card><Empty icon={<BarChart3 className="size-5" />} title="No training data yet" body="Complete a workout and your volume, frequency, PRs and strength trends show up here." /></Card>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><Metric label="Workouts (30d)" value={last30.length} /></Card>
        <Card className="p-4"><Metric label="Volume (30d)" value={Math.round(last30.reduce((a, w) => a + Number(w.total_volume || 0), 0) / 1000).toLocaleString()} unit="t" /></Card>
        <Card className="p-4"><Metric label="Avg duration" value={fmtMin(avg(last30.map((w) => (w.duration_seconds || 0) / 60)))} /></Card>
        <Card className="p-4"><Metric label="Weeks ≥ 3 sessions" value={`${weeks.filter((w) => w.workouts >= 3).length}/${weeks.length}`} sub={`last ${weeks.length} weeks`} /></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Workouts per week" height={180}><BarSeries data={weeks} x="week" y="workouts" name="Workouts" color="var(--warm)" /></ChartFrame>
        <ChartFrame title="Training volume per week (kg)" height={180}><BarSeries data={weeks} x="week" y="volume" name="Volume" unit="kg" color="var(--good)" /></ChartFrame>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-[13px] font-medium text-muted">Sets per muscle group (30 days)</div>
          <div className="space-y-2">{muscles.map((m) => <div key={m.muscle} className="flex items-center gap-3"><span className="w-24 shrink-0 truncate text-sm capitalize">{m.muscle}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="h-full rounded-full bg-info" style={{ width: `${(m.sets / (muscles[0]?.sets || 1)) * 100}%` }} /></div><span className="num w-8 text-right text-sm text-muted">{m.sets}</span></div>)}</div>
        </Card>
        <ChartFrame title="Strength trend (estimated 1RM)" right={<Select value={sel} onChange={(e) => setExId(e.target.value)} className="h-9 w-auto max-w-[180px] py-1 text-sm">{exercises.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>} height={200}>
          {trend.length > 1 ? <LineSeries data={trend} x="date" unit="kg" lines={[{ key: "e1rm", name: "Est. 1RM", color: "var(--warm)", dot: true }]} /> : <div className="grid h-full place-items-center text-sm text-faint">Needs two sessions of this exercise.</div>}
        </ChartFrame>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-muted"><Trophy className="size-4 text-warm" />Recent personal records</div>
        {prs.rows.length ? <div className="grid gap-2 sm:grid-cols-2">{prs.rows.map((s) => <div key={s.id} className="flex items-center justify-between rounded-xl bg-bg-2 px-3 py-2 text-sm"><span>{s.exercise_name}</span><span className="num font-semibold text-warm">{s.weight} × {s.reps} <span className="text-xs font-normal text-faint">e1RM {Math.round(epley(Number(s.weight), s.reps || 0))}</span></span></div>)}</div> : <p className="text-sm text-faint">PRs are detected automatically when a set beats your previous best weight or estimated 1RM.</p>}
      </Card>
    </div>
  );
}
