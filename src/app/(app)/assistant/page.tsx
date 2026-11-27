"use client";
import { ArrowUp, Bot, Check, Lightbulb, Sparkles, Trash2, X, CalendarPlus, Utensils, Dumbbell, Target } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dailyTargets, isTrainingDay, planForDay, scaleFood, sumMacros } from "@/lib/calc";
import { deleteRows, insertRows, queryClient, updateById, useRows } from "@/lib/data";
import { today, useProfile, useRange } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import type { AiMessage, Exercise, Food, Meal, MealCategory, PlanExercise, WorkoutPlan } from "@/lib/types";
import { Badge, Button, Card, cx, PageHeader, Spinner, Textarea, useAction, useToast } from "@/components/ui";

type P = { kind: string; summary?: string; status?: string; [k: string]: unknown };

const PROMPTS = ["What should I eat for the rest of today?", "Plan today's workout around how I feel", "Review my last week honestly", "Where am I missing protein?", "Build me a schedule for tomorrow", "Am I progressing on my main lifts?"];

/** Minimal, safe markdown: paragraphs, **bold**, bullet & numbered lists, headings. */
function Md({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i}>{x.slice(2, -2)}</strong> : <Fragment key={i}>{x}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (list) { const L = list.ordered ? "ol" : "ul"; blocks.push(<L key={blocks.length} className={cx("my-2 space-y-1 pl-5", list.ordered ? "list-decimal" : "list-disc")}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</L>); list = null; } };
  for (const line of text.split("\n")) {
    const b = line.match(/^\s*[-*•]\s+(.*)/), n = line.match(/^\s*\d+[.)]\s+(.*)/), h = line.match(/^#{1,4}\s+(.*)/);
    if (b || n) { const ordered = !!n; if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; } list.items.push((b || n)![1]); continue; }
    flush();
    if (h) blocks.push(<div key={blocks.length} className="mb-1 mt-3 font-semibold">{inline(h[1])}</div>);
    else if (line.trim()) blocks.push(<p key={blocks.length} className="my-1.5">{inline(line)}</p>);
  }
  flush();
  return <div className="text-[15px] leading-relaxed">{blocks}</div>;
}

