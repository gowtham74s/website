"use client";
// Import a Samsung Health export (Galaxy Watch / Galaxy Fit data synced to Samsung Health).
// Files are read and parsed entirely in the browser; only the resulting rows are saved to your account.
import { strFromU8, unzipSync } from "fflate";
import { CheckCircle2, FileArchive, Upload, Watch } from "lucide-react";
import { useRef, useState } from "react";
import { addDays, dateKey } from "@/lib/calc";
import { queryClient, uid } from "@/lib/data";
import { isSamsungFile, parseSamsungExport, type SamsungData } from "@/lib/samsung";
import { supabase } from "@/lib/supabase";
import { Button, Card, Metric, Segmented, Sheet, useToast } from "./ui";

const chunk = <T,>(a: T[], n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function readFiles(list: FileList) {
  const out: { name: string; text: string }[] = [];
  const chosen: string[] = [];
  for (const f of Array.from(list)) {
    chosen.push(f.name || "(unnamed file)");
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer());
    const isZip = /\.zip$/i.test(f.name) || (head[0] === 0x50 && head[1] === 0x4b); // "PK" zip signature
    if (isZip) {
      const files = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.csv$/i.test(e.name) });
      for (const [name, data] of Object.entries(files)) out.push({ name, text: strFromU8(data) });
    } else if (f.size < 100 * 1024 * 1024) {
      out.push({ name: f.name, text: await f.text() }); // recognised by content, whatever the name/extension
    }
  }
  return { files: out, chosen };
}

function inRange(d: SamsungData, days: number | null): SamsungData {
  if (!days) return d;
  const from = addDays(dateKey(), -(days - 1));
  return { ...d, steps: d.steps.filter((x) => x.date >= from), exercises: d.exercises.filter((x) => x.date >= from), sleep: d.sleep.filter((x) => x.date >= from), weight: d.weight.filter((x) => x.date >= from), water: d.water.filter((x) => x.date >= from) };
}

