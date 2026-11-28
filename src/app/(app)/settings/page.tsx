"use client";
import { Bell, BellOff, Download, FlaskConical, LogOut, Moon, Plus, Shield, Sun, Trash2, Monitor, AlarmClock, CalendarDays } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut, useSession } from "@/lib/auth";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { loadDemoData } from "@/lib/demo";
import { gcalAvailable } from "@/lib/gcal";
import { download } from "@/lib/ics";
import { useProfile } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { clearDemoData, suggestTargets } from "@/lib/templates";
import type { Profile, Reminder, ScoreKey, TableName } from "@/lib/types";
import { notify } from "@/components/reminders";
import { SamsungImportCard } from "@/components/samsung-import";
import { Badge, Button, Card, Chip, Confirm, cx, Field, IconButton, Input, PageHeader, Section, Segmented, Select, Sheet, Stepper, Toggle, useAction, useToast } from "@/components/ui";

const EXPORT_TABLES: TableName[] = ["profiles", "goals", "workout_plans", "plan_exercises", "workouts", "workout_sets", "exercises", "foods", "food_favorites", "recipes", "recipe_ingredients", "meals", "nutrition_logs", "meal_plan_entries", "hydration_logs", "activity_logs", "sleep_logs", "recovery_logs", "habits", "habit_logs", "calendar_events", "body_measurements", "progress_photos", "reminders", "transformation_programs", "ai_messages"];

