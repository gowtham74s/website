"use client";
// Visual energy: animated "running lines" background with workout & food icons, a rotating slogan ticker
// (300 generated slogans), and avatars. All motion stops for people who prefer reduced motion.
import { useEffect, useMemo, useState } from "react";
import { cx } from "./ui";

// ---------------------------------------------------------------- 300 slogans (15 openers × 20 endings)
const OPENERS = [
  "Every rep", "Every step", "Every glass of water", "Every early night", "Every clean meal", "Every set you finish",
  "Every kilometre", "Every stretch", "Every drop of sweat", "Every protein-packed plate", "Every “one more”",
  "Every sunrise workout", "Every rest day you respect", "Every small win", "Every time you show up",
];
const ENDINGS = [
  "builds the stronger you.", "is a vote for your future self.", "beats yesterday’s excuse.", "stacks up faster than you think.",
  "turns discipline into identity.", "is progress you can feel.", "moves you one step past average.", "writes your comeback story.",
  "counts — especially today.", "makes the next one easier.", "is how champions are quietly built.", "outlasts motivation.",
  "is proof you keep promises to yourself.", "pays you back with energy.", "beats perfect plans that never start.", "is fuel, not punishment.",
  "makes Monday-you proud.", "adds up to a different body.", "is the habit that changes everything.", "keeps the streak alive.",
];
function seeded(n: number) { let s = n; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
export const SLOGANS: string[] = (() => {
  const all = OPENERS.flatMap((o) => ENDINGS.map((e) => `${o} ${e}`));
  const r = seeded(20261128);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all; // 300 unique slogans in a stable shuffled order
})();

export function SloganTicker({ className, interval = 7000 }: { className?: string; interval?: number }) {
  const start = useMemo(() => Math.floor((Date.now() / 86_400_000) * 37) % SLOGANS.length, []); // different start each day
  const [i, setI] = useState(start);
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => { setShow(false); setTimeout(() => { setI((x) => (x + 1) % SLOGANS.length); setShow(true); }, 350); }, interval);
    return () => clearInterval(t);
  }, [interval]);
  return (
    <button type="button" onClick={() => { setI((x) => (x + 1) % SLOGANS.length); }} title="Tap for another" aria-live="polite"
      className={cx("brand-text text-left font-semibold tracking-tight transition-all duration-300", show ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0", className)}>
      {SLOGANS[i]}
    </button>
  );
}

// ---------------------------------------------------------------- running lines background
const TRACKS = [
  "M -100 120 C 200 40, 400 200, 700 110 S 1200 30, 1600 140",
  "M -100 380 C 250 300, 450 470, 800 360 S 1300 290, 1600 400",
  "M -100 640 C 220 560, 520 720, 860 610 S 1300 540, 1600 660",
  "M -100 880 C 300 820, 520 960, 900 860 S 1350 800, 1600 900",
];
const RUNNERS = ["🏃", "🏋️", "🚴", "🥑", "💧", "🍎", "🔥", "🥦", "🧘", "💪", "🥚", "⚡"];

export function MotionBackground() {
  return (
    <div aria-hidden className="motion-bg pointer-events-none fixed inset-0 -z-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="trackGrad" x1="0" x2="1">
            <stop offset="0" stopColor="var(--good)" /><stop offset="0.45" stopColor="var(--cyan)" /><stop offset="0.75" stopColor="var(--violet)" /><stop offset="1" stopColor="var(--pink)" />
          </linearGradient>
        </defs>
        {TRACKS.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="url(#trackGrad)" strokeWidth="1.2" opacity="0.18" />
            <path d={d} fill="none" stroke="url(#trackGrad)" strokeWidth="2.5" strokeLinecap="round" className="run-dash" style={{ animationDuration: `${7 + i * 2.5}s`, animationDelay: `${-i * 1.7}s` }} />
          </g>
        ))}
      </svg>
      {RUNNERS.map((e, i) => (
        <span key={i} className="runner absolute left-0 top-0 text-xl sm:text-2xl"
          style={{ offsetPath: `path('${TRACKS[i % TRACKS.length]}')`, animationDuration: `${18 + (i % 5) * 4}s`, animationDelay: `${-i * 3.3}s` } as React.CSSProperties}>{e}</span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- avatars
export const AVATAR_EMOJI = ["🏃", "🏋️", "🚴", "🧘", "🤸", "🏊", "🥊", "⚡", "🔥", "🦁", "🐯", "🦅", "🐺", "🌟", "🚀", "💪"];
export const AVATAR_COLORS = ["#34f5a0", "#26e0ff", "#4cc9ff", "#b388ff", "#ff5fa2", "#ffb020", "#ff7a45", "#ff4d6d"];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

export function Avatar({ name, emoji, color, size = 36, className }: { name?: string | null; emoji?: string | null; color?: string | null; size?: number; className?: string }) {
  const c = color || AVATAR_COLORS[Math.abs(hash(name || "?")) % AVATAR_COLORS.length];
  const initials = (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <span className={cx("inline-grid shrink-0 place-items-center rounded-full font-semibold text-black", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 55%, white))`, fontSize: emoji ? size * 0.52 : size * 0.38 }}>
      {emoji || initials}
    </span>
  );
}
