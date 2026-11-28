"use client";
// Thin wrappers around Recharts so every chart shares one look: recessive grid, single y-axis,
// 2px lines, rounded bar ends, a hover tooltip, and theme-aware colours.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReactNode } from "react";

type Row = Record<string, string | number | boolean | null | undefined>;

function Tip({ active, payload, label, unit, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; unit?: string; fmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-2 bg-card-2 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 text-faint">{fmt ? fmt(String(label)) : label}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="num flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: p.color }} /><span className="text-muted">{p.name}</span><span className="ml-auto font-semibold text-fg">{Math.round(Number(p.value) * 10) / 10}{unit ? ` ${unit}` : ""}</span></div>
      ))}
    </div>
  );
}

const axis = { tickLine: false, axisLine: false, tick: { fill: "var(--faint)", fontSize: 11 } } as const;
export const shortDate = (k: string) => { const [, m, d] = k.split("-").map(Number); return `${d}/${m}`; };
export const longDate = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(k) ? new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : k);

export function ChartFrame({ title, sub, right, children, height = 200 }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; height?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      {(title || right) && <div className="mb-3 flex items-start justify-between gap-2"><div><div className="text-[13px] font-medium text-muted">{title}</div>{sub && <div className="num mt-0.5 text-xl font-semibold">{sub}</div>}</div>{right}</div>}
      <div style={{ height }}>{children}</div>
    </div>
  );
}

export function BarSeries({ data, x, y, name, color = "var(--good)", unit, target, colorFn, xFmt = shortDate }: { data: Row[]; x: string; y: string; name: string; color?: string; unit?: string; target?: number; colorFn?: (r: Row) => string; xFmt?: (v: string) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 4, left: -6, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis dataKey={x} {...axis} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...axis} width={40} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))} />
        <Tooltip cursor={{ fill: "var(--card-2)" }} content={<Tip unit={unit} fmt={longDate} />} />
        {target != null && <ReferenceLine y={target} stroke="var(--faint)" strokeDasharray="4 4" />}
        <Bar dataKey={y} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28}>
          {colorFn && data.map((r, i) => <Cell key={i} fill={colorFn(r)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeries({ data, x, lines, unit, target, area, xFmt = shortDate, domain, gaps }: { data: Row[]; x: string; lines: { key: string; name: string; color: string; dashed?: boolean; dot?: boolean }[]; unit?: string; target?: number; area?: boolean; xFmt?: (v: string) => string; domain?: [number | string, number | string]; gaps?: boolean }) {
  const C = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <C data={data} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
        <defs>{lines.map((l) => <linearGradient key={l.key} id={`g-${l.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={l.color} stopOpacity={0.25} /><stop offset="1" stopColor={l.color} stopOpacity={0} /></linearGradient>)}</defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={18} />
        <YAxis {...axis} width={40} domain={domain ?? ["auto", "auto"]} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10))} />
        <Tooltip cursor={{ stroke: "var(--line-2)" }} content={<Tip unit={unit} fmt={longDate} />} />
        {target != null && <ReferenceLine y={target} stroke="var(--faint)" strokeDasharray="4 4" />}
        {lines.map((l) => area
          ? <Area key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} fill={`url(#g-${l.key})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={!gaps} />
          : <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? "4 4" : undefined} dot={l.dot || gaps ? { r: 2.5, strokeWidth: 0, fill: l.color } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={!gaps} />)}
      </C>
    </ResponsiveContainer>
  );
}

/** Stacked bars (e.g. sleep stages per night). A 1px surface-coloured stroke separates segments. */
export function StackSeries({ data, x, series, unit, xFmt = shortDate, target }: { data: Row[]; x: string; series: { key: string; name: string; color: string }[]; unit?: string; xFmt?: (v: string) => string; target?: number }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 6, right: 4, left: -6, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={14} />
        <YAxis {...axis} width={40} tickFormatter={(v: number) => String(Math.round(v * 10) / 10)} />
        <Tooltip cursor={{ fill: "var(--card-2)" }} content={<Tip unit={unit} fmt={longDate} />} />
        {target != null && <ReferenceLine y={target} stroke="var(--faint)" strokeDasharray="4 4" />}
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={1} maxBarSize={28} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily range band (min–max) with a line on top (e.g. heart rate: range + resting). */
export function RangeSeries({ data, x, lo, hi, line, lineName, color, unit, xFmt = shortDate }: { data: Row[]; x: string; lo: string; hi: string; line: string; lineName: string; color: string; unit?: string; xFmt?: (v: string) => string }) {
  const rows = data.map((r) => ({ ...r, __range: r[lo] != null && r[hi] != null ? [Number(r[lo]), Number(r[hi])] : null }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 6, right: 6, left: -6, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey={x} {...axis} tickFormatter={xFmt} interval="preserveStartEnd" minTickGap={18} />
        <YAxis {...axis} width={40} domain={["auto", "auto"]} />
        <Tooltip cursor={{ stroke: "var(--line-2)" }} content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const r = payload[0].payload as Row;
          return (
            <div className="rounded-xl border border-line-2 bg-card-2 px-3 py-2 text-xs shadow-xl">
              <div className="mb-1 text-faint">{longDate(String(label))}</div>
              {r[line] != null && <div className="num"><span className="text-muted">{lineName}</span> <b className="text-fg">{String(r[line])}{unit ? ` ${unit}` : ""}</b></div>}
              {r[lo] != null && <div className="num"><span className="text-muted">Range</span> <b className="text-fg">{String(r[lo])}–{String(r[hi])}{unit ? ` ${unit}` : ""}</b></div>}
            </div>
          );
        }} />
        <Area type="monotone" dataKey="__range" stroke="none" fill={color} fillOpacity={0.15} connectNulls={false} isAnimationActive={false} />
        <Line type="monotone" dataKey={line} name={lineName} stroke={color} strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0, fill: color }} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {items.map((i) => <span key={i.label} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />{i.label}</span>)}
    </div>
  );
}

/** GitHub-style heatmap: rows = weeks, cells = days. value 0..1 or null (not scheduled). */
export function Heatmap({ days, color = "var(--good)", label }: { days: { date: string; value: number | null }[]; color?: string; label?: (d: { date: string; value: number | null }) => string }) {
  if (!days.length) return null;
  const first = new Date(`${days[0].date}T12:00:00`).getDay();
  const lead = (first + 6) % 7; // Monday-first
  const cells: ({ date: string; value: number | null } | null)[] = [...Array(lead).fill(null), ...days];
  const cols = Math.ceil(cells.length / 7);
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="grid w-max grid-flow-col gap-[3px]" style={{ gridTemplateRows: "repeat(7, 14px)", gridTemplateColumns: `repeat(${cols}, 14px)` }}>
        {cells.map((c, i) => c ? (
          <div key={i} title={label ? label(c) : `${c.date}`} className="rounded-[3px]"
            style={{ background: c.value == null ? "transparent" : c.value === 0 ? "var(--ring-track)" : color, opacity: c.value == null ? 1 : c.value === 0 ? 1 : 0.35 + c.value * 0.65, outline: c.value == null ? "1px dashed var(--line)" : undefined, outlineOffset: -1 }} />
        ) : <div key={i} />)}
      </div>
    </div>
  );
}
