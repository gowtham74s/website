"use client";
import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { useRows } from "@/lib/data";
import type { GroupSession } from "@/lib/types";
import { SessionBanner } from "./session-banner";

/** Dashboard strip of upcoming group sessions (banners), newest first. */
export function UpcomingSessions() {
  const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString(); // hour-stable cache key
  const q = useRows<GroupSession>({ table: "group_sessions", filters: [["ends_at", "gte", now], ["status", "eq", "scheduled"]], order: [["starts_at", true]], limit: 6 }, true, { refetchInterval: 120_000, staleTime: 0 });
  if (!q.rows.length) return null;
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between"><h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Group sessions</h2><Link href="/sessions" className="flex items-center text-xs font-medium text-good">All<ChevronRight className="size-3.5" /></Link></div>
      <div className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {q.rows.map((s) => (
          <Link key={s.id} href={`/sessions?s=${s.id}`} className="w-[78%] shrink-0 snap-start sm:w-[340px]">
            <SessionBanner s={s} className="h-36">
              <div className="font-display text-lg font-semibold leading-tight drop-shadow">{s.title}</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs opacity-90">{new Date(s.starts_at).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{s.location && <><MapPin className="ml-1 size-3" />{s.location}</>}</div>
            </SessionBanner>
          </Link>
        ))}
      </div>
    </section>
  );
}
