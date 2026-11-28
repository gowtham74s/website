"use client";
import { HeartPulse, BarChart3, CalendarDays, CheckCircle2, CloudOff, Dumbbell, Footprints, Home, LineChart, ListChecks, Plus, RefreshCw, Scale as ScaleIcon, Settings, Sparkles, Utensils, X, Droplets, CalendarPlus, Moon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth";
import { useSyncState } from "@/lib/data";
import { useProfile } from "@/lib/hooks";
import { NotificationBell } from "./coaching";
import { Avatar, MotionBackground, SloganTicker } from "./vibe";
import { ROLE_LABEL } from "@/lib/coach";
import { Inbox, Megaphone, Menu, ShieldCheck, Tent } from "lucide-react";
import { Sheet } from "./ui";
import { cx, Spinner } from "./ui";
import { FoodLogSheet, HabitQuickSheet, WeightSheet, useAddWater } from "./loggers";
import { ReminderEngine } from "./reminders";
import { useAutoHabits } from "@/lib/auto-habits";

function AutoHabits() { useAutoHabits(); return null; }

const NAV = [
  { href: "/", label: "Dashboard", short: "Today", icon: Home },
  { href: "/workout", label: "Workout", short: "Train", icon: Dumbbell },
  { href: "/nutrition", label: "Nutrition", short: "Eat", icon: Utensils },
  { href: "/calendar", label: "Calendar", short: "Plan", icon: CalendarDays },
  { href: "/progress", label: "Progress", short: "Progress", icon: LineChart },
  { href: "/habits", label: "Habits", short: "Habits", icon: ListChecks },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
];
const MORE = [
  { href: "/hydration", label: "Hydration", icon: Droplets },
  { href: "/activity", label: "Activity", icon: Footprints },
  { href: "/sleep", label: "Sleep & recovery", icon: Moon },
  { href: "/vitals", label: "Vitals", icon: HeartPulse },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/assistant", label: "AI assistant", icon: Sparkles },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function SyncPill() {
  const s = useSyncState();
  if (s.online && !s.pending && !s.syncing) return null;
  return (
    <div className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", s.online ? "bg-info/15 text-info" : "bg-warm-soft text-warm")} role="status">
      {s.online ? <RefreshCw className={cx("size-3.5", s.syncing && "animate-spin")} /> : <CloudOff className="size-3.5" />}
      {s.online ? `Syncing ${s.pending || ""}`.trim() : `Offline${s.pending ? ` · ${s.pending} queued` : ""}`}
    </div>
  );
}

function QuickActions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const addWater = useAddWater();
  const [sheet, setSheet] = useState<null | "food" | "weight" | "habit">(null);
  const go = (href: string) => { onClose(); router.push(href); };
  const items = [
    { label: "Log workout", icon: Dumbbell, tone: "text-warm", on: () => go("/workout") },
    { label: "Log food", icon: Utensils, tone: "text-good", on: () => { onClose(); setSheet("food"); } },
    { label: "Log weight", icon: ScaleIcon, tone: "text-violet", on: () => { onClose(); setSheet("weight"); } },
    { label: "Start walk", icon: Footprints, tone: "text-cyan", on: () => go("/activity?walk=1") },
    { label: "Add event", icon: CalendarPlus, tone: "text-info", on: () => go("/calendar?new=1") },
    { label: "Habit done", icon: CheckCircle2, tone: "text-good", on: () => { onClose(); setSheet("habit"); } },
  ];
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[55]" onClick={onClose}>
          <div className="anim-fade absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="anim-sheet safe-b absolute inset-x-3 bottom-24 rounded-3xl border border-line bg-card p-4 shadow-2xl sm:left-auto sm:right-6 sm:w-[380px] lg:bottom-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><span className="font-semibold">Quick log</span><button aria-label="Close" onClick={onClose}><X className="size-5 text-muted" /></button></div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {[250, 500, 750].map((ml) => (
                <button key={ml} onClick={() => addWater(ml)} className="flex h-16 flex-col items-center justify-center rounded-2xl border border-line bg-bg-2 text-cyan transition active:scale-95">
                  <Droplets className="size-4" /><span className="num mt-1 text-sm font-semibold text-fg">+{ml} ml</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((it) => (
                <button key={it.label} onClick={it.on} className="flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-bg-2 transition active:scale-95">
                  <it.icon className={cx("size-5", it.tone)} /><span className="text-xs font-medium">{it.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <FoodLogSheet open={sheet === "food"} onClose={() => setSheet(null)} />
      <WeightSheet open={sheet === "weight"} onClose={() => setSheet(null)} />
      <HabitQuickSheet open={sheet === "habit"} onClose={() => setSheet(null)} />
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { session, loading } = useSession();
  const { profile } = useProfile();
  const role = profile?.role ?? "user";
  const ROLE_NAV = [
    { href: "/inbox", label: "Inbox", icon: Inbox },
    { href: "/sessions", label: "Group sessions", icon: Tent },
    ...(role === "coach" || role === "admin" ? [{ href: "/coach", label: "Coach", icon: Megaphone }] : []),
    ...(role === "admin" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];
  const [qa, setQa] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);

  useEffect(() => { if (!loading && !session) router.replace("/login"); }, [loading, session, router]);
  useEffect(() => {
    if (!profile) return;
    try { localStorage.setItem("forge-theme", profile.theme); } catch { /* ignore */ }
    const t = profile.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : profile.theme;
    document.documentElement.dataset.theme = t;
  }, [profile?.theme]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => { if (profile && !profile.onboarded && path !== "/onboarding") router.replace("/onboarding"); }, [profile, path, router]);

  if (loading || !session) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;
  if (path === "/onboarding" || path.startsWith("/workout/session")) return <>{children}<ReminderEngine /></>;

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-bg-2/80 px-3 py-5 backdrop-blur lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-3">
          <img src="/icons/icon.svg" alt="" className="size-8 rounded-lg" />
          <span className="brand-text font-display text-lg font-bold tracking-tight">Forge</span>
        </Link>
        <div className="-mt-14 mb-6 flex justify-end px-1"><NotificationBell /></div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive(path, n.href) ? "bg-card-2 text-fg ring-1 ring-line" : "text-muted hover:bg-card hover:text-fg")}>
              <n.icon className="size-[18px]" />{n.label}
            </Link>
          ))}
          <div className="mx-3 my-3 h-px bg-line" />
          {[...ROLE_NAV, ...MORE].map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition", isActive(path, n.href) ? "bg-card-2 text-fg ring-1 ring-line" : "text-muted hover:bg-card hover:text-fg")}>
              <n.icon className="size-[18px]" />{n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-1">
          {profile && <Link href="/settings" className="flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-card"><Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} size={32} /><div className="min-w-0"><div className="truncate text-sm font-medium">{profile.name || "Set your name"}</div><div className="text-[11px] text-faint">{ROLE_LABEL[role as "user"]}</div></div></Link>}
          <SloganTicker className="block px-2 text-[13px] leading-snug" />
          <SyncPill />
          <button onClick={() => setQa(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-fg py-2.5 text-sm font-semibold text-bg transition active:scale-[.98]"><Plus className="size-4" />Quick log</button>
        </div>
      </aside>

      {/* mobile top bar */}
      <header className="safe-t sticky top-0 z-30 flex items-center justify-between border-b border-line/60 bg-bg/80 px-4 py-2.5 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2"><img src="/icons/icon.svg" alt="" className="size-7 rounded-lg" /><span className="brand-text font-display font-bold tracking-tight">Forge</span></Link>
        <div className="flex items-center gap-1">
          <SyncPill />
          <NotificationBell />
          {(role === "coach" || role === "admin") && <Link href="/coach" aria-label="Coach" className="grid size-9 place-items-center rounded-xl text-muted hover:text-fg"><Megaphone className="size-5" /></Link>}
          {role === "admin" && <Link href="/admin" aria-label="Admin" className="grid size-9 place-items-center rounded-xl text-muted hover:text-fg"><ShieldCheck className="size-5" /></Link>}
          {profile && <Link href="/settings" aria-label="Your profile"><Avatar name={profile.name} emoji={profile.avatar_emoji} color={profile.avatar_color} size={28} /></Link>}
          <button aria-label="Menu — all pages" onClick={() => setMenu(true)} className="grid size-9 place-items-center rounded-xl text-muted hover:text-fg"><Menu className="size-5" /></button>
        </div>
      </header>

      <MotionBackground />
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">{children}</main>

      {/* mobile bottom nav */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.slice(0, 6).map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition", isActive(path, n.href) ? "text-fg" : "text-faint")}>
              <n.icon className={cx("size-[22px]", isActive(path, n.href) && "text-good")} strokeWidth={isActive(path, n.href) ? 2.4 : 1.8} />{n.short}
            </Link>
          ))}
        </div>
      </nav>
      <button aria-label="Quick log" onClick={() => setQa(true)} className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-2xl bg-good text-black shadow-[0_10px_30px_-8px_rgba(16,185,129,.6)] transition active:scale-90 lg:hidden">
        <Plus className="size-7" strokeWidth={2.4} />
      </button>
      <Sheet open={menu} onClose={() => setMenu(false)} title="All pages">
        <div className="grid grid-cols-3 gap-2">
          {[...NAV, ...ROLE_NAV, ...MORE].map((n) => (
            <Link key={n.href} href={n.href} className={cx("flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-xs font-medium transition active:scale-95", isActive(path, n.href) ? "border-good/40 bg-good-soft text-good" : "border-line bg-bg-2 text-fg", (n.href === "/admin" || n.href === "/coach") && !isActive(path, n.href) && "border-info/40")}>
              <n.icon className="size-5" />{n.label}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-faint">Signed in as {ROLE_LABEL[role as "user"]}{role !== "user" ? " — Coach and Admin pages are in this menu" : ""}.</p>
      </Sheet>
      <QuickActions open={qa} onClose={() => setQa(false)} />
      <ReminderEngine />
      <AutoHabits />
    </div>
  );
}
