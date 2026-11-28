"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CheckCircle2, ChevronLeft, ChevronRight, Plus, ShieldAlert, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/calc";
import { assignCoach, coachDirectory, coachOverview, isStaff, ROLE_LABEL, sendReminder, STATUS_LABEL, useRole } from "@/lib/coach";
import { useSession } from "@/lib/auth";
import { Avatar } from "@/components/vibe";
import { useRows } from "@/lib/data";
import { today } from "@/lib/hooks";
import type { Assignment, CoachRow, DirectoryEntry } from "@/lib/types";
import { fmtMin } from "@/lib/units";
import { AssignmentCard, AssignmentSheet, NewAssignmentSheet } from "@/components/coaching";
import { Badge, Button, Card, cx, Empty, Field, IconButton, Input, PageHeader, Segmented, Sheet, Spinner, Textarea, useAction } from "@/components/ui";

export default function Page() { return <Suspense><Coach /></Suspense>; }

type Check = { key: string; label: string; ok: boolean; value: string };
function checks(r: CoachRow): Check[] {
  return [
    { key: "steps", label: "Steps", ok: r.steps >= r.steps_target || Number(r.walk_km) >= Number(r.walk_target), value: `${r.steps.toLocaleString()} / ${r.steps_target.toLocaleString()}` },
    { key: "water", label: "Water", ok: r.water_ml >= r.water_target, value: `${(r.water_ml / 1000).toFixed(1)} / ${(r.water_target / 1000).toFixed(1)} L` },
    { key: "protein", label: "Protein", ok: Number(r.protein) >= r.protein_target, value: `${Math.round(Number(r.protein))} / ${r.protein_target} g` },
    { key: "sleep", label: "Sleep", ok: r.sleep_min != null && r.sleep_min / 60 >= Number(r.sleep_target) - 0.25, value: r.sleep_min != null ? `${fmtMin(r.sleep_min)} / ${r.sleep_target} h` : "not logged" },
    { key: "workout", label: "Workout", ok: r.workout_done, value: r.workout_done ? "done" : "not done" },
  ];
}

