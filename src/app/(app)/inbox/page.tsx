"use client";
import { Inbox as InboxIcon, Megaphone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth";
import { syncAcceptedToCalendar } from "@/lib/coach";
import { useRows } from "@/lib/data";
import { today } from "@/lib/hooks";
import type { Assignment } from "@/lib/types";
import { AssignmentCard, AssignmentSheet, NotificationList } from "@/components/coaching";
import { Card, Empty, PageHeader, Section, Segmented } from "@/components/ui";

export default function Page() { return <Suspense><Inbox /></Suspense>; }

function Inbox() {
  const sp = useSearchParams();
  const { session } = useSession();
  const me = session?.user.id ?? "-";
  const q = useRows<Assignment>({ table: "assignments", filters: [["user_id", "eq", me]], order: [["date", true], ["start_time", true]] }, !!session, { refetchInterval: 60_000, staleTime: 0 });
  const [tab, setTab] = useState<"open" | "past" | "alerts">("open");
  const [openId, setOpenId] = useState<string | null>(sp.get("a"));
  useEffect(() => { const a = sp.get("a"); if (a) setOpenId(a); }, [sp]);
  useEffect(() => { syncAcceptedToCalendar(q.rows).catch(() => {}); }, [q.rows]);
  const t = today();
  const open = useMemo(() => q.rows.filter((a) => ["assigned", "accepted", "change_requested"].includes(a.status)), [q.rows]);
  const past = useMemo(() => q.rows.filter((a) => !["assigned", "accepted", "change_requested"].includes(a.status)).reverse(), [q.rows]);
  const sel = q.rows.find((a) => a.id === openId) ?? null;
  const groups = [
    { title: "Needs your answer", list: open.filter((a) => a.status === "assigned") },
    { title: "Waiting for your coach", list: open.filter((a) => a.status === "change_requested") },
    { title: "Today", list: open.filter((a) => a.status === "accepted" && a.date === t) },
    { title: "Upcoming", list: open.filter((a) => a.status === "accepted" && a.date > t) },
    { title: "Overdue", list: open.filter((a) => a.status === "accepted" && a.date < t) },
  ];
  return (
    <div className="anim-rise">
      <PageHeader title="Inbox" sub="Events from your coach, replies and reminders." />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "open", label: `From coach${open.length ? ` (${open.length})` : ""}` }, { value: "past", label: "Done & past" }, { value: "alerts", label: "Notifications" }]} />
      {tab === "open" && (open.length ? groups.filter((g) => g.list.length).map((g) => (
        <Section key={g.title} title={g.title}><div className="space-y-2">{g.list.map((a) => <AssignmentCard key={a.id} a={a} who={a.coach_name ? `from ${a.coach_name}` : undefined} onOpen={() => setOpenId(a.id)} />)}</div></Section>
      )) : <Card><Empty icon={<Megaphone className="size-5" />} title="Nothing from your coach right now" body="When your coach sends you a workout, walk, meal or any event, it appears here. Accept it to add it to your calendar, or propose a change." /></Card>)}
      {tab === "past" && (past.length ? <div className="space-y-2">{past.map((a) => <AssignmentCard key={a.id} a={a} who={a.coach_name ? `from ${a.coach_name}` : undefined} onOpen={() => setOpenId(a.id)} />)}</div> : <Card><Empty icon={<InboxIcon className="size-5" />} title="No past events yet" /></Card>)}
      {tab === "alerts" && <NotificationList />}
      <AssignmentSheet a={sel} side="user" onClose={() => setOpenId(null)} />
    </div>
  );
}
