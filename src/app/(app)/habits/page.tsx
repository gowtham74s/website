"use client";
import { Check, Flame, ListChecks, Pencil, Plus, Trash2, Trophy, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addDays, habitCompletionRate, habitScheduled, habitStreaks, rangeKeys } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { today } from "@/lib/hooks";
import type { Habit, Reminder } from "@/lib/types";
import { Heatmap } from "@/components/charts";
import { toggleHabit } from "@/components/loggers";
import { Badge, Button, Card, Chip, Confirm, cx, Empty, Field, IconButton, Input, PageHeader, Section, Segmented, Select, Sheet, useAction } from "@/components/ui";

const METRICS: Record<string, string> = { workout: "Workout completed", protein: "Protein target hit", calories: "Calories within ±10%", water: "Water target hit", walk: "Walking target hit", sleep: "Sleep target hit" };
const COLORS = ["#10b981", "#f59e0b", "#60a5fa", "#a78bfa", "#22d3ee", "#f472b6", "#ef4444", "#9a9ca3"];

export default function HabitsPage() {
  const act = useAction();
  const t = today();
  const from = addDays(t, -90);
  const habits = useRows<Habit>({ table: "habits", filters: [["archived", "eq", false]], order: [["position", true]] });
  const logs = useRows<{ id: string; habit_id: string; date: string; completed: boolean; user_id: string }>({ table: "habit_logs", filters: [["date", "gte", from]] });
  const [edit, setEdit] = useState<Habit | "new" | null>(null);
  const [del, setDel] = useState<Habit | null>(null);
  const [range, setRange] = useState<"week" | "month" | "quarter">("month");
  const todays = habits.rows.filter((h) => habitScheduled(h, t));
  const done = todays.filter((h) => logs.rows.some((l) => l.habit_id === h.id && l.date === t && l.completed));
  const days = range === "week" ? 7 : range === "month" ? 35 : 91;
  const overall = useMemo(() => {
    const ks = rangeKeys(addDays(t, -29), t);
    let sched = 0, ok = 0;
    for (const k of ks) for (const h of habits.rows.filter((x) => x.frequency === "daily")) if (habitScheduled(h, k)) { sched++; if (logs.rows.some((l) => l.habit_id === h.id && l.date === k)) ok++; }
    return sched ? Math.round((ok / sched) * 100) : 0;
  }, [habits.rows, logs.rows, t]);

  return (
    <div className="anim-rise">
      <PageHeader title="Habits" sub={`${done.length} of ${todays.length} done today · ${overall}% over 30 days`} action={<Button variant="good" onClick={() => setEdit("new")} icon={<Plus className="size-4" />}>Habit</Button>} />
      <Section title="Today">
        {todays.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {todays.map((h) => {
              const isDone = logs.rows.some((l) => l.habit_id === h.id && l.date === t && l.completed);
              const st = habitStreaks(h, logs.rows as never, t);
              return (
                <button key={h.id} onClick={() => act(() => toggleHabit(h, logs.rows as never, t))} className={cx("flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[.99]", isDone ? "border-good/30 bg-good-soft" : "border-line bg-card")}>
                  <span className={cx("grid size-8 shrink-0 place-items-center rounded-full border-2 transition", isDone ? "anim-pop text-black" : "border-line-2")} style={isDone ? { background: h.color, borderColor: h.color } : undefined}>{isDone && <Check className="size-4" strokeWidth={3} />}</span>
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{h.name}</div><div className="text-xs text-faint">{h.frequency === "weekly" ? `${h.target_per_week}× per week` : "Daily"}{h.auto_metric && " · auto"}</div></div>
                  {st.current > 0 && <span className="num flex items-center gap-1 text-sm font-semibold text-warm"><Flame className="size-4" />{st.current}</span>}
                </button>
              );
            })}
          </div>
        ) : <Card><Empty icon={<ListChecks className="size-5" />} title="No habits scheduled today" body="Create habits like 'Read 10 pages' or link one to a target so it completes itself." action={<Button onClick={() => setEdit("new")}>Create habit</Button>} /></Card>}
      </Section>

      <Section title="History" action={<Segmented size="sm" value={range} onChange={setRange} options={[{ value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "quarter", label: "90 days" }]} />}>
        <div className="space-y-3">
          {habits.rows.map((h) => {
            const st = habitStreaks(h, logs.rows as never, t);
            const rate = habitCompletionRate(h, logs.rows as never, addDays(t, -(days - 1)), t);
            const cells = rangeKeys(addDays(t, -(days - 1)), t).map((k) => ({ date: k, value: habitScheduled(h, k) || logs.rows.some((l) => l.habit_id === h.id && l.date === k) ? (logs.rows.some((l) => l.habit_id === h.id && l.date === k && l.completed) ? 1 : 0) : null }));
            return (
              <Card key={h.id} className="p-4">
                <div className="mb-3 flex items-start gap-3">
                  <span className="mt-1 size-3 shrink-0 rounded-full" style={{ background: h.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">{h.name}{h.auto_metric && <Badge tone="info"><Zap className="size-3" />auto</Badge>}{h.is_demo && <Badge>Demo</Badge>}</div>
                    <div className="num mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted"><span className="flex items-center gap-1"><Flame className="size-3 text-warm" />{st.current} current</span><span className="flex items-center gap-1"><Trophy className="size-3" />{st.best} best</span><span>{rate}% ({range === "week" ? "7d" : range === "month" ? "35d" : "90d"})</span>{h.reminder_time && <span>⏰ {h.reminder_time.slice(0, 5)}</span>}</div>
                  </div>
                  <IconButton label="Edit" onClick={() => setEdit(h)}><Pencil className="size-4" /></IconButton>
                  <IconButton label="Delete" onClick={() => setDel(h)}><Trash2 className="size-4" /></IconButton>
                </div>
                {range === "week" ? (
                  <div className="grid grid-cols-7 gap-1.5">{cells.map((c) => (
                    <button key={c.date} onClick={() => act(() => toggleHabit(h, logs.rows as never, c.date))} className={cx("rounded-lg py-1.5 text-center text-[11px]", c.value === 1 ? "text-black" : c.value === 0 ? "bg-[var(--ring-track)] text-muted" : "border border-dashed border-line text-faint")} style={c.value === 1 ? { background: h.color } : undefined}>
                      <div>{new Date(`${c.date}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</div><div className="num font-semibold">{Number(c.date.slice(8))}</div>
                    </button>
                  ))}</div>
                ) : <Heatmap days={cells} color={h.color} label={(c) => `${c.date}: ${c.value === 1 ? "done" : c.value === 0 ? "missed" : "not scheduled"}`} />}
              </Card>
            );
          })}
        </div>
      </Section>
      <HabitSheet habit={edit} onClose={() => setEdit(null)} count={habits.rows.length} />
      <Confirm open={!!del} onClose={() => setDel(null)} title={`Delete "${del?.name}"?`} body="Its whole completion history is deleted too. Archive it from the edit sheet instead to keep history." onConfirm={() => del && act(() => deleteById("habits", del.id), "Habit deleted")} />
    </div>
  );
}

function HabitSheet({ habit, onClose, count }: { habit: Habit | "new" | null; onClose: () => void; count: number }) {
  const act = useAction();
  const h = habit && habit !== "new" ? habit : null;
  const reminders = useRows<Reminder>({ table: "reminders", filters: [["type", "eq", "habit"]] });
  const [f, setF] = useState({ name: "", frequency: "daily" as "daily" | "weekly", target_per_week: 3, days: [0, 1, 2, 3, 4, 5, 6], reminder_time: "", auto_metric: "", color: COLORS[0] });
  useEffect(() => { if (habit) setF({ name: h?.name ?? "", frequency: h?.frequency ?? "daily", target_per_week: h?.target_per_week ?? 3, days: h?.days ?? [0, 1, 2, 3, 4, 5, 6], reminder_time: h?.reminder_time?.slice(0, 5) ?? "", auto_metric: h?.auto_metric ?? "", color: h?.color ?? COLORS[count % COLORS.length] }); }, [habit]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => act(async () => {
    const row = { name: f.name.trim(), frequency: f.frequency, target_per_week: f.frequency === "weekly" ? f.target_per_week : 7, days: f.days, reminder_time: f.reminder_time || null, auto_metric: f.auto_metric || null, color: f.color };
    let id = h?.id;
    if (h) await updateById("habits", h.id, row); else { const [n] = await insertRows("habits", { ...row, position: count }); id = n.id; }
    // keep a matching reminder in sync
    const rem = reminders.rows.find((r) => r.label === `Habit: ${h?.name ?? row.name}` || r.label === `Habit: ${row.name}`);
    if (f.reminder_time) { if (rem) await updateById("reminders", rem.id, { time: f.reminder_time, label: `Habit: ${row.name}`, days: f.days, enabled: true }); else await insertRows("reminders", { type: "habit", label: `Habit: ${row.name}`, time: f.reminder_time, days: f.days, enabled: true }); }
    else if (rem) await deleteById("reminders", rem.id);
    void id; onClose();
  }, "Habit saved");
  return (
    <Sheet open={!!habit} onClose={onClose} title={h ? "Edit habit" : "New habit"} footer={<div className="flex gap-2">{h && <Button onClick={() => act(async () => { await updateById("habits", h.id, { archived: true }); onClose(); }, "Archived")}>Archive</Button>}<Button variant="good" className="flex-1" disabled={!f.name.trim()} onClick={save}>Save</Button></div>}>
      <div className="space-y-4">
        <Field label="Habit"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Read 10 pages" /></Field>
        <Field label="Frequency"><Segmented value={f.frequency} onChange={(v) => setF({ ...f, frequency: v })} options={[{ value: "daily", label: "Daily" }, { value: "weekly", label: "Weekly target" }]} /></Field>
        {f.frequency === "daily" ? <Field label="On these days"><div className="flex gap-1.5">{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <Chip key={i} active={f.days.includes(i)} onClick={() => setF({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i].sort() })}>{d}</Chip>)}</div></Field>
          : <Field label="Times per week"><div className="flex gap-1.5">{[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} active={f.target_per_week === n} onClick={() => setF({ ...f, target_per_week: n })}>{n}×</Chip>)}</div></Field>}
        <Field label="Auto-complete from my logs (optional)" hint="Ticks itself when the target is reached — you can still toggle it manually."><Select value={f.auto_metric} onChange={(e) => setF({ ...f, auto_metric: e.target.value })}><option value="">Manual only</option>{Object.entries(METRICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Reminder (optional)"><Input type="time" value={f.reminder_time} onChange={(e) => setF({ ...f, reminder_time: e.target.value })} /></Field>
        <Field label="Colour"><div className="flex gap-2">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setF({ ...f, color: c })} className={cx("size-7 rounded-full ring-offset-2 ring-offset-card", f.color === c && "ring-2 ring-fg")} style={{ background: c }} />)}</div></Field>
      </div>
    </Sheet>
  );
}
