"use client";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { insertRows, useRows } from "@/lib/data";
import type { Exercise } from "@/lib/types";
import { Button, Chip, Field, Input, Select, Sheet, Textarea, useAction } from "./ui";

export const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "traps", "full body", "cardio", "mobility"];

export function useExercises() {
  return useRows<Exercise>({ table: "exercises", order: [["name", true]] });
}

export function ExercisePicker({ open, onClose, onPick, title = "Add exercise", suggestNames }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void; title?: string; suggestNames?: string[] }) {
  const { rows } = useExercises();
  const [q, setQ] = useState("");
  const [m, setM] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => {
    const s = q.toLowerCase().trim();
    return rows.filter((e) => (!m || e.muscle_group === m) && (!s || `${e.name} ${e.equipment} ${e.muscle_group}`.toLowerCase().includes(s)));
  }, [rows, q, m]);
  const suggested = suggestNames?.length ? rows.filter((e) => suggestNames.includes(e.name)) : [];
  return (
    <Sheet open={open} onClose={() => { setCreating(false); onClose(); }} title={creating ? "New exercise" : title}>
      {creating ? <ExerciseForm onSaved={(e) => { setCreating(false); onPick(e); }} /> : (
        <>
          <div className="relative mb-2"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>
          <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1"><Chip active={!m} onClick={() => setM(null)}>All</Chip>{MUSCLES.map((x) => <Chip key={x} active={m === x} onClick={() => setM(x)}>{x}</Chip>)}</div>
          {suggested.length > 0 && !q && (
            <div className="mb-3"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Alternatives</div>
              {suggested.map((e) => <Row key={e.id} e={e} onPick={onPick} />)}</div>
          )}
          <div className="max-h-[50dvh] overflow-y-auto">{list.map((e) => <Row key={e.id} e={e} onPick={onPick} />)}</div>
          <Button className="mt-3 w-full" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>Create custom exercise</Button>
        </>
      )}
    </Sheet>
  );
}

function Row({ e, onPick }: { e: Exercise; onPick: (e: Exercise) => void }) {
  return (
    <button onClick={() => onPick(e)} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left hover:bg-card-2">
      <div className="min-w-0"><div className="truncate font-medium">{e.name}{e.user_id && <span className="ml-1.5 text-[11px] text-faint">custom</span>}</div><div className="text-xs capitalize text-faint">{e.muscle_group} · {e.equipment}</div></div>
      <Plus className="size-4 shrink-0 text-good" />
    </button>
  );
}

export function ExerciseForm({ onSaved, initial }: { onSaved: (e: Exercise) => void; initial?: Partial<Exercise> }) {
  const act = useAction();
  const [f, setF] = useState({ name: initial?.name ?? "", muscle_group: initial?.muscle_group ?? "chest", equipment: initial?.equipment ?? "dumbbell", category: initial?.category ?? "strength", instructions: initial?.instructions ?? "", default_sets: 3, default_reps: 10, default_rest_seconds: 90, tempo: "", media_url: "", alternatives: "" });
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle group"><Select value={f.muscle_group} onChange={(e) => setF({ ...f, muscle_group: e.target.value })}>{MUSCLES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Equipment"><Select value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })}>{["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "band", "other"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["strength", "bodyweight", "cardio", "mobility"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
        <Field label="Tempo (optional)"><Input placeholder="3-1-1-0" value={f.tempo} onChange={(e) => setF({ ...f, tempo: e.target.value })} /></Field>
        <Field label="Default sets"><Input inputMode="numeric" value={f.default_sets} onChange={(e) => setF({ ...f, default_sets: Number(e.target.value) || 0 })} /></Field>
        <Field label="Default reps"><Input inputMode="numeric" value={f.default_reps} onChange={(e) => setF({ ...f, default_reps: Number(e.target.value) || 0 })} /></Field>
        <Field label="Rest (sec)"><Input inputMode="numeric" value={f.default_rest_seconds} onChange={(e) => setF({ ...f, default_rest_seconds: Number(e.target.value) || 0 })} /></Field>
        <Field label="Video / image URL"><Input value={f.media_url} onChange={(e) => setF({ ...f, media_url: e.target.value })} /></Field>
      </div>
      <Field label="Instructions"><Textarea value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
      <Field label="Alternatives (comma separated)"><Input value={f.alternatives} onChange={(e) => setF({ ...f, alternatives: e.target.value })} /></Field>
      <Button variant="good" className="w-full" disabled={!f.name.trim()} onClick={() => act(async () => {
        const [e] = await insertRows("exercises", { ...f, name: f.name.trim(), tempo: f.tempo || null, media_url: f.media_url || null, alternatives: f.alternatives.split(",").map((s) => s.trim()).filter(Boolean) });
        onSaved(e as unknown as Exercise);
      }, "Exercise saved")}>Save exercise</Button>
    </div>
  );
}
