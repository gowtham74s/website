"use client";
import type { SleepLog } from "@/lib/types";
import { fmtMin } from "@/lib/units";
import { cx } from "./ui";

export const SLEEP_COLORS = { deep: "#6366f1", light: "#60a5fa", rem: "#22d3ee", awake: "#f59e0b" } as const;
const STAGE_LABEL = { deep: "Deep", light: "Light", rem: "REM", awake: "Awake" } as const;
export const hasStages = (s: SleepLog) => s.deep_min != null || s.light_min != null || s.rem_min != null;

/** Horizontal stacked bar of one night's stages with a legend. */
export function StageBar({ s, compact }: { s: SleepLog; compact?: boolean }) {
  const parts = (["deep", "light", "rem", "awake"] as const).map((k) => ({ k, m: Number(s[`${k}_min`] ?? 0) }));
  const total = parts.reduce((a, p) => a + p.m, 0);
  if (!total) return null;
  return (
    <div>
      <div className={cx("flex w-full overflow-hidden rounded-full", compact ? "h-1.5" : "h-3")} role="img" aria-label={parts.map((p) => `${STAGE_LABEL[p.k]} ${p.m} min`).join(", ")}>
        {parts.filter((p) => p.m > 0).map((p) => <div key={p.k} style={{ width: `${(p.m / total) * 100}%`, background: SLEEP_COLORS[p.k] }} className="h-full border-r-2 border-card last:border-r-0" />)}
      </div>
      {!compact && (
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {parts.map((p) => (
            <div key={p.k}>
              <div className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: SLEEP_COLORS[p.k] }} />{STAGE_LABEL[p.k]}</div>
              <div className="num text-sm font-semibold">{fmtMin(p.m)} <span className="text-xs font-normal text-faint">{Math.round((p.m / total) * 100)}%</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