export function SamsungImportCard({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="flex items-center gap-3 p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-info/15 text-info"><Watch className="size-5" /></span>
        <div className="min-w-0 flex-1 text-sm"><div className="font-medium">Samsung Health / Galaxy watch</div>{!compact && <div className="text-muted">Import steps, workouts, sleep and weight from a Samsung Health export.</div>}</div>
        <Button size="sm" onClick={() => setOpen(true)} icon={<Upload className="size-4" />}>Import</Button>
      </Card>
      <SamsungImportSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SamsungImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<SamsungData | null>(null);
  const [range, setRange] = useState<"30" | "90" | "365" | "all">("90");
  const [busy, setBusy] = useState<"read" | "save" | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const data = parsed ? inRange(parsed, range === "all" ? null : Number(range)) : null;

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("read"); setResult(null);
    try {
      const { files, chosen } = await readFiles(list);
      const d = parseSamsungExport(files);
      if (!d.files.length) {
        const samsung = files.filter((f) => isSamsungFile(f.name, f.text)).length;
        throw new Error(samsung
          ? `Those files are Samsung Health data, but not the kinds Forge imports (${d.skipped.slice(0, 3).join(", ")}). Include activity.day_summary, calories_burned.details, water_intake, exercise, sleep or weight files.`
          : `No Samsung Health data found in: ${chosen.slice(0, 4).join(", ")}${chosen.length > 4 ? "…" : ""}. Choose the CSV files from Download › Samsung Health (or the export .zip).`);
      }
      setParsed(d);
    } catch (e) { toast((e as Error).message, { tone: "bad" }); setParsed(null); }
    setBusy(null);
  };

  const save = async () => {
    if (!data) return;
    if (!navigator.onLine) return toast("Importing needs an internet connection.", { tone: "bad" });
    setBusy("save");
    try {
      const user_id = uid();
      const dates = (xs: { date: string }[]) => [...new Set(xs.map((x) => x.date))];
      const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; if (error) throw new Error(error.message); };

      // Daily steps & distance — replace earlier Samsung rows for the same days (re-import safe).
      for (const c of chunk(dates(data.steps))) await run(supabase.from("activity_logs").delete().eq("source", "samsung").in("date", c));
      for (const c of chunk(data.steps.map((s) => ({ user_id, date: s.date, type: "walk", steps: s.steps, distance_km: s.distance_km, duration_min: s.active_min, active_calories: s.calories, resting_calories: s.resting_calories, source: "samsung", notes: "Samsung Health daily steps", logged_at: new Date(`${s.date}T23:59:00`).toISOString() }))))
        await run(supabase.from("activity_logs").insert(c));

      // Workouts — replaced the same way.
      for (const c of chunk(dates(data.exercises))) await run(supabase.from("activity_logs").delete().eq("source", "samsung_workout").in("date", c));
      for (const c of chunk(data.exercises.map((e) => ({ user_id, date: e.date, type: e.type, steps: 0, distance_km: e.distance_km, duration_min: e.duration_min, active_calories: e.calories, source: "samsung_workout", notes: e.label, logged_at: e.start }))))
        await run(supabase.from("activity_logs").insert(c));

      // Sleep & weight — only fill days you haven't logged yet (never overwrite your own entries).
      let sleepAdded = 0, weightAdded = 0, waterAdded = 0;
      // Water — skip glasses already imported (matched by timestamp to the second).
      if (data.water.length) {
        const { data: ex, error } = await supabase.from("hydration_logs").select("logged_at").gte("date", data.water[0].date);
        if (error) throw error;
        const have = new Set((ex || []).map((r) => new Date(r.logged_at).toISOString().slice(0, 19)));
        const rows = data.water.filter((w) => !have.has(w.logged_at.slice(0, 19))).map((w) => ({ user_id, ...w }));
        for (const c of chunk(rows)) await run(supabase.from("hydration_logs").insert(c));
        waterAdded = rows.length;
      }
      if (data.sleep.length) {
        const { data: ex, error } = await supabase.from("sleep_logs").select("date").gte("date", data.sleep[0].date);
        if (error) throw error;
        const have = new Set((ex || []).map((r) => r.date));
        const rows = data.sleep.filter((s) => !have.has(s.date)).map((s) => ({ user_id, ...s, notes: "Samsung Health" }));
        for (const c of chunk(rows)) await run(supabase.from("sleep_logs").insert(c));
        sleepAdded = rows.length;
      }
      if (data.weight.length) {
        const { data: ex, error } = await supabase.from("body_measurements").select("date").gte("date", data.weight[0].date);
        if (error) throw error;
        const have = new Set((ex || []).map((r) => r.date));
        const rows = data.weight.filter((w) => !have.has(w.date)).map((w) => ({ user_id, ...w, notes: "Samsung Health" }));
        for (const c of chunk(rows)) await run(supabase.from("body_measurements").insert(c));
        weightAdded = rows.length;
        const latest = data.weight[data.weight.length - 1];
        if (latest.date >= addDays(dateKey(), -7)) await run(supabase.from("profiles").update({ weight_kg: latest.weight_kg }).eq("id", user_id));
      }
      queryClient.invalidateQueries(); // refresh in the background
      const msg = `Imported ${data.steps.length} days of steps & calories, ${data.exercises.length} workouts, ${waterAdded} water entries, ${sleepAdded} nights of sleep and ${weightAdded} weigh-ins.`;
      setResult(msg); toast("Samsung Health data imported");
    } catch (e) { toast(`Import failed: ${(e as Error).message}`, { tone: "bad" }); }
    setBusy(null);
  };

  const close = () => { setParsed(null); setResult(null); onClose(); };

  return (
    <Sheet open={open} onClose={close} title="Import from Samsung Health" footer={data && !result ? <Button variant="good" size="lg" className="w-full" loading={busy === "save"} onClick={save}>Import {range === "all" ? "everything" : `last ${range} days`}</Button> : result ? <Button size="lg" className="w-full" onClick={close}>Done</Button> : undefined}>
      {result ? (
        <div className="py-4 text-center"><CheckCircle2 className="mx-auto mb-3 size-10 text-good" /><p className="text-[15px]">{result}</p><p className="mt-2 text-sm text-muted">See it on the Activity, Sleep and Progress pages. Import again any time — repeated imports don't create duplicates.</p></div>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Make sure your watch has synced to the <b className="text-fg">Samsung Health</b> app.</li>
            <li>In Samsung Health tap <b className="text-fg">☰ / ⋮ → Settings → Download personal data</b> and confirm with your Samsung account.</li>
            <li>It saves a folder (or .zip) to <b className="text-fg">Internal storage → Download → Samsung Health</b>.</li>
            <li>Choose that <b className="text-fg">.zip</b>, or select the <b className="text-fg">.csv files</b> inside the folder, below. You can select all of them — files that aren&apos;t needed are ignored.</li>
          </ol>
          <input ref={input} type="file" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <Button size="lg" className="w-full" loading={busy === "read"} onClick={() => input.current?.click()} icon={<FileArchive className="size-4" />}>{parsed ? "Choose different files" : "Choose export files"}</Button>
          {data && (
            <>
              <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted">Import range</span><Segmented size="sm" value={range} onChange={setRange} options={[{ value: "30", label: "30d" }, { value: "90", label: "90d" }, { value: "365", label: "1y" }, { value: "all", label: "All" }]} /></div>
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-bg-2 p-3">
                <Metric label="Days of steps" value={data.steps.length} sub={data.steps.length ? `${data.steps[0].date} → ${data.steps[data.steps.length - 1].date}` : "none found"} />
                <Metric label="Workouts" value={data.exercises.length} sub={data.exercises.length ? [...new Set(data.exercises.map((e) => e.label))].slice(0, 3).join(", ") : "none found"} />
                <Metric label="Water entries" value={data.water.length} sub={data.water.length ? `${data.water.reduce((a, w) => a + w.amount_ml, 0) / 1000} L total` : "none found"} />
                <Metric label="Active calories" value={data.steps.reduce((a, x) => a + x.calories, 0).toLocaleString()} unit="kcal" sub={data.steps.some((x) => x.resting_calories) ? "+ resting (BMR) per day" : undefined} />
                <Metric label="Nights of sleep" value={data.sleep.length} />
                <Metric label="Weigh-ins" value={data.weight.length} />
              </div>
              {!data.sleep.length && <p className="rounded-xl bg-warm-soft px-3 py-2 text-xs text-warm">No sleep sessions found. Sleep is in the file named <b>com.samsung.shealth.sleep.….csv</b> (not <i>sleep_raw_data</i>, <i>sleep_stage</i> or <i>sleep_combined</i>). Select it too to import sleep.</p>}
              {parsed!.skipped.length > 0 && <details className="text-xs text-faint"><summary className="cursor-pointer">{parsed!.skipped.length} file{parsed!.skipped.length > 1 ? "s" : ""} not used</summary><p className="mt-1 break-all">{parsed!.skipped.join(", ")}</p></details>}
              <p className="text-xs text-faint">Read {parsed!.files.length} file{parsed!.files.length > 1 ? "s" : ""}. Daily walking distance comes from your step totals, so workouts aren&apos;t counted twice. Sleep and weight only fill days you haven&apos;t logged yourself.</p>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