function Coach() {
  const role = useRole();
  const sp = useSearchParams();
  const act = useAction();
  const T = today();
  const [day, setDay] = useState(T);
  const [tab, setTab] = useState<"board" | "events">(sp.get("a") ? "events" : "board");
  const [creating, setCreating] = useState<null | string[]>(null);
  const [remind, setRemind] = useState<CoachRow | null>(null);
  const [openId, setOpenId] = useState<string | null>(sp.get("a"));
  const [filter, setFilter] = useState<"attention" | "open" | "done" | "all">("attention");
  const [userFilter, setUserFilter] = useState<string | null>(null);
  useEffect(() => { const a = sp.get("a"); if (a) { setOpenId(a); setTab("events"); } }, [sp]);
  const staff = isStaff(role);
  const board = useQuery({ queryKey: ["coach_overview", day], queryFn: () => coachOverview(day), enabled: staff, refetchInterval: 60_000 });
  const { session } = useSession();
  const me = session?.user.id;
  const dir = useQuery({ queryKey: ["coach_directory"], queryFn: coachDirectory, enabled: staff, refetchInterval: 60_000 });
  const people = { rows: dir.data ?? [] };
  const [handover, setHandover] = useState<CoachRow | null>(null);
  const assigns = useRows<Assignment>({ table: "assignments", order: [["date", false]], limit: 500 }, staff, { refetchInterval: 60_000, staleTime: 0 });
  const names = useMemo(() => Object.fromEntries(people.rows.map((p) => [p.id, p.name || "Unnamed member"])), [people.rows]);
  const coaches = people.rows.filter((p) => (p.role === "coach" || p.role === "admin"));
  const free = people.rows.filter((p) => p.role === "user" && !p.coach_id && p.id !== me);
  // who this coach may send events to: own members (admins: everyone)
  const targets = (board.data ?? []).map((r) => ({ id: r.user_id, name: r.name }));

  if (!staff) return <Card className="mt-6"><Empty icon={<ShieldAlert className="size-5" />} title="Coaches only" body="Ask an admin to give your account the coach role." /></Card>;

  const rows = board.data ?? [];
  const flagged = rows.filter((r) => checks(r).some((c) => !c.ok));
  const list = assigns.rows.filter((a) => (!userFilter || a.user_id === userFilter) && (
    filter === "attention" ? a.status === "change_requested" || (a.status === "assigned" && a.date < T) :
    filter === "open" ? ["assigned", "accepted", "change_requested"].includes(a.status) :
    filter === "done" ? ["done", "declined", "cancelled"].includes(a.status) : true));
  const attention = assigns.rows.filter((a) => a.status === "change_requested").length;

  return (
    <div className="anim-rise">
      <PageHeader title="Coach" sub={`${rows.length} ${role === "admin" ? "people" : "of your members"} · ${flagged.length} with targets not met ${day === T ? "today" : "that day"}`} action={<Button variant="good" icon={<Plus className="size-4" />} onClick={() => setCreating([])}>New event</Button>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "board", label: "Members" }, { value: "events", label: `Events${attention ? ` · ${attention} to review` : ""}` }]} />

      {tab === "board" && (
        <>
          <div className="mb-4 flex items-center gap-1">
            <IconButton label="Previous day" onClick={() => setDay(addDays(day, -1))}><ChevronLeft className="size-5" /></IconButton>
            <div className="min-w-[150px] text-center font-semibold">{day === T ? "Today" : new Date(`${day}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
            <IconButton label="Next day" disabled={day >= T} onClick={() => setDay(addDays(day, 1))}><ChevronRight className="size-5" /></IconButton>
            {board.isFetching && <Spinner className="ml-2 size-4" />}
          </div>
          {board.error ? <Card className="p-4 text-sm text-bad">{(board.error as Error).message}</Card> : !rows.length && !board.isLoading ? (
            <Card><Empty icon={<Users className="size-5" />} title="No members yet" body={free.length ? "Claim free members below — they become yours to coach." : "An admin assigns members to you, or you can claim free members when there are any."} /></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => {
                const cs = checks(r); const miss = cs.filter((c) => !c.ok);
                return (
                  <Card key={r.user_id} className={cx("p-4", miss.length >= 3 && "border-bad/30")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-semibold"><Avatar name={r.name} emoji={r.avatar_emoji} color={r.avatar_color} size={28} />{r.name || "Unnamed member"}{r.role !== "user" && <Badge tone="info">{ROLE_LABEL[r.role]}</Badge>}</div>
                        {role === "admin" && <div className="text-xs text-faint">{r.coach_name ? `coach: ${r.coach_name}` : "no coach yet"}</div>}
                        <div className="text-xs text-faint">{r.last_log ? `last log ${r.last_log === T ? "today" : new Date(`${r.last_log}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "no logs yet"}{r.open_assignments ? ` · ${r.open_assignments} open event${r.open_assignments > 1 ? "s" : ""}` : ""}</div>
                      </div>
                      {miss.length ? <Badge tone={miss.length >= 3 ? "bad" : "warm"}><AlertTriangle className="size-3" />{miss.length} missed</Badge> : <Badge tone="good"><CheckCircle2 className="size-3" />on track</Badge>}
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {cs.map((c) => (
                        <div key={c.key} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2"><span className={cx("size-2 rounded-full", c.ok ? "bg-good" : "bg-bad")} />{c.label}</span>
                          <span className={cx("num text-xs", c.ok ? "text-muted" : "text-fg")}>{c.value}</span>
                        </div>
                      ))}
                      {(r.resting_hr != null || r.stress_avg != null) && <div className="flex justify-between text-xs text-faint"><span>Vitals</span><span className="num">{r.resting_hr != null && `♥ ${r.resting_hr} bpm`}{r.stress_avg != null && ` · stress ${r.stress_avg}`}</span></div>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <Button size="sm" variant="good" icon={<Plus className="size-3.5" />} onClick={() => setCreating([r.user_id])}>Assign</Button>
                      <Button size="sm" variant={miss.length ? "warm" : "secondary"} icon={<BellRing className="size-3.5" />} onClick={() => setRemind(r)}>Remind</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setUserFilter(r.user_id); setFilter("all"); setTab("events"); }}>Events</Button>
                      {(r.coach_id === me || role === "admin") && <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={() => setHandover(r)}>Hand over</Button>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          {free.length > 0 && (
            <div className="mt-6">
              <div className="mb-2.5 flex items-baseline justify-between"><h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Free members · {free.length}</h2><span className="text-xs text-faint">Not assigned to any coach yet</span></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {free.map((p) => (
                  <Card key={p.id} className="flex items-center gap-3 p-3">
                    <Avatar name={p.name} emoji={p.avatar_emoji} color={p.avatar_color} size={34} />
                    <div className="min-w-0 flex-1 truncate font-medium">{p.name || "Unnamed member"}</div>
                    <Button size="sm" variant="good" onClick={() => act(() => assignCoach(p.id, me!), `${p.name || "Member"} is now your member`)}>Claim</Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
          <p className="mt-4 text-xs text-faint">Coaches see daily totals only (no individual food or log entries). Targets are each member&apos;s own settings.</p>
        </>
      )}

      {tab === "events" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: "attention", label: "Needs review" }, { value: "open", label: "Open" }, { value: "done", label: "Closed" }, { value: "all", label: "All" }]} />
            {userFilter && <button onClick={() => setUserFilter(null)} className="rounded-full bg-card-2 px-3 py-1 text-xs">{names[userFilter]} ✕</button>}
          </div>
          {list.length ? <div className="space-y-2">{list.map((a) => <AssignmentCard key={a.id} a={a} who={`for ${names[a.user_id] ?? "user"}${a.coach_id && names[a.coach_id] && role === "admin" ? ` · by ${a.coach_name ?? names[a.coach_id]}` : ""}`} onOpen={() => setOpenId(a.id)} />)}</div>
            : <Card><Empty title={filter === "attention" ? "Nothing to review" : "No events"} body={filter === "attention" ? "Change requests and overdue unanswered events appear here." : "Create an event and send it to one or more of your members."} action={<Button onClick={() => setCreating([])}>New event</Button>} /></Card>}
          <p className="mt-3 text-xs text-faint">Statuses: {Object.values(STATUS_LABEL).join(" · ")}</p>
        </>
      )}

      <NewAssignmentSheet open={!!creating} onClose={() => setCreating(null)} preselect={creating ?? []} people={targets} />
      <HandoverSheet row={handover} coaches={coaches.filter((c) => c.id !== handover?.user_id)} me={me} onClose={() => setHandover(null)} />
      <AssignmentSheet a={assigns.rows.find((x) => x.id === openId) ?? null} side="coach" names={names} onClose={() => setOpenId(null)} />
      <RemindSheet row={remind} onClose={() => setRemind(null)} onSend={(title, body, link) => act(async () => { await sendReminder(remind!.user_id, title, body, link); setRemind(null); }, "Reminder sent")} day={day} />
    </div>
  );
}

function RemindSheet({ row, onClose, onSend, day }: { row: CoachRow | null; onClose: () => void; onSend: (title: string, body: string, link: string) => void; day: string }) {
  const miss = row ? checks(row).filter((c) => !c.ok) : [];
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const key = row?.user_id;
  useEffect(() => {
    if (!row) return;
    setTitle(miss.length ? `Reminder: ${miss.map((m) => m.label.toLowerCase()).join(", ")} not done yet` : "Keep it up today!");
    setBody(miss.length ? `${day === today() ? "Today" : "On " + day}: ${miss.map((m) => `${m.label} ${m.value}`).join(" · ")}. You've got this — log it when done.` : "Great consistency. Keep going!");
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = miss[0] ? { steps: "/activity", water: "/hydration", protein: "/nutrition", sleep: "/sleep", workout: "/workout" }[miss[0].key] ?? "/" : "/";
  return (
    <Sheet open={!!row} onClose={onClose} title={`Remind ${row?.name ?? ""}`} footer={<Button variant="warm" className="w-full" icon={<BellRing className="size-4" />} disabled={!title.trim()} onClick={() => onSend(title.trim(), body.trim(), link)}>Send reminder</Button>}>
      <div className="space-y-3">
        {miss.length > 0 && <div className="flex flex-wrap gap-1.5">{miss.map((m) => <Badge key={m.key} tone="bad">{m.label}: {m.value}</Badge>)}</div>}
        <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Message"><Textarea value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <p className="text-xs text-faint">Appears in their inbox and as a notification when the app is open.</p>
      </div>
    </Sheet>
  );
}


function HandoverSheet({ row, coaches, me, onClose }: { row: CoachRow | null; coaches: DirectoryEntry[]; me?: string; onClose: () => void }) {
  const act = useAction();
  const others = coaches.filter((c) => c.id !== row?.coach_id);
  return (
    <Sheet open={!!row} onClose={onClose} title={`Hand over ${row?.name ?? ""}`}>
      <p className="mb-3 text-sm text-muted">Choose the coach who should take care of this member. They&apos;ll both be notified. {row?.coach_id === me ? "You can also release them back to the free pool." : ""}</p>
      <div className="space-y-1.5">
        {others.map((c) => (
          <button key={c.id} onClick={() => act(async () => { await assignCoach(row!.user_id, c.id); onClose(); }, `Handed over to ${c.name}`)} className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2.5 text-left hover:border-line-2">
            <Avatar name={c.name} emoji={c.avatar_emoji} color={c.avatar_color} size={30} /><span className="flex-1 font-medium">{c.name}{c.id === me ? " (you)" : ""}</span><Badge tone="info">{ROLE_LABEL[c.role]}</Badge>
          </button>
        ))}
        {!others.length && <p className="text-sm text-faint">There are no other coaches yet.</p>}
      </div>
      {row?.coach_id && <Button variant="ghost" className="mt-4 w-full" onClick={() => act(async () => { await assignCoach(row.user_id, null); onClose(); }, "Released to the free pool")}>Release to free pool</Button>}
    </Sheet>
  );
}
