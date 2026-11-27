"use client";
import { useState } from "react";
import { insertRows, updateById } from "@/lib/data";
import type { WorkoutPlan } from "@/lib/types";
import { Button, Chip, cx, Field, Input, Sheet, Textarea, useAction } from "./ui";

const SPLIT_TYPES = ["push", "pull", "legs", "upper", "lower", "chest_back", "arms", "shoulders", "full_body", "cardio", "rest", "custom"];
const COLORS = ["#f59e0b", "#10b981", "#60a5fa", "#a78bfa", "#22d3ee", "#f472b6", "#fb923c", "#94a3b8"];

export function PlanSheet({ plan, onClose, count, onCreated }: { plan: WorkoutPlan | "new" | null; onClose: () => void; count: number; onCreated?: (id: string) => void }) {
  const act = useAction();
  const p = plan && plan !== "new" ? plan : null;
  const [f, setF] = useState<Partial<WorkoutPlan>>({});
  const v = { name: "", split_type: "custom", color: COLORS[count % COLORS.length], scheduled_days: [] as number[], estimated_minutes: 60, notes: "", ...(p || {}), ...f };
  const close = () => { setF({}); onClose(); };
  return (
    <Sheet open={!!plan} onClose={close} title={p ? "Edit plan" : "New workout plan"} footer={<Button variant="good" className="w-full" disabled={!v.name.trim()} onClick={() => act(async () => {
      const row = { name: v.name.trim(), split_type: v.split_type, color: v.color, scheduled_days: v.scheduled_days, estimated_minutes: v.estimated_minutes, notes: v.notes || null };
      if (p) await updateById("workout_plans", p.id, row); else { const [n] = await insertRows("workout_plans", { ...row, position: count }); onCreated?.(n.id); }
      close();
    }, "Plan saved")}>Save</Button>}>
      <div className="space-y-4">
        <Field label="Name"><Input value={v.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Push day" /></Field>
        <Field label="Type"><div className="flex flex-wrap gap-1.5">{SPLIT_TYPES.map((s) => <Chip key={s} active={v.split_type === s} onClick={() => setF({ ...f, split_type: s })}>{s.replace("_", " ")}</Chip>)}</div></Field>
        <Field label="Scheduled days (reschedule any time)"><div className="flex gap-1.5">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => <Chip key={d} active={v.scheduled_days.includes(i)} onClick={() => setF({ ...f, scheduled_days: v.scheduled_days.includes(i) ? v.scheduled_days.filter((x) => x !== i) : [...v.scheduled_days, i].sort() })}>{d}</Chip>)}</div></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated minutes"><Input inputMode="numeric" value={v.estimated_minutes} onChange={(e) => setF({ ...f, estimated_minutes: Number(e.target.value) || 0 })} /></Field>
          <Field label="Colour"><div className="flex flex-wrap gap-1.5 pt-1">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setF({ ...f, color: c })} className={cx("size-7 rounded-full ring-offset-2 ring-offset-card", v.color === c && "ring-2 ring-fg")} style={{ background: c }} />)}</div></Field>
        </div>
        <Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}