export default function AssistantPage() {
  const toast = useToast();
  const act = useAction();
  const { profile, update } = useProfile();
  const msgs = useRows<AiMessage>({ table: "ai_messages", order: [["created_at", true]], limit: 200 });
  const plans = useRows<WorkoutPlan>({ table: "workout_plans", filters: [["archived", "eq", false]] });
  const pe = useRows<PlanExercise>({ table: "plan_exercises" });
  const ex = useRows<Exercise>({ table: "exercises" });
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.rows.length, pending]);

  const send = async (text: string) => {
    const m = text.trim(); if (!m || pending) return;
    setInput(""); setPending(m);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token}` }, body: JSON.stringify({ message: m, today: today(), tzOffset: new Date().getTimezoneOffset() }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 503 && j.error === "not_configured") setNotConfigured(true);
      else if (!r.ok) toast(j.error || "Assistant unavailable", { tone: "bad" });
      await queryClient.invalidateQueries({ queryKey: ["rows", "ai_messages"] });
    } catch { toast("You're offline — the assistant needs a connection. Quick insights below still work.", { tone: "bad" }); }
    setPending(null);
  };

  const setStatus = (msg: AiMessage, idx: number, status: "applied" | "dismissed") => updateById("ai_messages", msg.id, { proposals: (msg.proposals as unknown as P[]).map((p, i) => (i === idx ? { ...p, status } : p)) });
  const apply = (msg: AiMessage, idx: number) => act(async () => {
    const p = (msg.proposals as unknown as P[])[idx];
    if (p.kind === "calendar_event") {
      if (!p.start_at || !p.end_at) throw new Error("Proposal is missing a time");
      await insertRows("calendar_events", { title: p.title ?? "Event", type: p.event_type ?? "other", start_at: new Date(String(p.start_at)).toISOString(), end_at: new Date(String(p.end_at)).toISOString(), notes: p.notes ?? null, source: "ai" });
    } else if (p.kind === "log_food") {
      await insertRows("nutrition_logs", { date: today(), meal_category: (p.meal_category as MealCategory) ?? "snack", name: p.name ?? "Food", quantity: 1, unit: "serving", calories: Number(p.calories) || 0, protein: Number(p.protein) || 0, carbs: Number(p.carbs) || 0, fat: Number(p.fat) || 0, fiber: Number(p.fiber) || 0, logged_at: new Date().toISOString() });
    } else if (p.kind === "plan_exercise_change") {
      const plan = plans.rows.find((x) => x.name.toLowerCase() === String(p.plan_name).toLowerCase());
      const e = ex.rows.find((x) => x.name.toLowerCase() === String(p.exercise_name).toLowerCase());
      const row = plan && e && pe.rows.find((x) => x.plan_id === plan.id && x.exercise_id === e.id);
      if (!row) throw new Error(`Couldn't find ${p.exercise_name} in ${p.plan_name}`);
      await updateById("plan_exercises", row.id, { ...(p.sets != null && { sets: p.sets }), ...(p.reps != null && { reps: p.reps }), ...(p.weight != null && { weight: p.weight }) });
    } else if (p.kind === "target_change") {
      if (!p.field || p.value == null) throw new Error("Incomplete proposal");
      await update({ [String(p.field)]: Number(p.value) });
    }
    await setStatus(msg, idx, "applied");
  }, "Applied");

  const icon = (k: string) => k === "calendar_event" ? <CalendarPlus className="size-4" /> : k === "log_food" ? <Utensils className="size-4" /> : k === "plan_exercise_change" ? <Dumbbell className="size-4" /> : <Target className="size-4" />;

  return (
    <div className="anim-rise flex min-h-[calc(100dvh-180px)] flex-col">
      <PageHeader title="Assistant" sub="Answers from your logged data. Suggestions only change things when you confirm." action={msgs.rows.length > 0 && <Button size="sm" variant="ghost" onClick={() => act(() => deleteRows("ai_messages", { role: "user" }).then(() => deleteRows("ai_messages", { role: "assistant" })), "Conversation cleared")} icon={<Trash2 className="size-4" />}>Clear</Button>} />
      <QuickInsights />
      {notConfigured && <Card className="mb-4 border-warm/30 bg-warm-soft p-4 text-sm"><div className="font-semibold text-warm">AI isn&apos;t configured on this deployment</div><p className="mt-1 text-muted">Set <code className="rounded bg-bg-2 px-1">ANTHROPIC_API_KEY</code> on the server (never in the browser) to enable conversational coaching. Quick insights above are computed locally from your data and always work.</p></Card>}
      <div className="flex-1 space-y-4">
        {!msgs.rows.length && !pending && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-good-soft text-good"><Sparkles className="size-6" /></div>
            <p className="mb-4 text-sm text-muted">Ask about meals, training, recovery, your week, or your schedule.</p>
            <div className="mx-auto flex max-w-xl flex-wrap justify-center gap-2">{PROMPTS.map((q) => <button key={q} onClick={() => send(q)} className="rounded-full border border-line bg-card px-3.5 py-2 text-sm text-muted transition hover:border-line-2 hover:text-fg">{q}</button>)}</div>
          </div>
        )}
        {msgs.rows.map((m) => m.role === "user" ? (
          <div key={m.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[15px] text-bg">{m.content}</div></div>
        ) : (
          <div key={m.id} className="flex gap-3">
            <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-good-soft text-good"><Bot className="size-4" /></div>
            <div className="min-w-0 max-w-[90%] flex-1">
              <Card className="rounded-tl-md px-4 py-3"><Md text={m.content} /></Card>
              {(m.proposals as unknown as P[] | null)?.map((p, i) => (
                <div key={i} className={cx("mt-2 flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5", p.status === "applied" ? "border-good/30 bg-good-soft" : p.status === "dismissed" ? "border-line opacity-50" : "border-line-2 bg-card-2")}>
                  <span className="text-muted">{icon(p.kind)}</span>
                  <span className="min-w-0 flex-1 text-sm">{String(p.summary ?? p.kind)}</span>
                  {p.status ? <Badge tone={p.status === "applied" ? "good" : "neutral"}>{p.status}</Badge> : <>
                    <Button size="sm" variant="good" onClick={() => apply(m, i)} icon={<Check className="size-3.5" />}>Apply</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(() => setStatus(m, i, "dismissed"))} icon={<X className="size-3.5" />}>Dismiss</Button>
                  </>}
                </div>
              ))}
            </div>
          </div>
        ))}
        {pending && <>
          <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-fg px-4 py-2.5 text-[15px] text-bg">{pending}</div></div>
          <div className="flex items-center gap-3 text-sm text-muted"><div className="grid size-8 place-items-center rounded-xl bg-good-soft text-good"><Bot className="size-4" /></div><Spinner className="size-4" />Reading your data…</div>
        </>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="sticky bottom-24 mt-4 lg:bottom-4">
        <div className="flex items-end gap-2 rounded-2xl border border-line-2 bg-card p-2 shadow-2xl">
          <Textarea rows={1} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} placeholder="Ask your coach…" className="max-h-40 border-0 bg-transparent focus:ring-0" />
          <button type="submit" aria-label="Send" disabled={!input.trim() || !!pending} className="grid size-10 shrink-0 place-items-center rounded-xl bg-good text-black transition active:scale-90 disabled:opacity-40"><ArrowUp className="size-5" /></button>
        </div>
        {profile && <p className="mt-1.5 text-center text-[11px] text-faint">Not medical advice. The assistant sees only your own data.</p>}
      </form>
    </div>
  );
}

