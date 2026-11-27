"use client";
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Download, ExternalLink, LayoutList, Plus, RefreshCw, Upload, Wand2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { addDays, dateKey, expandEvents, findConflicts, parseKey, startOfWeekKey, type Occurrence } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { gcalAvailable, fetchGoogleEvents, pushToGoogle } from "@/lib/gcal";
import { download, fromICS, toICS } from "@/lib/ics";
import { today, useProfile } from "@/lib/hooks";
import type { CalendarEvent, EventType, Recurrence } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "@/components/event-colors";
import { Badge, Button, Card, Chip, cx, Field, IconButton, Input, PageHeader, Segmented, Select, Sheet, Textarea, Toggle, useAction, useToast } from "@/components/ui";

type View = "day" | "week" | "month" | "agenda";
const START_H = 5, END_H = 24, PX = 52; // px per hour
const pxMin = PX / 60;
const minsOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const fmtT = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const TYPES = Object.keys(EVENT_LABELS) as EventType[];

export default function Page() { return <Suspense><CalendarPage /></Suspense>; }

function CalendarPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const act = useAction();
  const [view, setView] = useState<View>((sp.get("view") as View) || "week");
  const [cursor, setCursor] = useState(today());
  const [form, setForm] = useState<null | { ev?: CalendarEvent; occ?: Occurrence; start?: Date }>(sp.get("new") ? {} : null);
  const [planner, setPlanner] = useState(false);
  const [types, setTypes] = useState<Set<EventType>>(new Set(TYPES));
  const [syncOpen, setSyncOpen] = useState(false);
  useEffect(() => { if (sp.get("new")) router.replace("/calendar"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => {
    if (view === "day") return [cursor, cursor];
    if (view === "week") { const s = startOfWeekKey(cursor); return [s, addDays(s, 6)]; }
    if (view === "month") { const d = parseKey(cursor); const first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1)); const s = startOfWeekKey(first); return [s, addDays(s, 41)]; }
    return [cursor, addDays(cursor, 30)];
  }, [view, cursor]);
  const events = useRows<CalendarEvent>({ table: "calendar_events", filters: [["start_at", "lte", new Date(`${range[1]}T23:59:59`).toISOString()]], order: [["start_at", true]] });
  const occ = useMemo(() => expandEvents(events.rows, range[0], range[1]).filter((o) => types.has(o.event.type)), [events.rows, range, types]);

  const step = (n: number) => setCursor(view === "day" ? addDays(cursor, n) : view === "week" ? addDays(cursor, 7 * n) : view === "month" ? dateKey(new Date(parseKey(cursor).getFullYear(), parseKey(cursor).getMonth() + n, 1)) : addDays(cursor, 30 * n));
  const title = view === "month" ? parseKey(cursor).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : view === "day" ? parseKey(cursor).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : `${parseKey(range[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseKey(range[1]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  /** Drag-and-drop commit: shift an event (or a whole recurring series) by minutes/days. */
  const move = (o: Occurrence, deltaMin: number, deltaDays: number) => act(async () => {
    const shift = (deltaMin + deltaDays * 1440) * 60_000;
    await updateById("calendar_events", o.event.id, { start_at: new Date(new Date(o.event.start_at).getTime() + shift).toISOString(), end_at: new Date(new Date(o.event.end_at).getTime() + shift).toISOString() });
  }, o.event.recurrence !== "none" ? "Series rescheduled" : "Rescheduled");

  return (
    <div className="anim-rise">
      <PageHeader title="Calendar" sub="Training, meals and life — in one timeline." action={<>
        <Button size="sm" onClick={() => setPlanner(true)} icon={<Wand2 className="size-4" />}><span className="hidden sm:inline">Plan my day</span></Button>
        <IconButton label="Import / export / Google" onClick={() => setSyncOpen(true)}><RefreshCw className="size-4" /></IconButton>
        <Button size="sm" variant="good" onClick={() => setForm({})} icon={<Plus className="size-4" />}>Event</Button>
      </>} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Previous" onClick={() => step(-1)}><ChevronLeft className="size-5" /></IconButton>
          <Button size="sm" variant="ghost" onClick={() => setCursor(today())}>Today</Button>
          <IconButton label="Next" onClick={() => step(1)}><ChevronRight className="size-5" /></IconButton>
          <span className="ml-2 font-semibold">{title}</span>
        </div>
        <Segmented size="sm" value={view} onChange={setView} options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }, { value: "agenda", label: "Agenda" }]} />
      </div>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {TYPES.map((t) => <button key={t} onClick={() => { const n = new Set(types); if (n.has(t)) n.delete(t); else n.add(t); setTypes(n); }} className={cx("flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition", types.has(t) ? "border-line-2 text-fg" : "border-line text-faint opacity-60")}><span className="size-2 rounded-full" style={{ background: EVENT_COLORS[t] }} />{EVENT_LABELS[t]}</button>)}
      </div>

      {(view === "day" || view === "week") && <TimeGrid days={view === "day" ? [cursor] : Array.from({ length: 7 }, (_, i) => addDays(range[0], i))} occ={occ} onOpen={(o) => setForm({ ev: o.event, occ: o })} onCreate={(d) => setForm({ start: d })} onMove={move} onDay={(k) => { setCursor(k); setView("day"); }} />}
      {view === "month" && <MonthGrid start={range[0]} month={parseKey(cursor).getMonth()} occ={occ} onDay={(k) => { setCursor(k); setView("day"); }} />}
      {view === "agenda" && <Agenda occ={occ} onOpen={(o) => setForm({ ev: o.event, occ: o })} />}

      <EventSheet state={form} onClose={() => setForm(null)} allEvents={events.rows} />
      <DayPlanner open={planner} onClose={() => setPlanner(false)} date={view === "day" ? cursor : today()} events={events.rows} />
      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} events={events.rows} />
    </div>
  );
}

// ---------------------------------------------------------------- day / week time grid with drag & drop
/** Side-by-side layout: lanes are assigned per cluster of overlapping events, so a lone event stays full width. */
function lanes(list: Occurrence[]) {
  const sorted = [...list].sort((a, b) => a.start.getTime() - b.start.getTime());
  const lane = new Map<Occurrence, number>(), count = new Map<Occurrence, number>();
  let cluster: Occurrence[] = [], ends: number[] = [], clusterEnd = 0;
  const close = () => { cluster.forEach((o) => count.set(o, Math.max(1, ends.length))); cluster = []; ends = []; };
  for (const o of sorted) {
    if (cluster.length && o.start.getTime() >= clusterEnd) close();
    let i = ends.findIndex((e) => e <= o.start.getTime()); if (i < 0) { i = ends.length; ends.push(0); }
    ends[i] = o.end.getTime(); lane.set(o, i); cluster.push(o); clusterEnd = Math.max(clusterEnd, o.end.getTime());
  }
  close();
  return { lane, count };
}

function TimeGrid({ days, occ, onOpen, onCreate, onMove, onDay }: { days: string[]; occ: Occurrence[]; onOpen: (o: Occurrence) => void; onCreate: (d: Date) => void; onMove: (o: Occurrence, m: number, d: number) => void; onDay: (k: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ o: Occurrence; x: number; y: number; dm: number; dd: number; moved: boolean } | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: Math.max(0, (minsOf(new Date()) - START_H * 60 - 90) * pxMin) }); }, []);
  const colW = () => (cols.current ? cols.current.getBoundingClientRect().width / days.length : 100);

  const down = (e: RPE, o: Occurrence) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ o, x: e.clientX, y: e.clientY, dm: 0, dd: 0, moved: false }); };
  const moveP = (e: RPE) => {
    if (!drag) return;
    const dy = e.clientY - drag.y, dx = e.clientX - drag.x;
    const dm = Math.round(dy / pxMin / 15) * 15, dd = days.length > 1 ? Math.round(dx / colW()) : 0;
    setDrag({ ...drag, dm, dd, moved: drag.moved || Math.abs(dy) > 6 || Math.abs(dx) > 10 });
  };
  const up = () => { if (!drag) return; if (!drag.moved) onOpen(drag.o); else if (drag.dm || drag.dd) onMove(drag.o, drag.dm, drag.dd); setDrag(null); };
  const allDay = occ.filter((o) => o.event.all_day);
  const nowKey = dateKey(now);

  return (
    <Card className="overflow-hidden">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
        <div />
        {days.map((k) => {
          const d = parseKey(k); const conflicts = findConflicts(occ.filter((o) => o.date === k)).length;
          return (
            <button key={k} onClick={() => onDay(k)} className="border-l border-line px-1 py-2 text-center">
              <div className="text-[11px] uppercase text-faint">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className={cx("num mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm font-semibold", k === nowKey && "bg-good text-black")}>{d.getDate()}</div>
              {conflicts > 0 && <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-warm" title={`${conflicts} overlapping`}><AlertTriangle className="size-3" />{days.length === 1 ? `${conflicts} overlap${conflicts > 1 ? "s" : ""}` : conflicts}</div>}
              {allDay.filter((o) => o.date === k).map((o) => <div key={o.event.id} className="mt-1 truncate rounded px-1 text-[10px] font-medium text-black" style={{ background: EVENT_COLORS[o.event.type] }}>{o.event.title}</div>)}
            </button>
          );
        })}
      </div>
      <div ref={scroller} className="relative max-h-[68dvh] overflow-y-auto" onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => setDrag(null)}>
        <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))`, height: (END_H - START_H) * PX }}>
          <div className="relative">{Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="num absolute right-2 -translate-y-2 text-[10px] text-faint" style={{ top: i * PX }}>{i ? `${(START_H + i) % 12 || 12}${START_H + i < 12 ? "a" : "p"}` : ""}</div>)}</div>
          <div ref={cols} className="relative grid" style={{ gridColumn: "2 / -1", gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
            {days.map((k) => {
              const list = occ.filter((o) => o.date === k && !o.event.all_day);
              const { lane, count } = lanes(list);
              const conf = new Set(findConflicts(list).flat());
              return (
                <div key={k} className="relative border-l border-line" onDoubleClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const m = Math.round(((e.clientY - r.top) / pxMin + START_H * 60) / 15) * 15; const d = parseKey(k); d.setMinutes(m); onCreate(d); }}>
                  {Array.from({ length: END_H - START_H }, (_, i) => <div key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: i * PX }} />)}
                  {k === nowKey && minsOf(now) >= START_H * 60 && <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-bad" style={{ top: (minsOf(now) - START_H * 60) * pxMin }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-bad" /></div>}
                  {list.map((o) => {
                    const isDrag = drag?.o === o;
                    const top = (Math.max(START_H * 60, minsOf(o.start)) - START_H * 60 + (isDrag ? drag.dm : 0)) * pxMin;
                    const h = Math.max(18, ((o.end.getTime() - o.start.getTime()) / 60000) * pxMin - 2);
                    const l = lane.get(o)!, n = count.get(o) ?? 1;
                    return (
                      <div key={o.event.id + o.date} onPointerDown={(e) => down(e, o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(o)}
                        className={cx("absolute z-[5] cursor-grab touch-none select-none overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-[11px] leading-tight shadow-sm", isDrag && "z-20 cursor-grabbing opacity-90 ring-2 ring-fg/30", o.completed && "opacity-50", conf.has(o) && "ring-1 ring-warm/70")}
                        style={{ top, height: h, left: `calc(${(l / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, transform: isDrag && drag.dd ? `translateX(${drag.dd * colW()}px)` : undefined, borderColor: EVENT_COLORS[o.event.type], background: `color-mix(in srgb, ${EVENT_COLORS[o.event.type]} 18%, var(--card-2))` }}>
                        <div className={cx("truncate font-semibold", o.completed && "line-through")}>{o.event.title}</div>
                        {h > 30 && <div className="num truncate text-faint">{fmtT(o.start)}{o.event.recurrence !== "none" && " ↻"}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">Drag to reschedule (15-min snap{days.length > 1 ? ", sideways to change day" : ""}). Double-click empty space to add. Overlaps are outlined in amber.</div>
    </Card>
  );
}

function MonthGrid({ start, month, occ, onDay }: { start: string; month: number; occ: Occurrence[]; onDay: (k: string) => void }) {
  const t = today();
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line text-center text-[11px] uppercase text-faint">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((k) => {
          const list = occ.filter((o) => o.date === k); const d = parseKey(k);
          return (
            <button key={k} onClick={() => onDay(k)} className={cx("min-h-[84px] border-b border-l border-line p-1.5 text-left transition hover:bg-card-2 sm:min-h-[104px]", d.getMonth() !== month && "opacity-40")}>
              <div className={cx("num mb-1 grid size-6 place-items-center rounded-full text-xs font-semibold", k === t && "bg-good text-black")}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((o) => <div key={o.event.id} className="flex items-center gap-1 truncate text-[10px] sm:text-[11px]"><span className="size-1.5 shrink-0 rounded-full" style={{ background: EVENT_COLORS[o.event.type] }} /><span className="hidden truncate sm:inline">{o.event.title}</span></div>)}
                {list.length > 3 && <div className="text-[10px] text-faint">+{list.length - 3}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Agenda({ occ, onOpen }: { occ: Occurrence[]; onOpen: (o: Occurrence) => void }) {
  const byDay = [...new Set(occ.map((o) => o.date))];
  if (!byDay.length) return <Card className="p-8 text-center text-sm text-muted"><LayoutList className="mx-auto mb-2 size-5" />Nothing in the next 30 days.</Card>;
  return (
    <div className="space-y-4">
      {byDay.map((k) => {
        const list = occ.filter((o) => o.date === k); const conf = findConflicts(list).length;
        return (
          <div key={k}>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">{parseKey(k).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}{conf > 0 && <Badge tone="warm"><AlertTriangle className="size-3" />{conf} overlap</Badge>}</div>
            <Card className="divide-y divide-line">
              {list.map((o) => (
                <button key={o.event.id + k} onClick={() => onOpen(o)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-card-2">
                  <span className="h-8 w-1 rounded-full" style={{ background: EVENT_COLORS[o.event.type] }} />
                  <div className="num w-24 shrink-0 text-xs text-muted">{o.event.all_day ? "All day" : `${fmtT(o.start)} – ${fmtT(o.end)}`}</div>
                  <div className="min-w-0 flex-1"><div className={cx("truncate text-sm font-medium", o.completed && "text-faint line-through")}>{o.event.title}</div><div className="text-xs text-faint">{EVENT_LABELS[o.event.type]}{o.event.recurrence !== "none" && ` · repeats ${o.event.recurrence}`}{o.event.location && ` · ${o.event.location}`}</div></div>
                  {o.completed && <Check className="size-4 text-good" />}
                </button>
              ))}
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- event form
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function EventSheet({ state, onClose, allEvents }: { state: null | { ev?: CalendarEvent; occ?: Occurrence; start?: Date }; onClose: () => void; allEvents: CalendarEvent[] }) {
  const act = useAction();
  const toast = useToast();
  const ev = state?.ev;
  const [f, setF] = useState({ title: "", type: "personal" as EventType, date: today(), start: "09:00", end: "10:00", all_day: false, recurrence: "none" as Recurrence, until: "", reminder: "", notes: "", location: "" });
  useEffect(() => {
    if (!state) return;
    const s = ev ? new Date(ev.start_at) : state.start ?? (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
    const e = ev ? new Date(ev.end_at) : new Date(s.getTime() + 3600_000);
    setF({ title: ev?.title ?? "", type: ev?.type ?? "personal", date: ev ? dateKey(s) : dateKey(s), start: hhmm(s), end: hhmm(e), all_day: ev?.all_day ?? false, recurrence: ev?.recurrence ?? "none", until: ev?.recurrence_until ?? "", reminder: ev?.reminder_minutes != null ? String(ev.reminder_minutes) : "", notes: ev?.notes ?? "", location: ev?.location ?? "" });
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state) return null;
  const s = new Date(`${f.date}T${f.all_day ? "00:00" : f.start}:00`);
  let e = new Date(`${f.date}T${f.all_day ? "23:59" : f.end}:00`);
  if (e <= s) e = new Date(e.getTime() + 86400_000); // ends after midnight (e.g. sleep)
  // conflict preview against other events that day
  const others = expandEvents(allEvents.filter((x) => x.id !== ev?.id), f.date, f.date).filter((o) => !o.event.all_day);
  const clash = f.all_day ? [] : others.filter((o) => o.start < e && o.end > s);
  const save = () => act(async () => {
    const row = { title: f.title.trim() || EVENT_LABELS[f.type], type: f.type, start_at: s.toISOString(), end_at: e.toISOString(), all_day: f.all_day, recurrence: f.recurrence, recurrence_until: f.until || null, reminder_minutes: f.reminder === "" ? null : Number(f.reminder), notes: f.notes || null, location: f.location || null };
    if (ev) await updateById("calendar_events", ev.id, row); else await insertRows("calendar_events", row);
    onClose();
  }, ev ? "Event updated" : "Event added");
  const occ = state.occ;
  return (
    <Sheet open onClose={onClose} title={ev ? "Edit event" : "New event"} footer={<div className="flex flex-wrap gap-2">
      {ev && <Button variant="danger" onClick={() => act(async () => { await deleteById("calendar_events", ev.id); onClose(); }, ev.recurrence !== "none" ? "Series deleted" : "Event deleted", () => insertRows("calendar_events", { ...ev }))}>{ev.recurrence !== "none" ? "Delete series" : "Delete"}</Button>}
      <Button variant="good" className="flex-1" onClick={save}>Save</Button>
    </div>}>
      {ev && occ && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant={occ.completed ? "secondary" : "good"} icon={<Check className="size-3.5" />} onClick={() => act(async () => { await updateById("calendar_events", ev.id, { completed_dates: occ.completed ? ev.completed_dates.filter((d) => d !== occ.date) : [...(ev.completed_dates || []), occ.date] }); onClose(); }, occ.completed ? "Marked not done" : "Marked complete")}>{occ.completed ? "Mark not done" : "Mark complete"}</Button>
          {ev.recurrence !== "none" && <Button size="sm" onClick={() => act(async () => { await updateById("calendar_events", ev.id, { recurrence_exceptions: [...(ev.recurrence_exceptions || []), occ.date] }); onClose(); }, "Skipped this occurrence")}>Skip this one</Button>}
          {gcalAvailable && <Button size="sm" icon={<ExternalLink className="size-3.5" />} onClick={() => pushToGoogle(ev).then(() => toast("Sent to Google Calendar")).catch((x) => toast(x.message, { tone: "bad" }))}>Send to Google</Button>}
        </div>
      )}
      <div className="space-y-3">
        <Field label="Title"><Input autoFocus={!ev} value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} placeholder="Gym, lunch, meeting…" /></Field>
        <Field label="Type"><div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <Chip key={t} active={f.type === t} color={EVENT_COLORS[t]} onClick={() => setF({ ...f, type: t })}>{EVENT_LABELS[t]}</Chip>)}</div></Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3"><Field label="Date"><Input type="date" value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} /></Field><label className="flex items-center gap-2 pb-2.5 text-sm text-muted">All day <Toggle checked={f.all_day} onChange={(v) => setF({ ...f, all_day: v })} /></label></div>
        {!f.all_day && <div className="grid grid-cols-2 gap-3"><Field label="Start"><Input type="time" value={f.start} onChange={(x) => setF({ ...f, start: x.target.value })} /></Field><Field label="End"><Input type="time" value={f.end} onChange={(x) => setF({ ...f, end: x.target.value })} /></Field></div>}
        {clash.length > 0 && <div className="flex items-start gap-2 rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Overlaps with {clash.map((c) => `${c.event.title} (${fmtT(c.start)})`).join(", ")}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repeat"><Select value={f.recurrence} onChange={(x) => setF({ ...f, recurrence: x.target.value as Recurrence })}><option value="none">Doesn&apos;t repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
          {f.recurrence !== "none" ? <Field label="Until (optional)"><Input type="date" value={f.until} onChange={(x) => setF({ ...f, until: x.target.value })} /></Field>
            : <Field label="Reminder"><Select value={f.reminder} onChange={(x) => setF({ ...f, reminder: x.target.value })}><option value="">None</option><option value="0">At start</option><option value="5">5 min before</option><option value="10">10 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option></Select></Field>}
        </div>
        {f.recurrence !== "none" && <Field label="Reminder"><Select value={f.reminder} onChange={(x) => setF({ ...f, reminder: x.target.value })}><option value="">None</option><option value="0">At start</option><option value="5">5 min before</option><option value="10">10 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option></Select></Field>}
        <Field label="Location"><Input value={f.location} onChange={(x) => setF({ ...f, location: x.target.value })} /></Field>
        <Field label="Notes"><Textarea value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} /></Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- daily time-block planner
function DayPlanner({ open, onClose, date, events }: { open: boolean; onClose: () => void; date: string; events: CalendarEvent[] }) {
  const act = useAction();
  const { profile } = useProfile();
  const gym = (profile?.preferred_workout_time || "18:00").slice(0, 5);
  const bed = (profile?.bedtime_target || "23:00").slice(0, 5);
  const add = (t: string, m: number) => { const [h, mm] = t.split(":").map(Number); const x = h * 60 + mm + m; return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`; };
  const initial = (): { on: boolean; title: string; type: EventType; start: string; end: string }[] => [
    { on: true, title: "Wake up", type: "personal", start: "07:00", end: "07:15" },
    { on: true, title: "Water — 500 ml", type: "water", start: "07:15", end: "07:20" },
    { on: true, title: "Breakfast", type: "meal", start: "08:00", end: "08:30" },
    { on: true, title: "Work", type: "work", start: "09:30", end: "13:00" },
    { on: true, title: "Lunch", type: "meal", start: "13:00", end: "13:45" },
    { on: true, title: "Work", type: "work", start: "13:45", end: "17:30" },
    { on: true, title: "Pre-workout snack", type: "meal", start: add(gym, -60), end: add(gym, -45) },
    { on: true, title: "Gym", type: "workout", start: gym, end: add(gym, 75) },
    { on: true, title: "Walk", type: "walk", start: add(gym, 105), end: add(gym, 150) },
    { on: true, title: "Dinner", type: "meal", start: "20:30", end: "21:00" },
    { on: false, title: "Study", type: "study", start: "21:15", end: "22:15" },
    { on: false, title: "Personal tasks", type: "personal", start: "22:15", end: "22:45" },
    { on: true, title: "Sleep", type: "sleep", start: bed, end: "07:00" },
  ];
  const [blocks, setBlocks] = useState(initial);
  useEffect(() => { if (open) setBlocks(initial()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toOcc = (b: (typeof blocks)[number]) => { const s = new Date(`${date}T${b.start}:00`); let e = new Date(`${date}T${b.end}:00`); if (e <= s) e = new Date(e.getTime() + 86400_000); return { s, e }; };
  const existing = expandEvents(events, date, date).filter((o) => !o.event.all_day);
  const chosen = blocks.filter((b) => b.on);
  const clashes = chosen.filter((b, i) => { const { s, e } = toOcc(b); return existing.some((o) => o.start < e && o.end > s) || chosen.some((c, j) => j !== i && (() => { const x = toOcc(c); return x.s < e && x.e > s; })()); });
  return (
    <Sheet open={open} onClose={onClose} wide title={<span className="flex items-center gap-2"><CalendarClock className="size-5" />Plan {parseKey(date).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}</span>}
      footer={<Button variant="good" className="w-full" onClick={() => act(async () => { await insertRows("calendar_events", chosen.map((b) => { const { s, e } = toOcc(b); return { title: b.title, type: b.type, start_at: s.toISOString(), end_at: e.toISOString(), source: "planner" }; })); onClose(); }, `Added ${chosen.length} blocks`)}>Add {chosen.length} blocks to calendar</Button>}>
      <p className="mb-3 text-sm text-muted">Toggle and adjust blocks. Times default from your profile (workout {gym}, bedtime {bed}).</p>
      {clashes.length > 0 && <div className="mb-3 flex items-center gap-2 rounded-xl bg-warm-soft px-3 py-2 text-sm text-warm"><AlertTriangle className="size-4" />{clashes.length} block{clashes.length > 1 ? "s" : ""} overlap existing events or each other.</div>}
      <div className="space-y-1.5">
        {blocks.map((b, i) => (
          <div key={i} className={cx("grid grid-cols-[auto_1fr_84px_84px] items-center gap-2 rounded-xl border px-2 py-1.5", b.on ? "border-line bg-bg-2" : "border-transparent opacity-50", clashes.includes(b) && "border-warm/50")}>
            <Toggle checked={b.on} onChange={(v) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, on: v } : x)))} />
            <div className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: EVENT_COLORS[b.type] }} /><input value={b.title} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
            <input type="time" value={b.start} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="num rounded-lg bg-card px-1.5 py-1 text-sm outline-none" />
            <input type="time" value={b.end} onChange={(e) => setBlocks(blocks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="num rounded-lg bg-card px-1.5 py-1 text-sm outline-none" />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- import / export / Google
function SyncSheet({ open, onClose, events }: { open: boolean; onClose: () => void; events: CalendarEvent[] }) {
  const act = useAction();
  const file = useRef<HTMLInputElement>(null);
  const importRows = (rows: Partial<CalendarEvent>[]) => {
    const known = new Set(events.map((e) => e.external_id).filter(Boolean));
    const fresh = rows.filter((r) => !r.external_id || !known.has(r.external_id));
    return insertRows("calendar_events", fresh as Record<string, unknown>[]).then(() => fresh.length);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Sync & integrations">
      <div className="space-y-4">
        <Card className="p-4">
          <div className="font-medium">Google Calendar</div>
          {gcalAvailable ? <>
            <p className="mt-1 text-sm text-muted">Authorise once per session; tokens stay in memory. Import upcoming events (next 14 days) and send Forge events to Google from the event sheet.</p>
            <Button className="mt-3" icon={<RefreshCw className="size-4" />} onClick={() => act(async () => { const n = await importRows(await fetchGoogleEvents(14)); onClose(); return n; }, "Imported from Google Calendar")}>Import from Google</Button>
          </> : <p className="mt-1 text-sm text-muted">Ready to connect: set <code className="rounded bg-bg-2 px-1">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> (Google Cloud OAuth client, Calendar API enabled) and redeploy. Until then, use iCal import/export below — Google Calendar accepts .ics files.</p>}
        </Card>
        <Card className="p-4">
          <div className="font-medium">iCal (.ics)</div>
          <p className="mt-1 text-sm text-muted">Works with Google, Apple and Outlook calendars.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} onClick={() => download("forge-calendar.ics", toICS(events))}>Export {events.length} events</Button>
            <Button icon={<Upload className="size-4" />} onClick={() => file.current?.click()}>Import .ics</Button>
            <input ref={file} type="file" accept=".ics,text/calendar" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((t) => act(async () => { await importRows(fromICS(t)); onClose(); }, "Calendar imported")); e.target.value = ""; }} />
          </div>
        </Card>
      </div>
    </Sheet>
  );
}