export default function SettingsPage() {
  const { profile, update } = useProfile();
  const act = useAction();
  const toast = useToast();
  const router = useRouter();
  const { session } = useSession();
  const [p, setP] = useState<Profile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [demoConfirm, setDemoConfirm] = useState<null | "load" | "clear">(null);
  useEffect(() => { if (profile && !p) setP(profile); }, [profile, p]);
  if (!p || !profile) return null;
  const set = (patch: Partial<Profile>) => setP({ ...p, ...patch });
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  const save = () => act(async () => { const { id: _i, ...rest } = p; void _i; await update(rest); }, "Settings saved");
  const sug = p.weight_kg && p.height_cm && p.age ? suggestTargets({ weight_kg: p.weight_kg, height_cm: p.height_cm, age: p.age, sex: p.sex || "male", fitness_goal: p.fitness_goal, goal_weight_kg: p.goal_weight_kg }) : null;
  const weights = p.score_weights;
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);

  const exportData = async () => {
    setBusy("export");
    try {
      const out: Record<string, unknown> = { exported_at: new Date().toISOString(), app: "Forge" };
      for (const t of EXPORT_TABLES) {
        let q = supabase.from(t).select("*").limit(50000);
        if (t === "exercises" || t === "foods") q = q.not("user_id", "is", null);
        const { data, error } = await q; if (error) throw error; out[t] = data;
      }
      download(`forge-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), "application/json");
      toast("Export downloaded");
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
    setBusy(null);
  };
  const deleteAccount = async () => {
    setBusy("delete");
    try {
      const uid = session!.user.id;
      const { data: files } = await supabase.storage.from("progress-photos").list(uid, { limit: 1000 });
      if (files?.length) await supabase.storage.from("progress-photos").remove(files.map((f) => `${uid}/${f.name}`));
      const { error } = await supabase.rpc("delete_my_account");
      if (error) throw error;
      await signOut();
      router.replace("/login");
    } catch (e) { toast((e as Error).message, { tone: "bad" }); setBusy(null); }
  };

  return (
    <div className="anim-rise pb-20">
      <PageHeader title="Settings" sub={session?.user.email} action={dirty && <Button variant="good" onClick={save}>Save changes</Button>} />

      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <span className={cx("grid size-10 place-items-center rounded-xl", p.role === "admin" ? "bg-bad-soft text-bad" : p.role === "coach" ? "bg-info/15 text-info" : "bg-card-2 text-muted")}><Shield className="size-5" /></span>
        <div className="min-w-0 flex-1 text-sm"><div className="font-medium">Your role: <span className="capitalize">{p.role ?? "user"}</span></div><div className="text-muted">{p.role === "admin" ? "You can switch anyone between user, coach and admin, and coach users." : p.role === "coach" ? "You can send events to users, see their daily progress and remind them." : "An admin can make you a coach."}</div></div>
        <div className="flex gap-2">
          {(p.role === "coach" || p.role === "admin") && <Link href="/coach"><Button size="sm">Coach page</Button></Link>}
          {p.role === "admin" && <Link href="/admin"><Button size="sm" variant="good">Manage roles</Button></Link>}
        </div>
      </Card>

      <Section title="Profile">
        <Card className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Name"><Input value={p.name ?? ""} onChange={(e) => set({ name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age"><Input inputMode="numeric" value={p.age ?? ""} onChange={(e) => set({ age: Number(e.target.value) || null })} /></Field>
            <Field label="Sex (for estimates)"><Select value={p.sex ?? ""} onChange={(e) => set({ sex: e.target.value })}><option value="male">Male</option><option value="female">Female</option><option value="other">Prefer not to say</option></Select></Field>
          </div>
          <Field label="Height (cm)"><Input inputMode="decimal" value={p.height_cm ?? ""} onChange={(e) => set({ height_cm: Number(e.target.value) || null })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current weight (kg)"><Input inputMode="decimal" value={p.weight_kg ?? ""} onChange={(e) => set({ weight_kg: Number(e.target.value) || null })} /></Field>
            <Field label="Goal weight (kg)"><Input inputMode="decimal" value={p.goal_weight_kg ?? ""} onChange={(e) => set({ goal_weight_kg: Number(e.target.value) || null })} /></Field>
          </div>
          <Field label="Fitness goal"><Select value={p.fitness_goal} onChange={(e) => set({ fitness_goal: e.target.value })}><option value="fat_loss">Lose fat</option><option value="recomposition">Recomposition</option><option value="muscle_gain">Build muscle</option><option value="maintenance">Maintain</option><option value="endurance">Endurance</option></Select></Field>
          <Field label="Training experience"><Select value={p.experience} onChange={(e) => set({ experience: e.target.value })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select></Field>
          <Field label="Workout days"><div className="flex flex-wrap gap-1.5">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => <Chip key={d} active={p.workout_days.includes(i)} onClick={() => set({ workout_days: p.workout_days.includes(i) ? p.workout_days.filter((x) => x !== i) : [...p.workout_days, i].sort() })}>{d}</Chip>)}</div></Field>
          <Field label="Preferred workout time"><Input type="time" value={p.preferred_workout_time.slice(0, 5)} onChange={(e) => set({ preferred_workout_time: e.target.value })} /></Field>
          <Field label="Dietary preferences" className="sm:col-span-2"><div className="flex flex-wrap gap-1.5">{["vegetarian", "vegan", "eggetarian", "pescatarian", "high-protein", "low-carb", "dairy-free", "gluten-free", "halal", "jain"].map((d) => <Chip key={d} active={p.dietary_prefs.includes(d)} onClick={() => set({ dietary_prefs: p.dietary_prefs.includes(d) ? p.dietary_prefs.filter((x) => x !== d) : [...p.dietary_prefs, d] })}>{d}</Chip>)}</div></Field>
        </Card>
      </Section>

      <Section title="Daily targets" action={sug && <Button size="sm" variant="ghost" onClick={() => set({ calorie_target: sug.calorie_target, protein_target: sug.protein_target, carbs_target: sug.carbs_target, fat_target: sug.fat_target, fiber_target: sug.fiber_target, water_target_ml: sug.water_target_ml })}>Use estimate ({sug.calorie_target} kcal)</Button>}>
        <Card className="p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stepper label="Calories" unit="kcal" value={p.calorie_target} step={50} onChange={(v) => set({ calorie_target: v })} />
            <Stepper label="Protein" unit="g" value={p.protein_target} step={5} onChange={(v) => set({ protein_target: v })} />
            <Stepper label="Carbs" unit="g" value={p.carbs_target} step={5} onChange={(v) => set({ carbs_target: v })} />
            <Stepper label="Fat" unit="g" value={p.fat_target} step={5} onChange={(v) => set({ fat_target: v })} />
            <Stepper label="Fiber" unit="g" value={p.fiber_target} step={1} onChange={(v) => set({ fiber_target: v })} />
            <Stepper label="Rest-day kcal adjust" value={p.rest_day_calorie_delta} min={-1000} max={1000} step={50} onChange={(v) => set({ rest_day_calorie_delta: v })} />
            <Stepper label="Water" unit="ml" value={p.water_target_ml} step={250} onChange={(v) => set({ water_target_ml: v })} />
            <Stepper label="Walking" unit="km" value={Number(p.walk_target_km)} step={0.5} onChange={(v) => set({ walk_target_km: v })} />
            <Stepper label="Steps" value={p.steps_target} step={500} max={50000} onChange={(v) => set({ steps_target: v })} />
            <Stepper label="Sleep" unit="h" value={Number(p.sleep_target_hours)} step={0.5} max={12} onChange={(v) => set({ sleep_target_hours: v })} />
            <Field label="Target bedtime"><Input type="time" value={p.bedtime_target.slice(0, 5)} onChange={(e) => set({ bedtime_target: e.target.value })} /></Field>
          </div>
          <p className="mt-3 text-xs text-faint">Macro calories: {p.protein_target * 4 + p.carbs_target * 4 + p.fat_target * 9} kcal vs {p.calorie_target} kcal target.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-bg-2 p-3">
            <div className="flex items-center gap-2 text-sm"><Toggle checked={p.fasting_enabled} onChange={(v) => set({ fasting_enabled: v })} />Intermittent fasting</div>
            {p.fasting_enabled && <div className="flex items-center gap-2 text-sm text-muted">Eating window <Input type="time" className="w-28 py-1.5" value={p.eating_window_start.slice(0, 5)} onChange={(e) => set({ eating_window_start: e.target.value })} />–<Input type="time" className="w-28 py-1.5" value={p.eating_window_end.slice(0, 5)} onChange={(e) => set({ eating_window_end: e.target.value })} /></div>}
          </div>
        </Card>
      </Section>

      <Section title="Fitness score weights">
        <Card className="p-4 sm:p-5">
          <p className="mb-3 text-sm text-muted">How much each target counts toward your daily and weekly score. Set to 0 to exclude.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(Object.keys(weights) as ScoreKey[]).map((k) => <Stepper key={k} label={`${k[0].toUpperCase() + k.slice(1)} · ${totalW ? Math.round((weights[k] / totalW) * 100) : 0}%`} value={weights[k]} step={5} max={100} onChange={(v) => set({ score_weights: { ...weights, [k]: v } })} />)}</div>
        </Card>
      </Section>

      <Section title="Units, time & appearance">
        <Card className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Weight"><Segmented value={p.unit_weight} onChange={(v) => set({ unit_weight: v })} options={[{ value: "kg", label: "kg" }, { value: "lbs", label: "lbs" }]} /></Field>
          <Field label="Length"><Segmented value={p.unit_length} onChange={(v) => set({ unit_length: v })} options={[{ value: "cm", label: "cm" }, { value: "in", label: "in" }]} /></Field>
          <Field label="Volume"><Segmented value={p.unit_volume} onChange={(v) => set({ unit_volume: v })} options={[{ value: "ml", label: "ml" }, { value: "l", label: "litres" }, { value: "oz", label: "oz" }]} /></Field>
          <Field label="Theme"><Segmented value={p.theme} onChange={(v) => set({ theme: v })} options={[{ value: "dark", label: <span className="flex items-center gap-1"><Moon className="size-3.5" />Dark</span> }, { value: "light", label: <span className="flex items-center gap-1"><Sun className="size-3.5" />Light</span> }, { value: "system", label: <span className="flex items-center gap-1"><Monitor className="size-3.5" />Auto</span> }]} /></Field>
          <Field label="Time zone" hint="Used by the assistant and reports. Days follow this device's clock."><Select value={p.timezone} onChange={(e) => set({ timezone: e.target.value })}>{(Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone").map((z) => <option key={z}>{z}</option>) ?? <option>{p.timezone}</option>}</Select></Field>
        </Card>
      </Section>

      <Notifications p={p} set={set} />

      <Section title="Connected devices">
        <SamsungImportCard />
      </Section>

      <Section title="Calendar integration">
        <Card className="flex items-center gap-3 p-4 sm:p-5"><CalendarDays className="size-5 text-info" /><div className="flex-1 text-sm"><div className="font-medium">Google Calendar</div><div className="text-muted">{gcalAvailable ? "Available — import or send events from Calendar → Sync." : "Not configured on this deployment. iCal import/export works today."}</div></div><Badge tone={gcalAvailable ? "good" : "neutral"}>{gcalAvailable ? "Ready" : "Off"}</Badge></Card>
      </Section>

      <Section title="Demo data">
        <Card id="demo" className="p-4 sm:p-5">
          <div className="flex items-start gap-3"><FlaskConical className="mt-0.5 size-5 text-warm" /><div className="flex-1 text-sm text-muted">Demo rows are flagged in the database and labelled &ldquo;Demo&rdquo; everywhere. Clearing removes only demo rows — your own logs are never touched.</div></div>
          <div className="mt-3 flex gap-2"><Button onClick={() => setDemoConfirm("load")} loading={busy === "demo"}>Load 4 weeks of demo data</Button><Button variant="danger" onClick={() => setDemoConfirm("clear")} loading={busy === "clear"}>Clear demo data</Button></div>
        </Card>
      </Section>

      <Section title="Privacy & account">
        <Card className="divide-y divide-line">
          <div className="flex items-center gap-3 p-4"><Shield className="size-5 text-good" /><div className="flex-1 text-sm text-muted">Every table is protected by row-level security — only your signed-in account can read or write your rows. Photos are in a private bucket served by expiring links. No API keys are exposed to the browser.</div></div>
          <div className="flex items-center gap-3 p-4"><Download className="size-5 text-muted" /><div className="flex-1 text-sm"><div className="font-medium">Export my data</div><div className="text-muted">All your rows as JSON.</div></div><Button size="sm" onClick={exportData} loading={busy === "export"}>Export</Button></div>
          <div className="flex items-center gap-3 p-4"><LogOut className="size-5 text-muted" /><div className="flex-1 text-sm font-medium">Sign out</div><Button size="sm" onClick={async () => { await signOut(); router.replace("/login"); }}>Sign out</Button></div>
          <div className="flex items-center gap-3 p-4"><Trash2 className="size-5 text-bad" /><div className="flex-1 text-sm"><div className="font-medium">Delete account</div><div className="text-muted">Permanently deletes your account, all logs and photos.</div></div><Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button></div>
        </Card>
      </Section>

      {dirty && <div className="safe-b fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 lg:bottom-6 lg:left-64"><Button variant="good" size="lg" className="shadow-2xl" onClick={save}>Save changes</Button></div>}

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete your account?" footer={<Button variant="danger" className="w-full" disabled={deleteText !== "DELETE"} loading={busy === "delete"} onClick={deleteAccount}>Permanently delete everything</Button>}>
        <p className="text-sm text-muted">This removes your profile, every workout, meal, log, habit, event and photo. It cannot be undone. Consider exporting first.</p>
        <Field label='Type "DELETE" to confirm' className="mt-4"><Input value={deleteText} onChange={(e) => setDeleteText(e.target.value)} /></Field>
      </Sheet>
      <Confirm open={demoConfirm === "load"} onClose={() => setDemoConfirm(null)} title="Load demo data?" body="Adds a demo PPL split, 4 weeks of sample logs, habits, a demo program and calendar blocks. All flagged as demo." confirmLabel="Load demo" danger={false} onConfirm={async () => { setBusy("demo"); await act(() => loadDemoData(profile), "Demo data loaded"); setBusy(null); }} />
      <Confirm open={demoConfirm === "clear"} onClose={() => setDemoConfirm(null)} title="Clear all demo data?" body="Only rows flagged as demo are deleted." confirmLabel="Clear demo" onConfirm={async () => { setBusy("clear"); await act(() => clearDemoData(), "Demo data cleared"); setBusy(null); }} />
    </div>
  );
}

function Notifications({ p, set }: { p: Profile; set: (x: Partial<Profile>) => void }) {
  const act = useAction();
  const toast = useToast();
  const rem = useRows<Reminder>({ table: "reminders", order: [["time", true]] });
  const [perm, setPerm] = useState<string>("default");
  const [adding, setAdding] = useState(false);
  const [n, setN] = useState({ label: "", time: "09:00", interval: "", start: "08:00", end: "21:00" });
  useEffect(() => { if (typeof Notification !== "undefined") setPerm(Notification.permission); }, []);
  const ns = p.notification_settings;
  const enable = async () => {
    if (typeof Notification === "undefined") return toast("This browser doesn't support notifications", { tone: "bad" });
    const r = await Notification.requestPermission(); setPerm(r);
    if (r === "granted") { set({ notification_settings: { ...ns, enabled: true } }); notify("Notifications on", "Forge will remind you — but never more than your hourly limit."); }
    else toast("Permission denied in browser settings", { tone: "bad" });
  };
  return (
    <Section title="Notifications & reminders">
      <Card id="reminders" className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          {ns.enabled && perm === "granted" ? <Bell className="size-5 text-good" /> : <BellOff className="size-5 text-faint" />}
          <div className="flex-1 text-sm"><div className="font-medium">{ns.enabled && perm === "granted" ? "Notifications on" : "Notifications off"}</div><div className="text-muted">Delivered while Forge is open or installed as an app. Remember to save.</div></div>
          {perm !== "granted" ? <Button size="sm" variant="good" onClick={enable}>Enable</Button> : <Toggle checked={ns.enabled} onChange={(v) => set({ notification_settings: { ...ns, enabled: v } })} />}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Field label="Quiet from"><Input type="time" value={ns.quiet_start} onChange={(e) => set({ notification_settings: { ...ns, quiet_start: e.target.value } })} /></Field>
          <Field label="Quiet until"><Input type="time" value={ns.quiet_end} onChange={(e) => set({ notification_settings: { ...ns, quiet_end: e.target.value } })} /></Field>
          <Field label="Max per hour"><Select value={ns.max_per_hour} onChange={(e) => set({ notification_settings: { ...ns, max_per_hour: Number(e.target.value) } })}>{[1, 2, 3, 4, 6].map((x) => <option key={x}>{x}</option>)}</Select></Field>
        </div>
        <div className="mt-4 divide-y divide-line rounded-2xl border border-line">
          {rem.rows.map((r) => (
            <div key={r.id} className={cx("flex flex-wrap items-center gap-2 px-3 py-2.5", !r.enabled && "opacity-60")}>
              <AlarmClock className="size-4 text-faint" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{r.label}</div><div className="num text-xs text-faint">{r.interval_minutes ? `every ${r.interval_minutes} min, ${r.window_start?.slice(0, 5)}–${r.window_end?.slice(0, 5)}` : r.time?.slice(0, 5)}{r.snoozed_until && new Date(r.snoozed_until) > new Date() ? ` · snoozed until ${new Date(r.snoozed_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</div></div>
              {r.interval_minutes ? <Select className="h-8 w-24 py-0 text-xs" value={r.interval_minutes} onChange={(e) => act(() => updateById("reminders", r.id, { interval_minutes: Number(e.target.value) }))}>{[45, 60, 90, 120, 180].map((x) => <option key={x} value={x}>{x} min</option>)}</Select>
                : <input type="time" defaultValue={r.time?.slice(0, 5)} onBlur={(e) => act(() => updateById("reminders", r.id, { time: e.target.value }))} className="num h-8 rounded-lg bg-bg-2 px-2 text-xs outline-none" />}
              <Button size="sm" variant="ghost" onClick={() => act(() => updateById("reminders", r.id, { snoozed_until: new Date(Date.now() + 3600_000).toISOString() }), "Snoozed for 1 hour")}>Snooze</Button>
              <Toggle checked={r.enabled} onChange={(v) => act(() => updateById("reminders", r.id, { enabled: v }))} />
              <IconButton label="Delete" onClick={() => act(() => deleteById("reminders", r.id))}><Trash2 className="size-4" /></IconButton>
            </div>
          ))}
          {!rem.rows.length && <div className="p-4 text-sm text-muted">No reminders.</div>}
        </div>
        <Button className="mt-3" size="sm" onClick={() => setAdding(true)} icon={<Plus className="size-4" />}>Add reminder</Button>
      </Card>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New reminder" footer={<Button variant="good" className="w-full" disabled={!n.label.trim()} onClick={() => act(async () => { await insertRows("reminders", n.interval ? { type: "custom", label: n.label, interval_minutes: Number(n.interval), window_start: n.start, window_end: n.end } : { type: "custom", label: n.label, time: n.time }); setAdding(false); }, "Reminder added")}>Add</Button>}>
        <div className="space-y-3">
          <Field label="Label"><Input value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} placeholder="Take creatine" /></Field>
          <Field label="Repeat"><Select value={n.interval} onChange={(e) => setN({ ...n, interval: e.target.value })}><option value="">Once a day at a time</option><option value="60">Every hour</option><option value="90">Every 90 min</option><option value="120">Every 2 hours</option><option value="180">Every 3 hours</option></Select></Field>
          {n.interval ? <div className="grid grid-cols-2 gap-3"><Field label="From"><Input type="time" value={n.start} onChange={(e) => setN({ ...n, start: e.target.value })} /></Field><Field label="Until"><Input type="time" value={n.end} onChange={(e) => setN({ ...n, end: e.target.value })} /></Field></div>
            : <Field label="Time"><Input type="time" value={n.time} onChange={(e) => setN({ ...n, time: e.target.value })} /></Field>}
        </div>
      </Sheet>
    </Section>
  );
}