/** Deterministic, offline-capable insights computed from today's logs. */
function QuickInsights() {
  const { profile } = useProfile();
  const t = today();
  const d = useRange(t, t);
  const foods = useRows<Food>({ table: "foods" });
  const meals = useRows<Meal>({ table: "meals" });
  const tips = useMemo(() => {
    if (!profile) return [];
    const training = isTrainingDay(profile, d.plans, t);
    const tg = dailyTargets(profile, training);
    const eaten = sumMacros(d.nutrition);
    const remCal = tg.calories - eaten.calories, remP = tg.protein - eaten.protein;
    const out: string[] = [];
    if (remP > 10) {
      const fit = meals.rows.map((m) => ({ name: m.name, ...sumMacros(m.items) })).filter((m) => m.calories <= remCal + 50).sort((a, b) => b.protein / Math.max(1, b.calories) - a.protein / Math.max(1, a.calories)).slice(0, 2);
      const fd = foods.rows.filter((f) => f.protein / Math.max(1, f.calories) > 0.09).map((f) => ({ f, m: scaleFood(f, f.serving_size) })).filter((x) => x.m.calories <= Math.max(150, remCal)).sort((a, b) => b.m.protein - a.m.protein).slice(0, 3);
      out.push(`${Math.round(remP)} g protein and ${Math.max(0, remCal)} kcal left today.${fit.length ? ` Saved meals that fit: ${fit.map((m) => `${m.name} (${m.protein} g P, ${m.calories} kcal)`).join(", ")}.` : ""}${fd.length ? ` High-protein options: ${fd.map((x) => `${x.f.name} (${x.m.protein} g P / ${x.m.calories} kcal per ${x.f.serving_size}${x.f.serving_unit})`).join(", ")}.` : ""}`);
    } else if (remCal < -tg.calories * 0.1) out.push(`You're ${-remCal} kcal over today's target. No need to compensate tomorrow — just get back to plan.`);
    else if (d.nutrition.length) out.push("Protein is covered for today. Nice.");
    const water = d.hydration.reduce((a, h) => a + h.amount_ml, 0);
    if (water < tg.water) out.push(`${((tg.water - water) / 1000).toFixed(1)} L of water to go.`);
    const plan = planForDay(d.plans, t);
    if (plan && !d.workouts.some((w) => w.status === "completed")) out.push(`${plan.name} is scheduled today.`);
    if (!d.sleep.length) out.push("Last night's sleep isn't logged yet.");
    return out;
  }, [profile, d, foods.rows, meals.rows, t]);
  if (!tips.length) return null;
  return (
    <Card className="mb-5 p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-muted"><Lightbulb className="size-4 text-warm" />Quick insights · from your logs</div>
      <ul className="space-y-1.5 text-sm">{tips.map((x, i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-faint" />{x}</li>)}</ul>
    </Card>
  );
}
