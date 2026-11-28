"use client";
import { Activity, Droplet, Footprints, HeartPulse, Info, Upload, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, avg } from "@/lib/calc";
import { today, useVitals } from "@/lib/hooks";
import type { HealthDaily } from "@/lib/types";
import { BarSeries, ChartFrame, Legend, LineSeries, RangeSeries } from "@/components/charts";
import { SamsungImportSheet } from "@/components/samsung-import";
import { Button, Card, Empty, Metric, PageHeader, Section, Segmented } from "@/components/ui";

const stressBand = (v: number) => (v < 34 ? { label: "Low", tone: "good" as const, color: "var(--good)" } : v < 67 ? { label: "Medium", tone: "warm" as const, color: "var(--warm)" } : { label: "High", tone: "bad" as const, color: "var(--bad)" });

export default function VitalsPage() {
  const t = today();
  const [span, setSpan] = useState<"30" | "90" | "365">("30");
  const [importing, setImporting] = useState(false);
  const days = Number(span);
  const from = addDays(t, -(days - 1));
  const all = useVitals(addDays(t, -(days * 2 - 1)), t); // current + previous period for comparison
  const rows = all.rows.filter((r) => r.date >= from);
  const prev = all.rows.filter((r) => r.date < from);
  const series = useMemo(() => {
    const out = [];
    const by = new Map(rows.map((r) => [r.date, r]));
    for (let k = from; k <= t; k = addDays(k, 1)) {
      const r = by.get(k);
      out.push({ date: k, resting: r?.resting_hr ?? null, min: r?.min_hr ?? null, max: r?.max_hr ?? null, avg: r?.avg_hr ?? null, stress: r?.stress_avg ?? null, spo2: r?.spo2_avg != null ? Number(r.spo2_avg) : null, spo2min: r?.spo2_min != null ? Number(r.spo2_min) : null, floors: r?.floors ?? null });
    }
    return out;
  }, [rows, from, t]);

  const latest = (k: keyof HealthDaily) => [...rows].reverse().find((r) => r[k] != null);
  const mean = (list: HealthDaily[], k: keyof HealthDaily) => { const v = list.map((r) => r[k]).filter((x): x is number => x != null).map(Number); return v.length ? Math.round(avg(v)) : null; };
  const rhr = latest("resting_hr"), st = latest("stress_avg"), ox = latest("spo2_avg");
  const rhrAvg = mean(rows, "resting_hr"), rhrPrev = mean(prev, "resting_hr");
  const stressAvg = mean(rows, "stress_avg"), stressPrev = mean(prev, "stress_avg");
  const floorsTotal = rows.reduce((a, r) => a + (r.floors ?? 0), 0);
  const delta = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  const fmtDelta = (d: number | null, unit = "") => (d == null ? "no earlier data" : d === 0 ? "same as previous period" : `${d > 0 ? "+" : ""}${d}${unit} vs previous ${span} days`);
  const day = (k?: string) => (k ? (k === t ? "today" : new Date(`${k}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })) : "");

  return (
    <div className="anim-rise">
      <PageHeader title="Vitals" sub="Heart rate, stress, blood oxygen and floors from your watch." action={<Button size="sm" onClick={() => setImporting(true)} icon={<Upload className="size-4" />}>Import</Button>} />
      {!all.rows.length && !all.isLoading ? (
        <Card><Empty icon={<HeartPulse className="size-5" />} title="No vitals yet" body="Import your Samsung Health export (include the heart_rate, stress, oxygen_saturation and floors files) to see daily heart rate, stress, SpO₂ and floors here." action={<Button variant="good" onClick={() => setImporting(true)} icon={<Upload className="size-4" />}>Import from Samsung Health</Button>} /></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-faint"><HeartPulse className="size-3.5 text-bad" />Resting heart rate</div><Metric label={day(rhr?.date)} value={rhr?.resting_hr ?? "—"} unit={rhr ? "bpm" : ""} sub={`${span}-day avg ${rhrAvg ?? "—"} · ${fmtDelta(delta(rhrAvg, rhrPrev), " bpm")}`} /></Card>
            <Card className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-faint"><Zap className="size-3.5 text-warm" />Stress</div><Metric label={day(st?.date)} value={st?.stress_avg ?? "—"} tone={st?.stress_avg != null ? stressBand(st.stress_avg).tone : undefined} sub={st?.stress_avg != null ? `${stressBand(st.stress_avg).label} · ${span}-day avg ${stressAvg ?? "—"} (${fmtDelta(delta(stressAvg, stressPrev))})` : "no readings"} /></Card>
            <Card className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-faint"><Droplet className="size-3.5 text-cyan" />Blood oxygen</div><Metric label={day(ox?.date)} value={ox?.spo2_avg != null ? `${Number(ox.spo2_avg)}%` : "—"} sub={ox?.spo2_min != null ? `lowest ${Number(ox.spo2_min)}%` : "no readings in period"} /></Card>
            <Card className="p-4"><div className="mb-1 flex items-center gap-1.5 text-xs text-faint"><Footprints className="size-3.5 text-info" />Floors climbed</div><Metric label={`last ${span} days`} value={floorsTotal.toLocaleString()} sub={`avg ${rows.filter((r) => r.floors != null).length ? Math.round(floorsTotal / rows.filter((r) => r.floors != null).length) : 0} / day`} /></Card>
          </div>

          <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold uppercase tracking-wider text-faint">Trends</h2><Segmented size="sm" value={span} onChange={setSpan} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "365", label: "1y" }]} /></div>
          <ChartFrame title={<span className="flex items-center gap-1.5"><HeartPulse className="size-3.5" />Heart rate (bpm)</span>} right={<Legend items={[{ label: "Resting (est.)", color: "var(--bad)" }, { label: "Daily low–high", color: "rgba(239,68,68,.35)" }]} />} height={230}>
            <RangeSeries data={series} x="date" lo="min" hi="max" line="resting" lineName="Resting (est.)" color="var(--bad)" unit="bpm" />
          </ChartFrame>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ChartFrame title={<span className="flex items-center gap-1.5"><Zap className="size-3.5" />Daily stress (0–100)</span>} right={<Legend items={[{ label: "Low", color: "var(--good)" }, { label: "Medium", color: "var(--warm)" }, { label: "High", color: "var(--bad)" }]} />} height={190}>
              <BarSeries data={series} x="date" y="stress" name="Stress" colorFn={(r) => (r.stress != null ? stressBand(Number(r.stress)).color : "var(--muted)")} />
            </ChartFrame>
            <ChartFrame title={<span className="flex items-center gap-1.5"><Droplet className="size-3.5" />Blood oxygen (%)</span>} right={<Legend items={[{ label: "Average", color: "var(--cyan)" }, { label: "Lowest", color: "var(--warm)", dashed: true }]} />} height={190}>
              {rows.some((r) => r.spo2_avg != null) ? <LineSeries gaps data={series} x="date" unit="%" domain={[75, 100]} lines={[{ key: "spo2", name: "Average", color: "var(--cyan)", dot: true }, { key: "spo2min", name: "Lowest", color: "var(--warm)", dashed: true, dot: true }]} /> : <div className="grid h-full place-items-center text-sm text-faint">No SpO₂ readings in this period.</div>}
            </ChartFrame>
          </div>
          <div className="mt-4">
            <ChartFrame title={<span className="flex items-center gap-1.5"><Activity className="size-3.5" />Floors climbed per day</span>} height={170}>
              <BarSeries data={series} x="date" y="floors" name="Floors" color="var(--info)" />
            </ChartFrame>
          </div>
          <Section title="About these numbers" className="mt-6">
            <Card className="flex gap-3 p-4 text-sm text-muted">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1.5">
                <p><b className="text-fg">Resting heart rate</b> is estimated from your watch&apos;s spot readings: the average of each day&apos;s lowest 10%. It&apos;s best for spotting trends (a rising resting HR often means poor recovery, illness or stress), not as an exact value.</p>
                <p><b className="text-fg">Stress</b> is Samsung&apos;s 0–100 score from heart-rate variability; the low / medium / high bands here are approximate.</p>
                <p>This is wellness information from a consumer wearable, not a medical device. See a doctor about anything that worries you.</p>
              </div>
            </Card>
          </Section>
        </>
      )}
      <SamsungImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}
