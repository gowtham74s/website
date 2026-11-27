"use client";
// Gym-optimised execution mode: one exercise at a time, big targets, steppers instead of typing,
// automatic rest timer, previous performance inline, live PR detection.
import { Check, ChevronLeft, ChevronRight, Minus, MoreHorizontal, Pause, Play, Plus, Replace, SkipForward, StickyNote, Timer, Trophy, X, Flag } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { groupBy, isPersonalRecord, setVolume, suggestOverload } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import type { Exercise, RecoveryLog, Workout, WorkoutSet } from "@/lib/types";
import { fmtSec, fmtMin } from "@/lib/units";
import { addExerciseSets, lastSessions } from "@/lib/workout";
import { ExercisePicker, useExercises } from "@/components/exercise-picker";
import { Badge, Button, Confirm, cx, IconButton, Metric, Sheet, Spinner, Textarea, useAction, useToast } from "@/components/ui";
import { today, useProfile } from "@/lib/hooks";
import { readiness } from "@/lib/calc";

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const act = useAction();
  const toast = useToast();
  const wq = useRows<Workout>({ table: "workouts", filters: [["id", "eq", id]] });
  const sq = useRows<WorkoutSet>({ table: "workout_sets", filters: [["workout_id", "eq", id]], order: [["exercise_order", true], ["set_number", true]] });
  const lib = useExercises();
  const rec = useRows<RecoveryLog>({ table: "recovery_logs", filters: [["date", "eq", today()]] });
  const w = wq.rows[0];
  const { profile } = useProfile();
  const U = profile?.unit_weight ?? "kg"; // gym weights are logged in your display unit
  const sets = sq.rows;
  const groups = useMemo(() => [...groupBy(sets, (s) => String(s.exercise_order)).entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, ss]) => ss), [sets]);
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [rest, setRest] = useState<{ end: number; total: number } | null>(null);
  const [hist, setHist] = useState<Map<string, WorkoutSet[][]>>(new Map());
  const [picker, setPicker] = useState<null | "add" | "replace">(null);
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(false);
  const [finish, setFinish] = useState(false);
  const [summary, setSummary] = useState<null | { dur: number; vol: number; sets: number; prs: WorkoutSet[] }>(null);
  const [discard, setDiscard] = useState(false);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const ids = [...new Set(sets.map((s) => s.exercise_id).filter(Boolean))] as string[];
  const idKey = ids.join(",");
  useEffect(() => { if (ids.length) lastSessions(ids, 30).then(setHist).catch(() => {}); }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (idx >= groups.length && groups.length) setIdx(groups.length - 1); }, [groups.length, idx]);
  // rest timer finished
  useEffect(() => {
    if (rest && now >= rest.end) {
      setRest(null);
      navigator.vibrate?.([200, 100, 200]);
      try { const a = new AudioContext(); const o = a.createOscillator(); o.frequency.value = 880; o.connect(a.destination); o.start(); o.stop(a.currentTime + 0.25); } catch { /* no audio */ }
      toast("Rest over — next set", { tone: "info" });
    }
  }, [now, rest, toast]);

  if (!w) return <div className="grid min-h-dvh place-items-center">{wq.isLoading ? <Spinner /> : <Button onClick={() => router.push("/workout")}>Workout not found — back</Button>}</div>;

  const paused = w.status === "paused";
  const elapsed = Math.max(0, Math.floor(((paused && w.paused_at ? new Date(w.paused_at).getTime() : now) - new Date(w.started_at).getTime()) / 1000) - (w.paused_seconds || 0));
  const g = groups[idx] || [];
  const exId = g[0]?.exercise_id;
  const exInfo = lib.rows.find((e) => e.id === exId);
  const prev = exId ? hist.get(exId) || [] : [];
  const flatPrev = prev.flat();
  const ready = readiness(rec.rows[0], null, 8);
  const sug = suggestOverload(prev.map((s) => s.map((x) => ({ weight: Number(x.weight), reps: x.reps }))), g[0]?.target_reps ?? 8, g[0]?.muscle_group ?? null, ready?.status === "recovery");
  const doneSets = sets.filter((s) => s.completed).length;
  const vol = sets.reduce((a, s) => a + setVolume(s), 0);
  const exDone = (ss: WorkoutSet[]) => ss.every((s) => s.completed || s.skipped);
  const fullyDone = groups.length > 0 && groups.every(exDone);

  const patch = (s: WorkoutSet, p: Partial<WorkoutSet>) => updateById("workout_sets", s.id, p as Record<string, unknown>).catch((e) => toast(e.message, { tone: "bad" }));
  const complete = (s: WorkoutSet) => {
    if (s.completed) return patch(s, { completed: false, completed_at: null, is_pr: false });
    // PR vs all previous sessions + earlier sets today
    const earlier = [...flatPrev, ...g.filter((x) => x.completed && x.id !== s.id)].map((x) => ({ weight: Number(x.weight), reps: x.reps }));
    const pr = isPersonalRecord({ weight: Number(s.weight), reps: s.reps || 0 }, flatPrev.length ? earlier : []);
    patch(s, { completed: true, completed_at: new Date().toISOString(), is_pr: pr });
    if (pr) toast(<span className="flex items-center gap-1.5"><Trophy className="size-4 text-warm" />New PR — {s.exercise_name} {s.weight}×{s.reps}</span>);
    const restS = s.rest_seconds || 90;
    const last = g.filter((x) => !x.completed && !x.skipped && x.id !== s.id).length === 0;
    if (restS > 0) setRest({ end: Date.now() + restS * 1000, total: restS });
    if (last && idx < groups.length - 1) setTimeout(() => setIdx(idx + 1), 400);
  };
  const togglePause = () => act(() => paused
    ? updateById("workouts", w.id, { status: "in_progress", paused_at: null, paused_seconds: (w.paused_seconds || 0) + Math.floor((Date.now() - new Date(w.paused_at!).getTime()) / 1000) })
    : updateById("workouts", w.id, { status: "paused", paused_at: new Date().toISOString() }));
  const addSet = () => { const l = g[g.length - 1]; if (l) act(() => insertRows("workout_sets", { workout_id: w.id, exercise_id: l.exercise_id, exercise_name: l.exercise_name, muscle_group: l.muscle_group, exercise_order: l.exercise_order, set_number: l.set_number + 1, target_reps: l.target_reps, reps: l.reps, weight: l.weight, rest_seconds: l.rest_seconds, completed: false })); };
  const removeSet = () => { const l = [...g].reverse().find((x) => !x.completed); if (l && g.length > 1) act(() => deleteById("workout_sets", l.id)); };
  const skip = () => act(async () => { await Promise.all(g.filter((s) => !s.completed).map((s) => updateById("workout_sets", s.id, { skipped: true }))); if (idx < groups.length - 1) setIdx(idx + 1); setMenu(false); }, "Exercise skipped");
  const onPick = (e: Exercise) => act(async () => {
    if (picker === "replace") await Promise.all(g.filter((s) => !s.completed).map((s) => updateById("workout_sets", s.id, { exercise_id: e.id, exercise_name: e.name, muscle_group: e.muscle_group, weight: e.default_weight, reps: e.default_reps, target_reps: e.default_reps, rest_seconds: e.default_rest_seconds })));
    else { const order = groups.length ? Math.max(...sets.map((s) => s.exercise_order)) + 1 : 0; await addExerciseSets(w.id, e, order); setTimeout(() => setIdx(groups.length), 100); }
    setPicker(null); setMenu(false);
  });
  const doFinish = () => act(async () => {
    const dur = elapsed;
    const total = Math.round(vol);
    await updateById("workouts", w.id, { status: "completed", ended_at: new Date().toISOString(), duration_seconds: dur, total_volume: total, paused_at: null });
    setFinish(false);
    setSummary({ dur, vol: total, sets: doneSets, prs: sets.filter((s) => s.is_pr) });
  });

  const restLeft = rest ? Math.max(0, Math.ceil((rest.end - now) / 1000)) : 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      {/* header */}
      <header className="safe-t sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur-xl">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <IconButton label="Minimise" onClick={() => router.push("/workout")}><ChevronLeft className="size-5" /></IconButton>
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{w.name}</div><div className="num text-xs text-faint">{doneSets}/{sets.length} sets · {Math.round(vol).toLocaleString()} {U}</div></div>
          <div className={cx("num rounded-xl px-3 py-1.5 font-display text-lg font-semibold", paused ? "bg-warm-soft text-warm" : "bg-card-2")}>{fmtSec(elapsed)}</div>
          <IconButton label={paused ? "Resume" : "Pause"} onClick={togglePause}>{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</IconButton>
          <Button size="sm" variant={fullyDone ? "good" : "secondary"} onClick={() => setFinish(true)} icon={<Flag className="size-3.5" />}>Finish</Button>
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {groups.map((ss, i) => (
            <button key={i} onClick={() => setIdx(i)} className={cx("flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition", i === idx ? "border-fg bg-fg text-bg" : exDone(ss) ? "border-good/40 bg-good-soft text-good" : "border-line text-muted")}>
              {exDone(ss) && i !== idx && <Check className="size-3" strokeWidth={3} />}{ss[0].exercise_name}
            </button>
          ))}
          <button onClick={() => setPicker("add")} className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-dashed border-line-2 px-3 text-xs text-muted"><Plus className="size-3" />Add</button>
        </div>
      </header>

      {paused && <div className="bg-warm-soft px-4 py-2 text-center text-sm font-medium text-warm">Paused — timer stopped</div>}

      <main className="flex-1 px-4 pb-40 pt-4">
        {!groups.length ? (
          <div className="py-16 text-center"><p className="mb-4 text-muted">Empty session. Add your first exercise.</p><Button size="lg" variant="warm" onClick={() => setPicker("add")} icon={<Plus className="size-4" />}>Add exercise</Button></div>
        ) : (
          <div key={idx} className="anim-rise">
            <div className="mb-1 flex items-start justify-between gap-2">
              <div><div className="text-xs font-semibold uppercase tracking-wider text-faint">Exercise {idx + 1} of {groups.length} · <span className="capitalize">{g[0].muscle_group}</span></div><h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{g[0].exercise_name}</h1></div>
              <IconButton label="Exercise options" onClick={() => setMenu(true)}><MoreHorizontal className="size-5" /></IconButton>
            </div>
            {prev[0] && <div className="num mb-1 text-sm text-muted">Last time: {prev[0].map((s) => `${s.weight}×${s.reps}`).join(", ")}</div>}
            {sug.action !== "none" && <div className={cx("mb-4 rounded-xl px-3 py-2 text-sm", sug.action === "increase" ? "bg-good-soft text-good" : "bg-card-2 text-muted")}>{sug.reason}</div>}
            {exInfo?.instructions && <details className="mb-4 text-sm text-muted"><summary className="cursor-pointer text-faint">Form cues</summary><p className="mt-1">{exInfo.instructions}</p></details>}

            <div className="space-y-2.5">
              {g.map((s) => (
                <div key={s.id} className={cx("rounded-2xl border p-3 transition", s.completed ? "border-good/40 bg-good-soft" : s.skipped ? "border-line opacity-50" : "border-line bg-card")}>
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted">SET {s.set_number}{s.target_reps ? <span className="font-normal text-faint"> · target {s.target_reps}</span> : null}</span>
                    {s.is_pr && <Badge tone="warm"><Trophy className="size-3" />PR</Badge>}
                    {s.skipped && <Badge>Skipped</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <NumPad value={Number(s.weight)} step={2.5} unit={U} onChange={(v) => patch(s, { weight: v })} disabled={s.completed} />
                    <NumPad value={s.reps ?? 0} step={1} unit="reps" onChange={(v) => patch(s, { reps: v })} disabled={s.completed} />
                    <button aria-label={s.completed ? "Undo set" : "Complete set"} onClick={() => complete(s)} disabled={s.skipped}
                      className={cx("grid size-16 shrink-0 place-items-center rounded-2xl transition active:scale-90", s.completed ? "anim-pop bg-good text-black" : "border-2 border-line-2 text-muted hover:border-good hover:text-good")}>
                      <Check className="size-8" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={addSet} icon={<Plus className="size-4" />}>Add set</Button>
              <Button onClick={removeSet} disabled={g.length <= 1} icon={<Minus className="size-4" />}>Remove set</Button>
            </div>
            <div className="mt-6 flex justify-between">
              <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)} icon={<ChevronLeft className="size-4" />}>Previous</Button>
              <Button variant="ghost" disabled={idx >= groups.length - 1} onClick={() => setIdx(idx + 1)}>Next<ChevronRight className="size-4" /></Button>
            </div>
          </div>
        )}
      </main>

      {/* rest timer */}
      {rest && (
        <div className="safe-b anim-sheet fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 px-4 pb-4 pt-3 backdrop-blur-xl">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--ring-track)]"><div className="h-full rounded-full bg-warm transition-[width] duration-300" style={{ width: `${(restLeft / rest.total) * 100}%` }} /></div>
            <div className="flex items-center gap-3">
              <Timer className="size-5 text-warm" />
              <div className="flex-1"><div className="text-xs text-faint">Rest</div><div className="num font-display text-3xl font-semibold">{fmtSec(restLeft)}</div></div>
              <Button onClick={() => setRest({ ...rest, end: rest.end - 15000 })}>−15</Button>
              <Button onClick={() => setRest({ end: rest.end + 15000, total: rest.total + 15 })}>+15</Button>
              <Button variant="warm" onClick={() => setRest(null)} icon={<SkipForward className="size-4" />}>Skip</Button>
            </div>
          </div>
        </div>
      )}
      {!rest && (
        <div className="safe-b fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-2xl gap-2">
            <Button className="flex-1" onClick={() => setNotes(true)} icon={<StickyNote className="size-4" />}>Notes</Button>
            <Button className="flex-1" onClick={() => setRest({ end: Date.now() + 90000, total: 90 })} icon={<Timer className="size-4" />}>Rest 1:30</Button>
          </div>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={g[0]?.exercise_name}>
        <div className="grid gap-2">
          <Button size="lg" onClick={() => { setMenu(false); setPicker("replace"); }} icon={<Replace className="size-4" />}>Replace exercise</Button>
          <Button size="lg" onClick={skip} icon={<SkipForward className="size-4" />}>Skip exercise</Button>
          <Button size="lg" variant="danger" onClick={() => act(async () => { await Promise.all(g.map((s) => deleteById("workout_sets", s.id))); setMenu(false); }, "Exercise removed")} icon={<X className="size-4" />}>Remove from session</Button>
        </div>
      </Sheet>
      <ExercisePicker open={!!picker} onClose={() => setPicker(null)} onPick={onPick} title={picker === "replace" ? "Replace with" : "Add exercise"} suggestNames={picker === "replace" ? exInfo?.alternatives : undefined} />
      <Sheet open={notes} onClose={() => setNotes(false)} title="Workout notes">
        <Textarea rows={5} defaultValue={w.notes ?? ""} onBlur={(e) => updateById("workouts", w.id, { notes: e.target.value }).catch(() => {})} placeholder="How did it feel? Anything to change next time?" />
      </Sheet>
      <Sheet open={finish} onClose={() => setFinish(false)} title="Finish workout?" footer={<div className="flex gap-2"><Button variant="danger" onClick={() => { setFinish(false); setDiscard(true); }}>Discard</Button><Button variant="good" className="flex-1" onClick={doFinish}>Finish & save</Button></div>}>
        <div className="grid grid-cols-3 gap-3"><Metric label="Duration" value={fmtMin(Math.round(elapsed / 60))} /><Metric label="Sets done" value={`${doneSets}/${sets.length}`} /><Metric label="Volume" value={Math.round(vol).toLocaleString()} unit={U} /></div>
        {!fullyDone && <p className="mt-3 text-sm text-warm">Some sets aren&apos;t marked complete. They&apos;ll be saved as not done.</p>}
      </Sheet>
      <Confirm open={discard} onClose={() => setDiscard(false)} title="Discard this workout?" body="All sets in this session will be deleted." confirmLabel="Discard" onConfirm={() => act(async () => { await deleteById("workouts", w.id); router.replace("/workout"); })} />
      <Sheet open={!!summary} onClose={() => router.replace("/")} title="Workout complete" footer={<Button variant="good" size="lg" className="w-full" onClick={() => router.replace("/")}>Done</Button>}>
        {summary && (
          <div>
            <div className="mb-4 grid grid-cols-3 gap-3"><Metric label="Duration" value={fmtMin(Math.round(summary.dur / 60))} /><Metric label="Sets" value={summary.sets} /><Metric label="Volume" value={summary.vol.toLocaleString()} unit={U} /></div>
            {summary.prs.length > 0 ? <div className="space-y-1.5">{summary.prs.map((p) => <div key={p.id} className="flex items-center gap-2 rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm"><Trophy className="size-4" />{p.exercise_name} — {p.weight} × {p.reps}</div>)}</div> : <p className="text-sm text-muted">No PRs this time — consistency is what drives them.</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function NumPad({ value, step, unit, onChange, disabled }: { value: number; step: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = (n: number) => { const r = Math.max(0, Math.round(n * 100) / 100); setV(String(r)); onChange(r); };
  return (
    <div className={cx("flex min-w-0 flex-1 items-center rounded-xl bg-bg-2", disabled && "opacity-70")}>
      <button aria-label={`Less ${unit}`} disabled={disabled} onClick={() => commit(value - step)} className="grid h-14 w-10 shrink-0 place-items-center text-muted active:scale-90"><Minus className="size-4" /></button>
      <div className="min-w-0 flex-1 text-center">
        <input inputMode="decimal" disabled={disabled} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit(parseFloat(v.replace(",", ".")) || 0)} className="num w-full bg-transparent text-center text-2xl font-semibold outline-none" />
        <div className="-mt-1 text-[10px] uppercase tracking-wide text-faint">{unit}</div>
      </div>
      <button aria-label={`More ${unit}`} disabled={disabled} onClick={() => commit(value + step)} className="grid h-14 w-10 shrink-0 place-items-center text-muted active:scale-90"><Plus className="size-4" /></button>
    </div>
  );
}
