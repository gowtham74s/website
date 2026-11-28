"use client";
// Coaching: assignments (coach → user), their feedback thread, and notifications.
import { supabase } from "./supabase";
import { insertRows, queryClient, uid, updateById, useRows } from "./data";
import { useProfile } from "./hooks";
import type { AppNotification, Assignment, AssignmentStatus, CoachRow, Role } from "./types";

export function useRole(): Role {
  const { profile } = useProfile();
  return (profile?.role as Role) ?? "user";
}
export const isStaff = (r: Role) => r === "coach" || r === "admin";

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  assigned: "New", accepted: "Accepted", done: "Done", change_requested: "Change requested", declined: "Declined", cancelled: "Cancelled",
};
export const STATUS_TONE: Record<AssignmentStatus, "neutral" | "good" | "warm" | "bad" | "info"> = {
  assigned: "info", accepted: "neutral", done: "good", change_requested: "warm", declined: "bad", cancelled: "neutral",
};

export const fmtWhen = (a: Pick<Assignment, "date" | "start_time" | "duration_min">) => {
  const d = new Date(`${a.date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const t = a.start_time ? new Date(`${a.date}T${a.start_time.slice(0, 5)}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return `${d}${t ? ` · ${t}` : ""}${a.duration_min ? ` · ${a.duration_min} min` : ""}`;
};

export function useNotifications() {
  return useRows<AppNotification>({ table: "notifications", order: [["created_at", false]], limit: 100 }, true, { refetchInterval: 60_000, staleTime: 0 });
}

export async function markAllRead(list: AppNotification[]) {
  const ids = list.filter((n) => !n.read_at).map((n) => n.id);
  if (!ids.length) return;
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (error) throw error;
  queryClient.invalidateQueries({ queryKey: ["rows", "notifications"] });
}

/** Accept: put the session in the user's own calendar and remember the link. */
export async function acceptAssignment(a: Assignment) {
  const start = new Date(`${a.date}T${(a.start_time ?? "09:00").slice(0, 5)}:00`);
  const end = new Date(start.getTime() + (a.duration_min ?? 60) * 60000);
  if (a.calendar_event_id) { // re-accepting after a change: move the existing calendar entry instead of duplicating it
    const { data } = await supabase.from("calendar_events").select("id").eq("id", a.calendar_event_id).maybeSingle();
    if (data) {
      await updateById("calendar_events", a.calendar_event_id, { title: a.title, type: a.type, start_at: start.toISOString(), end_at: end.toISOString(), all_day: !a.start_time });
      await updateById("assignments", a.id, { status: "accepted" });
      return;
    }
  }
  const [ev] = await insertRows("calendar_events", {
    title: a.title, type: a.type, start_at: start.toISOString(), end_at: end.toISOString(), all_day: !a.start_time,
    notes: [a.details, a.coach_name ? `From coach ${a.coach_name}` : "From your coach"].filter(Boolean).join("\n\n"),
    reminder_minutes: a.start_time ? 30 : null, source: "coach", source_ref: a.id,
  });
  await updateById("assignments", a.id, { status: "accepted", calendar_event_id: ev.id });
}

/** If the coach moved an accepted session, move the user's calendar copy too. */
export async function syncAcceptedToCalendar(list: Assignment[]) {
  const accepted = list.filter((a) => a.status === "accepted" && a.calendar_event_id);
  if (!accepted.length) return;
  const { data } = await supabase.from("calendar_events").select("id, title, start_at, end_at").in("id", accepted.map((a) => a.calendar_event_id!));
  for (const a of accepted) {
    const ev = data?.find((e) => e.id === a.calendar_event_id);
    if (!ev) continue;
    const start = new Date(`${a.date}T${(a.start_time ?? "09:00").slice(0, 5)}:00`);
    const end = new Date(start.getTime() + (a.duration_min ?? 60) * 60000);
    if (new Date(ev.start_at).getTime() !== start.getTime() || new Date(ev.end_at).getTime() !== end.getTime() || ev.title !== a.title)
      await updateById("calendar_events", ev.id, { title: a.title, start_at: start.toISOString(), end_at: end.toISOString() });
  }
}

export async function sendMessage(assignmentId: string, body: string, proposal?: Record<string, unknown> | null, rating?: number | null) {
  await insertRows("assignment_messages", { assignment_id: assignmentId, author_id: uid(), body: body || null, proposal: proposal ?? null, rating: rating ?? null });
}

export async function createAssignments(userIds: string[], a: { title: string; type: string; details: string | null; date: string; start_time: string | null; duration_min: number | null }) {
  const { error } = await supabase.from("assignments").insert(userIds.map((user_id) => ({ ...a, user_id, coach_id: uid() })));
  if (error) throw error;
  queryClient.invalidateQueries({ queryKey: ["rows", "assignments"] });
}

export async function coachOverview(date: string) {
  const { data, error } = await supabase.rpc("coach_overview", { p_date: date });
  if (error) throw error;
  return (data || []) as CoachRow[];
}

export async function sendReminder(userId: string, title: string, body: string, link = "/") {
  const { error } = await supabase.rpc("send_reminder", { p_user: userId, p_title: title, p_body: body, p_link: link });
  if (error) throw error;
}
