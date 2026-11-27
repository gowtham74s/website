"use client";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarPlus, Play, Plus, Replace, Settings2, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { suggestOverload, type Overload, weekday, addDays } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { Exercise, PlanExercise, WorkoutPlan } from "@/lib/types";
import { lastSessions, startWorkout } from "@/lib/workout";
import { ExercisePicker, useExercises } from "@/components/exercise-picker";
import { Badge, Button, Card, Empty, IconButton, Input, Spinner, useAction } from "@/components/ui";
import { PlanSheet } from "@/components/plan-sheet";

export default function PlanEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const act = useAction();
  const { profile } = useProfile();
  const plans = useRows<WorkoutPlan>({ table: "workout_plans", filters: [["id", "eq", id]] });
  const pe = useRows<PlanExercise>({ table: "plan_exercises", filters: [["plan_id", "eq", id]], order: [["position", true]] });
  const lib = useExercises();
  const [pick, setPick] = useState<null | { replace?: PlanExercise }>(null);
  const [edit, setEdit] = useState(false);
  const [sugs, setSugs] = useState<Map<string, Overload>>(new Map());
  const plan = plans.rows[0];
  const byId = new Map(lib.rows.map((e) => [e.id, e]));

  const exIds = pe.rows.map((p) => p.exercise_id).join(",");
  useEffect(() => {
    if (!pe.rows.length) return;
    lastSessions(pe.rows.map((p) => p.exercise_id), 2).then((h) => {
      const m = new Map<string, Overload>();
      pe.rows.forEach((p) => m.set(p.id, suggestOverload((h.get(p.exercise_id) || []).map((s) => s.map((x) => ({ weight: Number(x.weight), reps: x.reps }))), p.reps, byId.get(p.exercise_id)?.muscle_group ?? null)));
      setSugs(m);
    }).catch(() => {});
  }, [exIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!plan) return plans.isLoading ? <Spinner /> : <Empty title="Plan not found" action={<Link href="/workout">Back</Link>} />;

  const add = (e: Exercise) => act(async () => {
    if (pick?.replace) await updateById("plan_exercises", pick.replace.id, { exercise_id: e.id, rest_seconds: e.default_rest_seconds });
    else await insertRows("plan_exercises", { plan_id: id, exercise_id: e.id, position: pe.rows.length, sets: e.default_sets, reps: e.default_reps, weight: e.default_weight, rest_seconds: e.default_rest_seconds });
    setPick(null);
  });
  const move = (i: number, dir: -1 | 1) => act(async () => {
    const j = i + dir; if (j < 0 || j >= pe.rows.length) return;
    await Promise.all([updateById("plan_exercises", pe.rows[i].id, { position: j }), updateById("plan_exercises", pe.rows[j].id, { position: i })]);
  });
  const patch = (p: PlanExercise, k: keyof PlanExercise, v: string) => updateById("plan_exercises", p.id, { [k]: k === "notes" || k === "tempo" ? v : Number(v) || 0 }).catch(() => {});

  const addToCalendar = () => act(async () => {
    if (!plan.scheduled_days?.length) throw new Error("Schedule this plan on at least one weekday first.");
    const time = (profile?.preferred_workout_time || "18:00").slice(0, 5);
    const t = today();
    await insertRows("calendar_events", plan.scheduled_days.map((wd) => {
      const k = addDays(t, (wd - weekday(t) + 7) % 7);
      const s = new Date(`${k}T${time}:00`);
      return { title: plan.name, type: "workout", start_at: s.toISOString(), end_at: new Date(s.getTime() + plan.estimated_minutes * 60000).toISOString(), recurrence: "weekly", reminder_minutes: 30, source: "workout_plan", source_ref: plan.id };
    }));
  }, "Added to your calendar as weekly events");

  return (
    <div className="anim-rise">
      <Link href="/workout" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Workouts</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="h-10 w-1.5 rounded-full" style={{ background: plan.color }} /><div><h1 className="font-display text-3xl font-semibold tracking-tight">{plan.name}</h1><p className="text-sm capitalize text-muted">{plan.split_type.replace("_", " ")} · {pe.rows.length} exercises · {pe.rows.reduce((a, p) => a + p.sets, 0)} sets</p></div></div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEdit(true)} icon={<Settings2 className="size-4" />}>Schedule</Button>
          <Button onClick={addToCalendar} icon={<CalendarPlus className="size-4" />}>Add to calendar</Button>
          <Button variant="warm" onClick={() => act(async () => { const w = await startWorkout({ planId: id, name: plan.name }); router.push(`/workout/session/${w.id}`); })} icon={<Play className="size-4" />}>Start</Button>
        </div>
      </div>
      {!pe.rows.length ? <Card><Empty title="No exercises yet" body="Add exercises from the library. Sets, reps and weights are editable per plan." action={<Button onClick={() => setPick({})} icon={<Plus className="size-4" />}>Add exercise</Button>} /></Card> : (
        <div className="space-y-3">
          {pe.rows.map((p, i) => {
            const e = byId.get(p.exercise_id);
            const s = sugs.get(p.id);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start gap-2">
                  <span className="num mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-card-2 text-xs font-semibold text-muted">{i + 1}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{e?.name ?? "…"}</div><div className="text-xs capitalize text-faint">{e?.muscle_group} · {e?.equipment}</div></div>
                  <IconButton label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="size-4" /></IconButton>
                  <IconButton label="Move down" onClick={() => move(i, 1)} disabled={i === pe.rows.length - 1}><ArrowDown className="size-4" /></IconButton>
                  <IconButton label="Replace" onClick={() => setPick({ replace: p })}><Replace className="size-4" /></IconButton>
                  <IconButton label="Remove" onClick={() => act(() => deleteById("plan_exercises", p.id), "Removed")}><Trash2 className="size-4" /></IconButton>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {([["sets", "Sets"], ["reps", "Reps"], ["weight", "Weight"], ["rest_seconds", "Rest s"]] as const).map(([k, l]) => (
                    <label key={k} className="rounded-xl border border-line bg-bg-2 px-2 py-1.5 text-center"><span className="block text-[10px] uppercase tracking-wide text-faint">{l}</span>
                      <input inputMode="decimal" defaultValue={p[k] as number} onBlur={(ev) => patch(p, k, ev.target.value)} className="num w-full bg-transparent text-center text-base font-semibold outline-none" /></label>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-[100px_1fr] gap-2"><Input placeholder="Tempo" defaultValue={p.tempo ?? ""} onBlur={(ev) => patch(p, "tempo", ev.target.value)} className="py-2 text-sm" /><Input placeholder="Notes (cues, setup…)" defaultValue={p.notes ?? ""} onBlur={(ev) => patch(p, "notes", ev.target.value)} className="py-2 text-sm" /></div>
                {s && s.action !== "none" && (
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2 text-sm">
                    <TrendingUp className={s.action === "increase" ? "size-4 text-good" : "size-4 text-faint"} />
                    <span className="flex-1 text-muted">{s.reason}</span>
                    {s.action === "increase" && <Badge tone="good">{s.weight} kg</Badge>}
                  </div>
                )}
              </Card>
            );
          })}
          <Button className="w-full" size="lg" onClick={() => setPick({})} icon={<Plus className="size-4" />}>Add exercise</Button>
          <p className="text-xs text-faint">Changes save when you leave a field. Progression hints come from your last two logged sessions; weights in the session pre-fill from your last performance.</p>
        </div>
      )}
      <ExercisePicker open={!!pick} onClose={() => setPick(null)} onPick={add} title={pick?.replace ? "Replace exercise" : "Add exercise"} suggestNames={pick?.replace ? byId.get(pick.replace.exercise_id)?.alternatives : undefined} />
      <PlanSheet plan={edit ? plan : null} onClose={() => setEdit(false)} count={0} />
    </div>
  );
}
