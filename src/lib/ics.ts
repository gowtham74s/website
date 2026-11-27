import type { CalendarEvent, Recurrence } from "./types";

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const RRULE: Record<Recurrence, string | null> = { none: null, daily: "FREQ=DAILY", weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", weekly: "FREQ=WEEKLY", monthly: "FREQ=MONTHLY" };

/** Export events as an RFC 5545 calendar file (works with Google, Apple, Outlook). */
export function toICS(events: CalendarEvent[]) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Forge//Fitness Command Center//EN", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@forge`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(new Date(e.start_at))}`, `DTEND:${fmt(new Date(e.end_at))}`, `SUMMARY:${esc(e.title)}`, `CATEGORIES:${e.type.toUpperCase()}`);
    if (e.notes) lines.push(`DESCRIPTION:${esc(e.notes)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    const r = RRULE[e.recurrence];
    if (r) lines.push(`RRULE:${r}${e.recurrence_until ? `;UNTIL=${e.recurrence_until.replace(/-/g, "")}T235959Z` : ""}`);
    if (e.reminder_minutes != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.reminder_minutes}M`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const parseDt = (v: string) => {
  const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00", z] = m;
  return z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
};

/** Minimal ICS import: single and simple recurring VEVENTs. */
export function fromICS(text: string) {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const out: Partial<CalendarEvent>[] = [];
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => block.match(new RegExp(`^${k}(?:;[^:]*)?:(.*)$`, "m"))?.[1]?.trim();
    const s = parseDt(get("DTSTART") || ""), e = parseDt(get("DTEND") || "") || (s ? new Date(s.getTime() + 3600_000) : null);
    if (!s || !e) continue;
    const rr = get("RRULE") || "";
    const recurrence: Recurrence = /FREQ=DAILY/.test(rr) ? "daily" : /BYDAY=MO,TU,WE,TH,FR/.test(rr) ? "weekdays" : /FREQ=WEEKLY/.test(rr) ? "weekly" : /FREQ=MONTHLY/.test(rr) ? "monthly" : "none";
    out.push({
      title: (get("SUMMARY") || "Untitled").replace(/\\([,;\\])/g, "$1").replace(/\\n/g, "\n"), start_at: s.toISOString(), end_at: e.toISOString(),
      all_day: !/T\d{2}/.test(get("DTSTART") || ""), notes: get("DESCRIPTION")?.replace(/\\n/g, "\n") ?? null, location: get("LOCATION") ?? null,
      recurrence, external_id: get("UID") ?? null, source: "ics", type: "other",
    });
  }
  return out;
}

export function download(name: string, content: string, type = "text/calendar") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
