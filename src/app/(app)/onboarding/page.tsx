"use client";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { insertRows } from "@/lib/data";
import { loadDemoData } from "@/lib/demo";
import { useProfile } from "@/lib/hooks";
import { createHabits, createProgram, createSplit, defaultReminders, STARTER_HABITS, suggestTargets, type SplitKind } from "@/lib/templates";
import type { Profile } from "@/lib/types";
import { Button, Chip, cx, Field, Input, Segmented, Select, Stepper, Toggle, useToast } from "@/components/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { profile, update } = useProfile();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Partial<Profile>>({});
  const [split, setSplit] = useState<SplitKind | "none">("ppl");
  const [habits, setHabits] = useState<string[]>(STARTER_HABITS.slice(0, 5).map((h) => h.name));
  const [program, setProgram] = useState(true);
  const [programDays, setProgramDays] = useState(75);
  const [demo, setDemo] = useState(false);
  useEffect(() => { if (profile && !Object.keys(f).length) setF({ ...profile, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, age: profile.age ?? 28, height_cm: profile.height_cm ?? 175, weight_kg: profile.weight_kg ?? 78, goal_weight_kg: profile.goal_weight_kg ?? 72, sex: profile.sex ?? "male" }); }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!profile || !f.id) return null;
  const set = (p: Partial<Profile>) => setF({ ...f, ...p });
  const sug = suggestTargets({ weight_kg: Number(f.weight_kg), height_cm: Number(f.height_cm), age: Number(f.age), sex: f.sex || "male", fitness_goal: f.fitness_goal || "recomposition", goal_weight_kg: f.goal_weight_kg });
  const applySuggestions = () => set({ calorie_target: sug.calorie_target, protein_target: sug.protein_target, carbs_target: sug.carbs_target, fat_target: sug.fat_target, fiber_target: sug.fiber_target, water_target_ml: sug.water_target_ml });

  const finish = async () => {
    setBusy(true);
    try {
      const { id: _id, ...rest } = f as Profile; void _id;
      await update({ ...rest, onboarded: true });
      if (demo) await loadDemoData({ ...profile, ...f } as Profile);
      else {
        if (split !== "none") await createSplit(split);
        if (habits.length) await createHabits(habits);
        if (program) await createProgram(`${programDays}-Day Transformation`, programDays);
      }
      await insertRows("reminders", defaultReminders(f as Profile));
      toast("You're all set");
      router.replace("/");
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
    setBusy(false);
  };

  const steps = [
    { title: "About you", body: (
      <div className="space-y-4">
        <Field label="Name"><Input value={f.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age"><Input inputMode="numeric" value={f.age ?? ""} onChange={(e) => set({ age: Number(e.target.value) || null })} /></Field>
          <Field label="Sex (for estimates)"><Select value={f.sex ?? "male"} onChange={(e) => set({ sex: e.target.value })}><option value="male">Male</option><option value="female">Female</option><option value="other">Prefer not to say</option></Select></Field>
          <Field label="Height (cm)"><Input inputMode="decimal" value={f.height_cm ?? ""} onChange={(e) => set({ height_cm: Number(e.target.value) || null })} /></Field>
          <Field label="Weight (kg)"><Input inputMode="decimal" value={f.weight_kg ?? ""} onChange={(e) => set({ weight_kg: Number(e.target.value) || null })} /></Field>
          <Field label="Goal weight (kg)"><Input inputMode="decimal" value={f.goal_weight_kg ?? ""} onChange={(e) => set({ goal_weight_kg: Number(e.target.value) || null })} /></Field>
          <Field label="Units"><Select value={f.unit_weight} onChange={(e) => set({ unit_weight: e.target.value as "kg", unit_length: e.target.value === "lbs" ? "in" : "cm" })}><option value="kg">Metric (kg, cm)</option><option value="lbs">Imperial (lbs, in)</option></Select></Field>
        </div>
        <p className="text-xs text-faint">Enter metric values here; you can display everything in imperial later. Your data stays private to your account.</p>
      </div>
    ) },
    { title: "Training", body: (
      <div className="space-y-5">
        <Field label="Primary goal"><div className="flex flex-wrap gap-1.5">{[["fat_loss", "Lose fat"], ["recomposition", "Recomposition"], ["muscle_gain", "Build muscle"], ["maintenance", "Maintain"], ["endurance", "Endurance"]].map(([v, l]) => <Chip key={v} active={f.fitness_goal === v} onClick={() => set({ fitness_goal: v })}>{l}</Chip>)}</div></Field>
        <Field label="Experience"><Segmented value={(f.experience ?? "intermediate") as string} onChange={(v) => set({ experience: v })} options={[{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]} /></Field>
        <Field label="Workout days"><div className="flex gap-1.5">{DAYS.map((d, i) => <Chip key={d} active={f.workout_days?.includes(i)} onClick={() => set({ workout_days: f.workout_days?.includes(i) ? f.workout_days.filter((x) => x !== i) : [...(f.workout_days || []), i].sort() })}>{d}</Chip>)}</div></Field>
        <Field label="Preferred workout time"><Input type="time" value={(f.preferred_workout_time ?? "18:00").slice(0, 5)} onChange={(e) => set({ preferred_workout_time: e.target.value })} /></Field>
        <Field label="Starter workout split" hint="Creates editable plans with exercises. You can change everything later.">
          <div className="grid grid-cols-2 gap-2">{([["ppl", "Push / Pull / Legs", "6 days"], ["upper_lower", "Upper / Lower", "4 days"], ["full_body", "Full body", "3 days"], ["bro", "Body-part split", "4 days"], ["none", "I'll build my own", ""]] as const).map(([v, l, s]) => (
            <button key={v} onClick={() => setSplit(v)} className={cx("rounded-2xl border p-3 text-left transition", split === v ? "border-good bg-good-soft" : "border-line bg-bg-2")}><div className="text-sm font-medium">{l}</div><div className="text-xs text-faint">{s}</div></button>
          ))}</div>
        </Field>
      </div>
    ) },
    { title: "Daily targets", body: (
      <div className="space-y-4">
        <div className="rounded-2xl border border-good/30 bg-good-soft p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-good"><Sparkles className="size-4" />Suggested from your stats</div>
          <p className="mt-1 text-muted">Estimated maintenance ≈ <b className="num text-fg">{sug.tdee}</b> kcal/day (Mifflin–St Jeor, moderately active). Suggested: <b className="num text-fg">{sug.calorie_target} kcal · {sug.protein_target}g protein</b>. These are estimates — adjust to your experience.</p>
          <Button size="sm" className="mt-3" onClick={applySuggestions}>Use suggestions</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Calories" unit="kcal" value={f.calorie_target ?? 0} step={50} onChange={(v) => set({ calorie_target: v })} />
          <Stepper label="Protein" unit="g" value={f.protein_target ?? 0} step={5} onChange={(v) => set({ protein_target: v })} />
          <Stepper label="Carbs" unit="g" value={f.carbs_target ?? 0} step={5} onChange={(v) => set({ carbs_target: v })} />
          <Stepper label="Fat" unit="g" value={f.fat_target ?? 0} step={5} onChange={(v) => set({ fat_target: v })} />
          <Stepper label="Water" unit="ml" value={f.water_target_ml ?? 0} step={250} onChange={(v) => set({ water_target_ml: v })} />
          <Stepper label="Walking" unit="km" value={Number(f.walk_target_km ?? 0)} step={0.5} onChange={(v) => set({ walk_target_km: v })} />
          <Stepper label="Sleep" unit="h" value={Number(f.sleep_target_hours ?? 0)} step={0.5} max={12} onChange={(v) => set({ sleep_target_hours: v })} />
          <Field label="Target bedtime"><Input type="time" value={(f.bedtime_target ?? "23:00").slice(0, 5)} onChange={(e) => set({ bedtime_target: e.target.value })} /></Field>
        </div>
      </div>
    ) },
    { title: "Habits & program", body: (
      <div className="space-y-5">
        <Field label="Daily habits to track">
          <div className="flex flex-wrap gap-1.5">{STARTER_HABITS.map((h) => <Chip key={h.name} active={habits.includes(h.name)} onClick={() => setHabits(habits.includes(h.name) ? habits.filter((x) => x !== h.name) : [...habits, h.name])}>{h.name}</Chip>)}</div>
        </Field>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-bg-2 p-4">
          <div><div className="font-medium">Start a transformation program</div><div className="text-sm text-muted">Day counter, daily objectives, streaks and milestones.</div></div>
          <Toggle checked={program} onChange={setProgram} />
        </div>
        {program && <div className="flex gap-1.5">{[30, 60, 75, 90].map((d) => <Chip key={d} active={programDays === d} onClick={() => setProgramDays(d)}>{d} days</Chip>)}</div>}
        <div className="flex items-center justify-between rounded-2xl border border-warm/30 bg-warm-soft p-4">
          <div><div className="font-medium">Explore with demo data instead</div><div className="text-sm text-muted">Loads 4 weeks of sample history, clearly labelled as demo. Remove it any time in Settings.</div></div>
          <Toggle checked={demo} onChange={setDemo} />
        </div>
      </div>
    ) },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-8">
      <div className="mb-8 flex items-center gap-3"><img src="/icons/icon.svg" alt="" className="size-9 rounded-xl" /><div className="flex flex-1 gap-1.5">{steps.map((_, i) => <div key={i} className={cx("h-1 flex-1 rounded-full transition", i <= step ? "bg-good" : "bg-line")} />)}</div></div>
      <h1 className="font-display mb-1 text-3xl font-semibold tracking-tight">{steps[step].title}</h1>
      <p className="mb-6 text-sm text-muted">Step {step + 1} of {steps.length}</p>
      <div className="anim-rise flex-1" key={step}>{steps[step].body}</div>
      <div className="safe-b sticky bottom-0 mt-8 flex gap-3 bg-bg py-4">
        {step > 0 && <Button size="lg" onClick={() => setStep(step - 1)} icon={<ArrowLeft className="size-4" />}>Back</Button>}
        {step < steps.length - 1
          ? <Button size="lg" variant="primary" className="flex-1" onClick={() => setStep(step + 1)}>Continue<ArrowRight className="size-4" /></Button>
          : <Button size="lg" variant="good" className="flex-1" loading={busy} onClick={finish} icon={<Check className="size-4" />}>Finish setup</Button>}
      </div>
    </div>
  );
}
