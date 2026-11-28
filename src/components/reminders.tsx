"use client";
// In-app reminder engine. While the app (or installed PWA) is open it checks reminders every 30s and shows
// a system notification through the service worker. It enforces quiet hours and a per-hour cap so you are
// never bombarded, and skips reminders that are already satisfied (e.g. water target hit).
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth";
import { expandEvents, dateKey } from "@/lib/calc";
import { updateById, useRows } from "@/lib/data";
import { useProfile } from "@/lib/hooks";
import type { AppNotification, CalendarEvent, HydrationLog, Reminder } from "@/lib/types";

const toMin = (t: string | null) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const inWindow = (now: number, a: number | null, b: number | null) => (a == null || b == null ? true : a <= b ? now >= a && now <= b : now >= a || now <= b);

export async function notify(title: string, body: string, url = "/") {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url }, tag: title });
    else new Notification(title, { body, icon: "/icons/icon-192.png" });
    return true;
  } catch { return false; }
}

const URLS: Record<string, string> = { water: "/hydration", meal: "/nutrition", protein: "/nutrition", workout: "/workout", preworkout: "/nutrition", walk: "/activity", sleep: "/sleep", checkin: "/sleep", wake: "/" };

export function ReminderEngine() {
  const { session } = useSession();
  const { profile } = useProfile();
  const reminders = useRows<Reminder>({ table: "reminders", filters: [["enabled", "eq", true]] }, !!session);
  const t = dateKey();
  const water = useRows<HydrationLog>({ table: "hydration_logs", filters: [["date", "eq", t]] }, !!session);
  const events = useRows<CalendarEvent>({ table: "calendar_events", filters: [["reminder_minutes", "gte", 0]] }, !!session);
  const inbox = useRows<AppNotification>({ table: "notifications", order: [["created_at", false]], limit: 20 }, !!session, { refetchInterval: 60_000, staleTime: 0 });
  // New coach messages / reminders → system notification (only while the app is open; respects the on/off switch).
  useEffect(() => {
    if (!inbox.rows.length || !profile?.notification_settings?.enabled) return;
    let seen = ""; try { seen = localStorage.getItem("forge-notif-seen") || ""; } catch { /* ignore */ }
    const fresh = inbox.rows.filter((n) => !n.read_at && n.created_at > seen);
    if (seen) fresh.slice(0, 3).forEach((n) => notify(n.title, n.body ?? "", n.link ?? "/inbox"));
    try { localStorage.setItem("forge-notif-seen", inbox.rows[0].created_at); } catch { /* ignore */ }
  }, [inbox.rows, profile?.notification_settings?.enabled]);
  const fired = useRef<number[]>([]);
  const state = useRef({ reminders: reminders.rows, water: water.rows, events: events.rows, profile });
  state.current = { reminders: reminders.rows, water: water.rows, events: events.rows, profile };

  useEffect(() => {
    if (!session) return;
    const tick = async () => {
      const { reminders, water, events, profile } = state.current;
      const ns = profile?.notification_settings;
      if (!ns?.enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const now = new Date(), nm = now.getHours() * 60 + now.getMinutes();
      if (!inWindow(nm, null, null) || (toMin(ns.quiet_start) != null && inWindow(nm, toMin(ns.quiet_start), toMin(ns.quiet_end)))) return;
      fired.current = fired.current.filter((x) => now.getTime() - x < 3600_000);
      const cap = ns.max_per_hour ?? 3;
      const fire = async (title: string, body: string, url: string) => {
        if (fired.current.length >= cap) return false;
        const ok = await notify(title, body, url);
        if (ok) fired.current.push(now.getTime());
        return ok;
      };
      for (const r of reminders) {
        if (r.snoozed_until && new Date(r.snoozed_until) > now) continue;
        if (r.days?.length && !r.days.includes(now.getDay())) continue;
        const last = r.last_fired_at ? new Date(r.last_fired_at) : null;
        let due = false;
        if (r.interval_minutes) {
          due = inWindow(nm, toMin(r.window_start), toMin(r.window_end)) && (!last || now.getTime() - last.getTime() >= r.interval_minutes * 60_000);
        } else if (r.time) {
          const tm = toMin(r.time)!;
          due = nm >= tm && nm - tm < 30 && (!last || dateKey(last) !== dateKey(now));
        }
        if (!due) continue;
        if (r.type === "water" && profile && water.reduce((a, w) => a + w.amount_ml, 0) >= profile.water_target_ml) continue;
        if (await fire(r.label, r.type === "water" ? "Time for a glass of water." : "Tap to open Forge.", URLS[r.type] || "/")) updateById("reminders", r.id, { last_fired_at: now.toISOString() }).catch(() => {});
      }
      // calendar event reminders
      const occ = expandEvents(events, dateKey(now), dateKey(now));
      for (const o of occ) {
        const lead = o.event.reminder_minutes ?? 0;
        const at = o.start.getTime() - lead * 60_000;
        const key = `forge-evrem-${o.event.id}-${o.date}`;
        if (now.getTime() >= at && now.getTime() - at < 5 * 60_000 && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          await fire(o.event.title, lead ? `Starts in ${lead} min` : "Starting now", "/calendar?view=day");
        }
      }
    };
    const iv = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(iv);
  }, [session]);
  return null;
}
