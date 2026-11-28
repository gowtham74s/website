"use client";
import { Activity, BedDouble, CalendarDays, Check, ChevronRight, Droplets, Dumbbell, Flame, Footprints, HeartPulse, ListChecks, Play, Sparkles, Utensils, AlertTriangle, FlaskConical } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { activeCalories, addDays, expandEvents, findConflicts, habitScheduled, habitStreaks, planForDay, programDay, readiness, remaining, sleepConsistency, totalSteps, walkDistance, objectivesMet } from "@/lib/calc";
import { useRows } from "@/lib/data";
import { dayData, today, useActiveProgram, useEvents, useProfile, useRange, useScores, useVitals } from "@/lib/hooks";
import type { PlanExercise, RecoveryLog } from "@/lib/types";
import { fmtMin, vol } from "@/lib/units";
import { startWorkout } from "@/lib/workout";
import { Badge, Bar, Button, Card, CardHeader, cx, MacroBar, Metric, Ring, Skeleton, useAction } from "@/components/ui";
import { ActivitySheet, CheckInSheet, FoodLogSheet, SleepSheet, toggleHabit, useAddWater } from "@/components/loggers";
import { EVENT_COLORS } from "@/components/event-colors";

function greeting() { const h = new Date().getHours(); return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

export default function Dashboard() {
  const router = useRouter();
  const act = useAction();
  const t = today();
  const from = addDays(t, -13);
  const { profile } = useProfile();
  const data = useRange(from, t);
  const scores = useScores(profile, data, from, t);
  const program = useActiveProgram();
  const addWater = useAddWater();
  const [sheet, setSheet] = useState<null | "food" | "walk" | "sleep" | "checkin">(null);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const events = useEvents(todayStart.toISOString(), todayEnd.toISOString());
  const recovery = useRows<RecoveryLog>({ table: "recovery_logs", filters: [["date", "eq", t]] });
  const vitals = useVitals(addDays(t, -2), t);
  const vit = [...vitals.rows].reverse().find((v) => v.resting_hr != null || v.stress_avg != null);
  const plan = planForDay(data.plans, t);
  const planEx = useRows<PlanExercise>({ table: "plan_exercises", filters: [["plan_id", "eq", plan?.id ?? "-"]] }, !!plan);

  const todayScore = scores[scores.length - 1];
  const d = dayData(data, t);
  const occ = useMemo(() => expandEvents(events.rows, t, t), [events.rows, t]);
  const conflicts = findConflicts(occ);
  const upcoming = occ.filter((o) => o.end > new Date()).slice(0, 4);
  const lastSleep = d.sleep ?? data.sleep.find((s) => s.date === addDays(t, -0));
  const sleepH = lastSleep ? lastSleep.duration_min / 60 : null;
  const ready = readiness(recovery.rows[0], sleepH, profile?.sleep_target_hours ?? 8);
  const habitsToday = data.habits.filter((h) => habitScheduled(h, t));
  const workoutToday = d.workouts.find((w) => w.status === "completed") ?? d.workouts.find((w) => w.status !== "skipped");
  const prog = program ? programDay(program, t) : null;
  const isDemo = program?.is_demo || data.workouts.some((w) => w.is_demo);
  const week = scores.slice(-7);
  const weekAvg = week.length ? Math.round(week.reduce((a, s) => a + s.score.score, 0) / week.length) : 0;
  const progStreak = useMemo(() => {
    if (!program) return 0;
    let n = 0;
    for (let i = scores.length - 2; i >= 0; i--) { if (scores[i].date < program.start_date) break; if (objectivesMet(scores[i].score.parts, program.daily_objectives).all) n++; else break; }
    return n;
  }, [scores, program]);

  if (!profile || (data.loading && !todayScore)) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-56" /><div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div></div>;

  const s = todayScore.score;
  const tg = s.targets, tot = s.totals;
  const pending = s.parts.filter((p) => p.applicable && !p.achieved);
  const message = (() => {
    const h = new Date().getHours();
    if (s.score >= 90) return "Everything's on track. Protect tonight's sleep and the day is done.";
    const protGap = tg.protein - tot.protein;
    if (h >= 16 && protGap > 30) return `${Math.round(protGap)} g protein still to go — plan it into dinner rather than chasing it late.`;
    if (h >= 14 && tot.water < tg.water * 0.4) return `Water is behind (${vol(tot.water, profile)} so far). Two glasses now makes the evening easier.`;
    if (plan && !workoutToday && h < 20) return `${plan.name} is on the plan today. Start it when you get to the gym — weights are pre-filled from last time.`;
    if (ready?.status === "recovery") return "Your check-in suggests a recovery day. A walk and an early night count.";
    if (pending.length) return `${pending.length} target${pending.length > 1 ? "s" : ""} left today: ${pending.slice(0, 3).map((p) => p.label.toLowerCase()).join(", ")}.`;
    return "Small, consistent days compound. Log as you go.";
  })();

  const onStart = () => act(async () => {
    if (workoutToday && workoutToday.status !== "completed") return router.push(`/workout/session/${workoutToday.id}`);
    const w = await startWorkout({ planId: plan?.id, name: plan?.name ?? "Workout" });
    router.push(`/workout/session/${w.id}`);
  });

  return (
    <div className="anim-rise">
      {isDemo && (
        <Link href="/settings#demo" className="mb-4 flex items-center gap-2 rounded-2xl border border-warm/30 bg-warm-soft px-4 py-2.5 text-sm text-warm"><FlaskConical className="size-4" />Demo data is loaded — clearly sample history, not yours. Manage in Settings.</Link>
      )}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="font-display text-[28px] font-semibold tracking-tight sm:text-3xl">{greeting()}{profile.name ? `, ${profile.name.split(" ")[0]}` : ""}</h1>
        </div>
        {program && prog && (
          <Link href="/progress?tab=program" className="flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm">
            <Flame className="size-4 text-warm" /><span className="num font-semibold">Day {prog.day}</span><span className="text-faint">of {program.duration_days}</span>
            {program.status === "paused" && <Badge tone="warm">Paused</Badge>}
          </Link>
        )}
      </div>

      {/* hero score */}
      <Card className="hero-grad mb-4 overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="flex items-center gap-5">
            <Ring value={s.score / 100} size={132} stroke={12}>
              <div><div className="num font-display text-4xl font-semibold tracking-tight">{s.score}</div><div className="-mt-0.5 text-[11px] uppercase tracking-wider text-faint">Today</div></div>
            </Ring>
            <div className="min-w-0 sm:hidden"><StatusLine score={s.score} weekAvg={weekAvg} streak={progStreak} hasProgram={!!program} /></div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="hidden sm:block"><StatusLine score={s.score} weekAvg={weekAvg} streak={progStreak} hasProgram={!!program} /></div>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{message}</p>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
              {s.parts.map((p) => (
                <div key={p.key} title={p.detail} className={cx("rounded-xl border px-2 py-2 text-center", !p.applicable ? "border-line/50 opacity-40" : p.achieved ? "border-good/30 bg-good-soft" : "border-line bg-bg-2/60")}>
                  <div className={cx("mx-auto mb-1 grid size-5 place-items-center rounded-full", p.achieved ? "bg-good text-black" : "bg-[var(--ring-track)]")}>{p.achieved ? <Check className="size-3" strokeWidth={3} /> : <span className="num text-[9px] text-muted">{Math.round(p.value * 100)}</span>}</div>
                  <div className="truncate text-[11px] font-medium">{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Workout */}
        <Card className="flex flex-col">
          <CardHeader title="Workout" icon={<Dumbbell className="size-4 text-warm" />} action={<Link href="/workout" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="flex flex-1 flex-col px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            {workoutToday?.status === "completed" ? (
              <div className="flex-1"><div className="flex items-center gap-2 text-xl font-semibold">{workoutToday.name}<Badge tone="good">Done</Badge></div><div className="num mt-1 text-sm text-muted">{fmtMin(Math.round((workoutToday.duration_seconds || 0) / 60))} · {Math.round(Number(workoutToday.total_volume)).toLocaleString()} kg volume</div></div>
            ) : plan ? (
              <div className="flex-1"><div className="text-xl font-semibold">{plan.name}</div><div className="num mt-1 text-sm text-muted">{plan.split_type.replace("_", " ")} · {planEx.rows.length} exercises · ~{plan.estimated_minutes} min</div>{workoutToday && <Badge tone="warm" className="mt-2">In progress</Badge>}</div>
            ) : (
              <div className="flex-1"><div className="text-xl font-semibold">Rest day</div><div className="mt-1 text-sm text-muted">Nothing scheduled. Recovery is part of the plan.</div></div>
            )}
            {workoutToday?.status !== "completed" && <Button variant="warm" size="lg" className="mt-4 w-full" onClick={onStart} icon={<Play className="size-4" />}>{workoutToday ? "Resume workout" : plan ? "Start workout" : "Start a session anyway"}</Button>}
          </div>
        </Card>

        {/* Nutrition */}
        <Card>
          <CardHeader title="Nutrition" icon={<Utensils className="size-4 text-good" />} action={<Link href="/nutrition" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="flex items-center gap-4 px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            <Ring value={tg.calories ? tot.calories / tg.calories : 0} size={104} stroke={9} color={tot.calories > tg.calories * 1.1 ? "var(--bad)" : undefined}>
              <div><div className="num text-xl font-semibold">{remaining(tg.calories, tot.calories)}</div><div className="text-[10px] uppercase tracking-wide text-faint">kcal left</div></div>
            </Ring>
            <div className="min-w-0 flex-1 space-y-2">
              <MacroBar label="Protein" value={tot.protein} target={tg.protein} color="var(--good)" />
              <MacroBar label="Carbs" value={tot.carbs} target={tg.carbs} color="var(--warm)" />
              <MacroBar label="Fat" value={tot.fat} target={tg.fat} color="var(--violet)" />
              <MacroBar label="Fiber" value={tot.fiber} target={tg.fiber} color="var(--cyan)" />
            </div>
          </div>
          <div className="px-4 pb-4 sm:px-5"><Button className="w-full" onClick={() => setSheet("food")} icon={<Utensils className="size-4" />}>Log food</Button></div>
        </Card>

        {/* Hydration */}
        <Card>
          <CardHeader title="Hydration" icon={<Droplets className="size-4 text-cyan" />} action={<Link href="/hydration" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="flex items-center gap-4 px-4 pb-3 pt-2 sm:px-5">
            <Ring value={tg.water ? tot.water / tg.water : 0} size={104} stroke={9} color="var(--cyan)">
              <div><div className="num text-xl font-semibold">{(tot.water / 1000).toFixed(1)}</div><div className="text-[10px] uppercase tracking-wide text-faint">of {(tg.water / 1000).toFixed(1)} L</div></div>
            </Ring>
            <div className="min-w-0 flex-1"><Metric label="Remaining" value={vol(remaining(tg.water, tot.water), profile)} /><div className="mt-1 text-xs text-faint">{d.hydration.length} entries today</div></div>
          </div>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
            {[250, 500, 750].map((ml) => <Button key={ml} onClick={() => addWater(ml)} className="num">+{ml}</Button>)}
          </div>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader title="Activity" icon={<Footprints className="size-4 text-info" />} action={<Link href="/activity" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            <div className="flex items-baseline gap-1.5"><span className="num font-display text-4xl font-semibold">{tot.walk}</span><span className="text-sm text-faint">/ {tg.walkKm} km</span></div>
            <Bar value={tg.walkKm ? tot.walk / tg.walkKm : 0} color="var(--info)" className="mt-3" height={8} />
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Metric label="Steps" value={totalSteps(d.activity).toLocaleString()} />
              <Metric label="Remaining" value={remaining(tg.walkKm, tot.walk)} unit="km" />
              <Metric label="Active" value={activeCalories(d.activity, profile.weight_kg, profile.height_cm).active} unit="kcal" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2"><Button onClick={() => router.push("/activity?walk=1")} icon={<Play className="size-4" />}>Start walk</Button><Button onClick={() => setSheet("walk")}>Log manually</Button></div>
          </div>
        </Card>

        {/* Sleep */}
        <Card>
          <CardHeader title="Sleep" icon={<BedDouble className="size-4 text-violet" />} action={<Link href="/sleep" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            {lastSleep ? (
              <>
                <div className="flex items-baseline gap-1.5"><span className="num font-display text-4xl font-semibold">{fmtMin(lastSleep.duration_min)}</span><span className="text-sm text-faint">target {tg.sleepH}h</span></div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Metric label={lastSleep.score != null ? "Sleep score" : "Quality"} value={lastSleep.score != null ? lastSleep.score : lastSleep.quality ? `${lastSleep.quality}/5` : "—"} />
                  <Metric label="vs target" value={`${sleepH! >= tg.sleepH ? "+" : ""}${(sleepH! - tg.sleepH).toFixed(1)}`} unit="h" tone={sleepH! >= tg.sleepH - 0.25 ? "good" : "warm"} />
                  <Metric label="Consistency" value={sleepConsistency(data.sleep.slice(-7)) ?? "—"} unit={data.sleep.length > 1 ? "/100" : ""} />
                </div>
              </>
            ) : <div className="py-3 text-sm text-muted">Last night isn&apos;t logged yet.</div>}
            <Button className="mt-4 w-full" onClick={() => setSheet("sleep")}>{lastSleep ? "Edit last night" : "Log last night"}</Button>
          </div>
        </Card>

        {/* Recovery */}
        <Card>
          <CardHeader title="Recovery" icon={<HeartPulse className="size-4 text-bad" />} />
          <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            {ready ? (
              <>
                <div className="flex items-center gap-3">
                  <div className={cx("num grid size-14 place-items-center rounded-2xl text-xl font-semibold", ready.status === "normal" ? "bg-good-soft text-good" : ready.status === "lighter" ? "bg-warm-soft text-warm" : "bg-bad-soft text-bad")}>{ready.score}</div>
                  <div><div className="font-semibold">{ready.label}</div><div className="text-xs text-faint">Readiness from today&apos;s check-in{sleepH != null ? " + sleep" : ""}</div></div>
                </div>
                <p className="mt-3 text-sm text-muted">{ready.advice}</p>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                  {(["energy", "soreness", "stress", "motivation"] as const).map((k) => <div key={k} className="rounded-lg bg-bg-2 py-1.5"><div className="num text-sm font-semibold">{recovery.rows[0]?.[k] ?? "—"}</div><div className="capitalize text-faint">{k}</div></div>)}
                </div>
              </>
            ) : <p className="py-2 text-sm text-muted">A 30-second check-in tells you whether to train normally, lighter, or recover today.</p>}
            {vit && <Link href="/vitals" className="mt-3 flex items-center justify-between rounded-xl bg-bg-2 px-3 py-2 text-xs text-muted"><span>Watch · {vit.date === t ? "today" : new Date(`${vit.date}T12:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span><span className="num">{vit.resting_hr != null && <>♥ resting <b className="text-fg">{vit.resting_hr}</b> bpm</>}{vit.stress_avg != null && <> · stress <b className="text-fg">{vit.stress_avg}</b></>}</span></Link>}
            <Button className="mt-4 w-full" onClick={() => setSheet("checkin")} icon={<Activity className="size-4" />}>{ready ? "Update check-in" : "Daily check-in"}</Button>
          </div>
        </Card>

        {/* Calendar */}
        <Card className="md:col-span-1">
          <CardHeader title="Today's schedule" icon={<CalendarDays className="size-4 text-info" />} action={<Link href="/calendar?view=day" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="px-4 pb-4 pt-2 sm:px-5 sm:pb-5">
            {conflicts.length > 0 && <div className="mb-2 flex items-center gap-2 rounded-xl bg-warm-soft px-3 py-2 text-xs text-warm"><AlertTriangle className="size-3.5" />{conflicts.length} overlapping event{conflicts.length > 1 ? "s" : ""} today</div>}
            {upcoming.length ? (
              <ul className="space-y-2">
                {upcoming.map((o) => (
                  <li key={o.event.id + o.date} className="flex items-center gap-3">
                    <span className="h-9 w-1 rounded-full" style={{ background: EVENT_COLORS[o.event.type] }} />
                    <div className="min-w-0 flex-1"><div className={cx("truncate text-sm font-medium", o.completed && "text-faint line-through")}>{o.event.title}</div><div className="num text-xs text-faint">{o.event.all_day ? "All day" : `${o.start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${o.end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</div></div>
                  </li>
                ))}
              </ul>
            ) : <p className="py-2 text-sm text-muted">Nothing else scheduled today.</p>}
            <Button className="mt-4 w-full" onClick={() => router.push("/calendar?new=1")}>Add event</Button>
          </div>
        </Card>

        {/* Habits */}
        <Card className="md:col-span-1 xl:col-span-2">
          <CardHeader title="Habits" icon={<ListChecks className="size-4 text-good" />} sub={`${habitsToday.filter((h) => d.habitLogs.some((l) => l.habit_id === h.id)).length} of ${habitsToday.length} done`} action={<Link href="/habits" className="text-faint"><ChevronRight className="size-4" /></Link>} />
          <div className="grid gap-2 px-4 pb-4 pt-3 sm:grid-cols-2 sm:px-5 sm:pb-5">
            {habitsToday.length ? habitsToday.map((h) => {
              const done = d.habitLogs.some((l) => l.habit_id === h.id && l.completed);
              const st = habitStreaks(h, data.habitLogs, t);
              return (
                <button key={h.id} onClick={() => act(() => toggleHabit(h, data.habitLogs, t))} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[.99]", done ? "border-good/30 bg-good-soft" : "border-line bg-bg-2")}>
                  <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2 transition", done ? "anim-pop border-good bg-good text-black" : "border-line-2")}>{done && <Check className="size-3.5" strokeWidth={3} />}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.name}</span>
                  {st.current > 0 && <span className="num flex items-center gap-0.5 text-xs text-warm"><Flame className="size-3" />{st.current}</span>}
                </button>
              );
            }) : <p className="text-sm text-muted">No habits yet. <Link href="/habits" className="text-good">Create one</Link>.</p>}
          </div>
        </Card>
      </div>

      <Link href="/assistant" className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4 transition hover:border-line-2">
        <span className="grid size-10 place-items-center rounded-xl bg-good-soft text-good"><Sparkles className="size-5" /></span>
        <div className="min-w-0 flex-1"><div className="font-medium">Ask your assistant</div><div className="truncate text-sm text-muted">&ldquo;What should I eat to hit protein tonight?&rdquo; — answers from your logged data.</div></div>
        <ChevronRight className="size-4 text-faint" />
      </Link>

      <FoodLogSheet open={sheet === "food"} onClose={() => setSheet(null)} />
      <ActivitySheet open={sheet === "walk"} onClose={() => setSheet(null)} />
      <SleepSheet open={sheet === "sleep"} onClose={() => setSheet(null)} existing={d.sleep} />
      <CheckInSheet open={sheet === "checkin"} onClose={() => setSheet(null)} existing={recovery.rows[0]} />
    </div>
  );
}

function StatusLine({ score, weekAvg, streak, hasProgram }: { score: number; weekAvg: number; streak: number; hasProgram: boolean }) {
  const label = score >= 85 ? "On track" : score >= 60 ? "Making progress" : score >= 30 ? "Behind today" : "Just getting started";
  return (
    <div>
      <div className={cx("text-xl font-semibold tracking-tight", score >= 85 ? "text-good" : score >= 60 ? "text-fg" : "text-warm")}>{label}</div>
      <div className="num mt-0.5 text-sm text-faint">7-day avg {weekAvg}{hasProgram ? ` · ${streak}-day program streak` : ""}</div>
    </div>
  );
}
