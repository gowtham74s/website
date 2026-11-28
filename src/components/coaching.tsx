"use client";
import { Bell, Check, CheckCheck, MessageSquare, Pencil, Send, Star, Trash2, Undo2, X, CalendarPlus, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { dateKey } from "@/lib/calc";
import { acceptAssignment, createAssignments, fmtWhen, markAllRead, sendMessage, STATUS_LABEL, STATUS_TONE, useNotifications } from "@/lib/coach";
import { deleteById, updateById, useRows } from "@/lib/data";
import { useSession } from "@/lib/auth";
import type { Assignment, AssignmentMessage, EventType, Profile } from "@/lib/types";
import { EVENT_COLORS, EVENT_LABELS } from "./event-colors";
import { Badge, Button, Card, Chip, cx, Empty, Field, IconButton, Input, Select, Sheet, Textarea, useAction } from "./ui";

const TYPES = Object.keys(EVENT_LABELS) as EventType[];

// ---------------------------------------------------------------- notifications bell
export function NotificationBell({ className }: { className?: string }) {
  const n = useNotifications();
  const unread = n.rows.filter((x) => !x.read_at).length;
  return (
    <Link href="/inbox" aria-label={`Inbox${unread ? `, ${unread} unread` : ""}`} className={cx("relative grid size-9 place-items-center rounded-xl text-muted hover:text-fg", className)}>
      <Bell className="size-5" />
      {unread > 0 && <span className="num absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}

export function NotificationList({ limit = 50 }: { limit?: number }) {
  const n = useNotifications();
  const act = useAction();
  const list = n.rows.slice(0, limit);
  if (!list.length) return <Card><Empty icon={<Bell className="size-5" />} title="No notifications" body="Messages from your coach, reminders and replies show up here." /></Card>;
  return (
    <Card className="divide-y divide-line">
      <div className="flex items-center justify-between px-4 py-2.5 text-xs text-faint">
        <span>{list.filter((x) => !x.read_at).length} unread</span>
        <button className="flex items-center gap-1 font-medium text-good" onClick={() => act(() => markAllRead(n.rows))}><CheckCheck className="size-3.5" />Mark all read</button>
      </div>
      {list.map((x) => (
        <Link key={x.id} href={x.link || "/inbox"} onClick={() => !x.read_at && updateById("notifications", x.id, { read_at: new Date().toISOString() }).catch(() => {})}
          className={cx("flex gap-3 px-4 py-3 transition hover:bg-card-2", !x.read_at && "bg-info/5")}>
          <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", x.read_at ? "bg-transparent" : x.kind === "reminder" ? "bg-warm" : x.kind === "change_request" ? "bg-warm" : "bg-info")} />
          <div className="min-w-0 flex-1">
            <div className={cx("text-sm", !x.read_at && "font-semibold")}>{x.title}</div>
            {x.body && <div className="truncate text-xs text-muted">{x.body}</div>}
            <div className="text-[11px] text-faint">{new Date(x.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{x.kind === "reminder" && " · reminder"}</div>
          </div>
        </Link>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------- assignment card
export function AssignmentCard({ a, onOpen, who }: { a: Assignment; onOpen: () => void; who?: string }) {
  return (
    <button onClick={onOpen} className="flex w-full items-start gap-3 rounded-2xl border border-line bg-card p-3.5 text-left transition hover:border-line-2 active:scale-[.995]">
      <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: EVENT_COLORS[a.type] }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><span className={cx("font-semibold", a.status === "cancelled" && "line-through text-faint")}>{a.title}</span><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></div>
        <div className="num text-xs text-muted">{EVENT_LABELS[a.type]} · {fmtWhen(a)}</div>
        {who && <div className="text-xs text-faint">{who}</div>}
        {a.details && <div className="mt-1 line-clamp-2 text-sm text-muted">{a.details}</div>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------- detail + thread (both sides)
export function AssignmentSheet({ a, onClose, side, names }: { a: Assignment | null; onClose: () => void; side: "user" | "coach"; names?: Record<string, string> }) {
  const act = useAction();
  const { session } = useSession();
  const me = session?.user.id;
  const msgs = useRows<AssignmentMessage>({ table: "assignment_messages", filters: [["assignment_id", "eq", a?.id ?? "-"]], order: [["created_at", true]] }, !!a, { refetchInterval: 30_000, staleTime: 0 });
  const [reply, setReply] = useState("");
  const [mode, setMode] = useState<null | "change" | "done" | "edit">(null);
  const [prop, setProp] = useState({ date: "", start_time: "", duration_min: "" , title: "", details: "" });
  const [rating, setRating] = useState<number | null>(null);
  if (!a) return null;
  const close = () => { setMode(null); setReply(""); setRating(null); onClose(); };
  const startMode = (m: "change" | "edit") => { setProp({ date: a.date, start_time: a.start_time?.slice(0, 5) ?? "", duration_min: a.duration_min ? String(a.duration_min) : "", title: a.title, details: a.details ?? "" }); setMode(m); };
  const authorName = (id: string) => (id === me ? "You" : side === "user" ? (a.coach_name ?? "Coach") : names?.[id] ?? "User");
  const lastProposal = [...msgs.rows].reverse().find((m) => m.proposal && m.author_id === a.user_id);
  const open = !["done", "cancelled", "declined"].includes(a.status);

  const applyProposal = (p: NonNullable<AssignmentMessage["proposal"]>) => act(async () => {
    await updateById("assignments", a.id, { date: p.date ?? a.date, start_time: p.start_time ?? a.start_time, duration_min: p.duration_min ?? a.duration_min, ...(p.title ? { title: p.title } : {}), ...(p.details !== undefined ? { details: p.details || null } : {}), status: "assigned" });
    await sendMessage(a.id, "Change applied ✓");
    close();
  }, "Change applied and sent to the member");

  return (
    <Sheet open onClose={close} title={a.title} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
        <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full" style={{ background: EVENT_COLORS[a.type] }} />{EVENT_LABELS[a.type]}</span>
        <span className="num text-muted">{fmtWhen(a)}</span>
        <span className="text-faint">{side === "user" ? `from ${a.coach_name ?? "your coach"}` : `for ${names?.[a.user_id] ?? "user"}`}</span>
      </div>
      {a.details && <p className="mb-4 whitespace-pre-wrap rounded-xl bg-bg-2 p-3 text-[15px]">{a.details}</p>}

      {/* actions */}
      {side === "user" && open && mode === null && (
        <div className="mb-4 flex flex-wrap gap-2">
          {a.status !== "accepted" && <Button variant="good" icon={<CalendarPlus className="size-4" />} onClick={() => act(async () => { await acceptAssignment(a); }, "Accepted — added to your calendar")}>Accept</Button>}
          <Button variant={a.status === "accepted" ? "good" : "secondary"} icon={<Check className="size-4" />} onClick={() => setMode("done")}>Mark done</Button>
          <Button icon={<Pencil className="size-4" />} onClick={() => startMode("change")}>Request a change</Button>
          <Button variant="ghost" icon={<X className="size-4" />} onClick={() => act(() => updateById("assignments", a.id, { status: "declined" }), "Declined — your coach has been told")}>Decline</Button>
        </div>
      )}
      {side === "coach" && mode === null && (
        <div className="mb-4 flex flex-wrap gap-2">
          {a.status === "change_requested" && lastProposal?.proposal && <Button variant="warm" icon={<Wand2 className="size-4" />} onClick={() => applyProposal(lastProposal.proposal!)}>Apply proposed change</Button>}
          <Button icon={<Pencil className="size-4" />} onClick={() => startMode("edit")}>Edit</Button>
          {a.status !== "cancelled" && <Button variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => act(() => updateById("assignments", a.id, { status: "cancelled" }), "Cancelled")}>Cancel</Button>}
          <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => act(async () => { await deleteById("assignments", a.id); close(); }, "Deleted")}>Delete</Button>
        </div>
      )}

      {(mode === "change" || mode === "edit") && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="text-sm font-medium">{mode === "change" ? "Propose a change — your coach will review it" : "Edit event"}</div>
          {mode === "edit" && <Field label="Title"><Input value={prop.title} onChange={(e) => setProp({ ...prop, title: e.target.value })} /></Field>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Date" className="col-span-2 sm:col-span-1"><Input type="date" value={prop.date} onChange={(e) => setProp({ ...prop, date: e.target.value })} /></Field>
            <Field label="Time"><Input type="time" value={prop.start_time} onChange={(e) => setProp({ ...prop, start_time: e.target.value })} /></Field>
            <Field label="Minutes"><Input inputMode="numeric" value={prop.duration_min} onChange={(e) => setProp({ ...prop, duration_min: e.target.value })} /></Field>
          </div>
          <Field label={mode === "change" ? "Changes to the plan / note (optional)" : "Details"}><Textarea value={mode === "change" ? reply : prop.details} onChange={(e) => (mode === "change" ? setReply(e.target.value) : setProp({ ...prop, details: e.target.value }))} placeholder={mode === "change" ? "e.g. Can we do this after work? 3 sets instead of 4 — my knee is sore." : ""} /></Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
            <Button variant="good" className="flex-1" onClick={() => act(async () => {
              const p = { date: prop.date || a.date, start_time: prop.start_time || null, duration_min: prop.duration_min ? Number(prop.duration_min) : null };
              if (mode === "change") {
                await sendMessage(a.id, reply.trim() || "I'd like to change this.", p);
                await updateById("assignments", a.id, { status: "change_requested" });
              } else {
                await updateById("assignments", a.id, { ...p, title: prop.title.trim() || a.title, details: prop.details.trim() || null, status: a.status === "change_requested" ? "assigned" : a.status });
              }
              setReply(""); setMode(null);
            }, mode === "change" ? "Change request sent to your coach" : "Updated — the user has been notified")}>{mode === "change" ? "Send to coach" : "Save & notify"}</Button>
          </div>
        </Card>
      )}

      {mode === "done" && (
        <Card className="mb-4 space-y-3 p-4">
          <div className="text-sm font-medium">How did it go?</div>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={cx("size-7", rating && n <= rating ? "fill-warm text-warm" : "text-line-2")} /></button>)}</div>
          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Feedback for your coach (optional) — e.g. felt easy, add weight next time." />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
            <Button variant="good" className="flex-1" onClick={() => act(async () => {
              await updateById("assignments", a.id, { status: "done" });
              if (reply.trim() || rating) await sendMessage(a.id, reply.trim() || `Done — rated ${rating}/5`, null, rating);
              setReply(""); setRating(null); setMode(null);
            }, "Marked done — your coach can see it")}>Mark done</Button>
          </div>
        </Card>
      )}

      {/* thread */}
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-muted"><MessageSquare className="size-4" />Conversation</div>
      <div className="space-y-2">
        {!msgs.rows.length && <p className="text-sm text-faint">No messages yet.</p>}
        {msgs.rows.map((m) => {
          const mine = m.author_id === me;
          return (
            <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cx("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm", mine ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md bg-card-2")}>
                <div className={cx("mb-0.5 text-[11px]", mine ? "text-bg/60" : "text-faint")}>{authorName(m.author_id)} · {new Date(m.created_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
                {m.body && <div className="whitespace-pre-wrap">{m.body}</div>}
                {m.rating && <div className="mt-1 flex">{Array.from({ length: m.rating }, (_, i) => <Star key={i} className="size-3.5 fill-warm text-warm" />)}</div>}
                {m.proposal && (
                  <div className={cx("mt-1.5 rounded-lg px-2 py-1 text-xs", mine ? "bg-bg/10" : "bg-warm-soft text-warm")}>
                    Proposed: {fmtWhen({ date: m.proposal.date ?? a.date, start_time: m.proposal.start_time ?? null, duration_min: m.proposal.duration_min ?? null })}
                    {side === "coach" && !mine && m === lastProposal && a.status === "change_requested" && <button className="ml-2 font-semibold underline" onClick={() => applyProposal(m.proposal!)}>Apply</button>}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (reply.trim() && mode === null) act(async () => { await sendMessage(a.id, reply.trim()); setReply(""); }); }}>
        <Input value={mode === null ? reply : ""} disabled={mode !== null} onChange={(e) => setReply(e.target.value)} placeholder={side === "user" ? "Message your coach…" : "Reply…"} />
        <IconButton label="Send" type="submit" className="size-11 shrink-0 bg-good text-black hover:bg-good"><Send className="size-4" /></IconButton>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------- coach: create
export function NewAssignmentSheet({ open, onClose, people, preselect }: { open: boolean; onClose: () => void; people: Pick<Profile, "id" | "name">[]; preselect?: string[] }) {
  const act = useAction();
  const [sel, setSel] = useState<string[]>([]);
  const [f, setF] = useState({ title: "", type: "workout" as EventType, date: dateKey(), start_time: "", duration_min: "45", details: "" });
  const [q, setQ] = useState("");
  const list = useMemo(() => people.filter((p) => (p.name ?? "").toLowerCase().includes(q.toLowerCase())), [people, q]);
  const [init, setInit] = useState(false);
  if (open && !init) { setSel(preselect ?? []); setInit(true); }
  if (!open && init) setInit(false);
  const toggle = (id: string) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <Sheet open={open} onClose={onClose} title="New event for members" wide footer={
      <Button variant="good" className="w-full" disabled={!f.title.trim() || !sel.length} icon={<Send className="size-4" />} onClick={() => act(async () => {
        await createAssignments(sel, { title: f.title.trim(), type: f.type, details: f.details.trim() || null, date: f.date, start_time: f.start_time || null, duration_min: f.duration_min ? Number(f.duration_min) : null });
        setF({ ...f, title: "", details: "" }); onClose();
      }, `Sent to ${sel.length} user${sel.length > 1 ? "s" : ""}`)}>Send to {sel.length || "…"} user{sel.length === 1 ? "" : "s"}</Button>}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Leg day — 4×8 squats, 3×10 RDL" /></Field>
          <Field label="Type"><div className="flex flex-wrap gap-1.5">{TYPES.map((t) => <Chip key={t} active={f.type === t} color={EVENT_COLORS[t]} onClick={() => setF({ ...f, type: t })}>{EVENT_LABELS[t]}</Chip>)}</div></Field>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Date" className="col-span-2 sm:col-span-1"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="Time (opt.)"><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
            <Field label="Minutes"><Input inputMode="numeric" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></Field>
          </div>
          <Field label="Details / instructions"><Textarea rows={5} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder="Warm-up 10 min. Squat 4×8 @ RPE 7. Walk 20 min after. Drink 500 ml before." /></Field>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-muted"><span>Send to ({sel.length} selected)</span>
            <span className="flex gap-2"><button className="text-good" onClick={() => setSel(people.map((p) => p.id))}>All</button><button className="text-faint" onClick={() => setSel([])}>None</button></span></div>
          <Input placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
          <div className="max-h-[300px] space-y-1 overflow-y-auto">
            {list.map((p) => (
              <label key={p.id} className={cx("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm", sel.includes(p.id) ? "border-good/40 bg-good-soft" : "border-line")}>
                <input type="checkbox" className="size-4 accent-[var(--good)]" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />{p.name || "Unnamed member"}
              </label>
            ))}
            {!list.length && <p className="text-sm text-faint">No members found.</p>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Select value={value} onChange={(e) => onChange(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{EVENT_LABELS[t]}</option>)}</Select>;
}

// ---------------------------------------------------------------- dashboard card (user side)
export function CoachInboxCard() {
  const { session } = useSession();
  const me = session?.user.id ?? "-";
  const q = useRows<Assignment>({ table: "assignments", filters: [["user_id", "eq", me], ["status", "in", ["assigned", "accepted", "change_requested"]]], order: [["date", true], ["start_time", true]] }, !!session, { refetchInterval: 60_000, staleTime: 0 });
  const [openId, setOpenId] = useState<string | null>(null);
  if (!q.rows.length) return null;
  const fresh = q.rows.filter((a) => a.status === "assigned").length;
  return (
    <Card className="mb-4 border-info/30 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted"><Bell className="size-4 text-info" />From your coach{fresh > 0 && <Badge tone="info">{fresh} new</Badge>}</div>
        <Link href="/inbox" className="text-xs font-medium text-good">Open inbox</Link>
      </div>
      <div className="grid gap-2 md:grid-cols-2">{q.rows.slice(0, 4).map((a) => <AssignmentCard key={a.id} a={a} who={a.coach_name ? `from ${a.coach_name}` : undefined} onOpen={() => setOpenId(a.id)} />)}</div>
      <AssignmentSheet a={q.rows.find((x) => x.id === openId) ?? null} side="user" onClose={() => setOpenId(null)} />
    </Card>
  );
}
