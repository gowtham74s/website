"use client";
import { bannerUrl } from "@/lib/coach";
import type { GroupSession } from "@/lib/types";
import { cx } from "./ui";

const FALLBACK = ["linear-gradient(135deg,#2ef59d,#26e0ff)", "linear-gradient(135deg,#b388ff,#ff5fa2)", "linear-gradient(135deg,#ffb020,#ff4d6d)", "linear-gradient(135deg,#4cc9ff,#b388ff)"];

export function SessionBanner({ s, className, children }: { s: GroupSession; className?: string; children?: React.ReactNode }) {
  const url = bannerUrl(s.banner_path);
  const fb = FALLBACK[Math.abs([...s.id].reduce((a, c) => a + c.charCodeAt(0), 0)) % FALLBACK.length];
  return (
    <div className={cx("relative overflow-hidden rounded-2xl", className)} style={{ background: url ? undefined : fb }}>
      {url && <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="relative flex h-full flex-col justify-end p-4 text-white">{children}</div>
    </div>
  );
}

