// Google Calendar integration via Google Identity Services (token flow, in-browser).
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID. Access tokens live in memory only and are never stored.
import type { CalendarEvent } from "./types";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const gcalAvailable = Boolean(CLIENT_ID);
let token: { value: string; exp: number } | null = null;

type TokenClient = { requestAccessToken: (o?: { prompt?: string }) => void };
declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (c: { client_id: string; scope: string; callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void }) => TokenClient } } } } }

function loadScript() {
  return new Promise<void>((res, rej) => {
    if (window.google?.accounts) return res();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.onload = () => res(); s.onerror = () => rej(new Error("Could not load Google sign-in"));
    document.head.appendChild(s);
  });
}

export async function authorize(): Promise<string> {
  if (!CLIENT_ID) throw new Error("Google Calendar isn't configured (NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
  if (token && token.exp > Date.now() + 60_000) return token.value;
  await loadScript();
  return new Promise((res, rej) => {
    const c = window.google!.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: (r) => {
      if (r.error || !r.access_token) return rej(new Error(r.error || "Authorization cancelled"));
      token = { value: r.access_token, exp: Date.now() + (r.expires_in ?? 3600) * 1000 };
      res(r.access_token);
    } });
    c.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

async function api(path: string, init?: RequestInit) {
  const t = await authorize();
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, { ...init, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`Google Calendar: ${r.status} ${await r.text().catch(() => "")}`.slice(0, 200));
  return r.json();
}

/** Upcoming Google events (primary calendar), expanded, for import. */
export async function fetchGoogleEvents(days = 14) {
  const now = new Date(), until = new Date(now.getTime() + days * 86400_000);
  const j = await api(`/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${now.toISOString()}&timeMax=${until.toISOString()}`);
  return (j.items || []).filter((e: { status: string }) => e.status !== "cancelled").map((e: { id: string; summary?: string; description?: string; location?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string } }) => ({
    external_id: `google:${e.id}`, title: e.summary || "(busy)", notes: e.description ?? null, location: e.location ?? null,
    start_at: new Date(e.start.dateTime || `${e.start.date}T00:00:00`).toISOString(), end_at: new Date(e.end.dateTime || `${e.end.date}T00:00:00`).toISOString(),
    all_day: !e.start.dateTime, type: "work" as const, source: "google", recurrence: "none" as const,
  }));
}

export async function pushToGoogle(e: CalendarEvent) {
  const rr = { daily: "RRULE:FREQ=DAILY", weekdays: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "RRULE:FREQ=WEEKLY", monthly: "RRULE:FREQ=MONTHLY", none: null }[e.recurrence];
  return api("/calendars/primary/events", { method: "POST", body: JSON.stringify({
    summary: e.title, description: e.notes ?? undefined, location: e.location ?? undefined,
    start: { dateTime: e.start_at }, end: { dateTime: e.end_at }, recurrence: rr ? [rr] : undefined,
    reminders: e.reminder_minutes != null ? { useDefault: false, overrides: [{ method: "popup", minutes: e.reminder_minutes }] } : undefined,
  }) });
}
