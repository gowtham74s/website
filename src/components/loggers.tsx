"use client";
// Reusable logging sheets: food, water, weight, habits, activity, sleep, recovery check-in.
import { Check, ChevronLeft, Search, Star, Trash2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { addDays, dateKey, habitScheduled, recipeNutrition, scaleFood, sleepMinutes, sumMacros } from "@/lib/calc";
import { deleteById, deleteRows, insertRows, updateById, upsertRow, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { ActivityType, Food, Habit, HabitLog, Macros, Meal, MealCategory, NutritionLog, Recipe, RecipeIngredient, RecoveryLog, SleepLog } from "@/lib/types";
import { lIn, lUnit, wIn, wUnit } from "@/lib/units";
import { Button, Chip, cx, Empty, Field, Input, Scale, Segmented, Select, Sheet, Stepper, Textarea, useAction, useToast } from "./ui";

export const MEAL_CATS: { value: MealCategory; label: string }[] = [
  { value: "first_meal", label: "First meal" }, { value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" },
  { value: "pre_workout", label: "Pre-workout" }, { value: "post_workout", label: "Post-workout" }, { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snacks" },
];
export const catLabel = (c: string) => MEAL_CATS.find((m) => m.value === c)?.label ?? c;
export function defaultCategory(): MealCategory {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner";
}

// ---------------------------------------------------------------- water
export function useAddWater() {
  const toast = useToast();
  return async (ml: number, date = today()) => {
    try {
      const [row] = await insertRows("hydration_logs", { amount_ml: Math.round(ml), date, logged_at: new Date().toISOString() });
      toast(`+${ml} ml water`, { undo: () => deleteById("hydration_logs", row.id) });
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
}

// ---------------------------------------------------------------- habits
export async function toggleHabit(h: Habit, logs: HabitLog[], date: string) {
  const ex = logs.find((l) => l.habit_id === h.id && l.date === date);
  if (ex) await deleteRows("habit_logs", { habit_id: h.id, date });
  else await upsertRow("habit_logs", { habit_id: h.id, date, completed: true }, "habit_id,date");
  return !ex;
}

export function HabitQuickSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = today();
  const habits = useRows<Habit>({ table: "habits", filters: [["archived", "eq", false]], order: [["position", true]] });
  const logs = useRows<HabitLog>({ table: "habit_logs", filters: [["date", "eq", t]] });
  const list = habits.rows.filter((h) => habitScheduled(h, t));
  const act = useAction();
  return (
    <Sheet open={open} onClose={onClose} title="Today's habits">
      {!list.length ? <Empty title="No habits scheduled today" body="Create habits on the Habits page." /> : (
        <div className="space-y-2">
          {list.map((h) => {
            const done = logs.rows.some((l) => l.habit_id === h.id && l.completed);
            return (
              <button key={h.id} onClick={() => act(() => toggleHabit(h, logs.rows, t))} className={cx("flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition active:scale-[.99]", done ? "border-good/40 bg-good-soft" : "border-line bg-bg-2")}>
                <span className={cx("grid size-7 place-items-center rounded-full border-2", done ? "border-good bg-good text-black" : "border-line-2")}>{done && <Check className="size-4" strokeWidth={3} />}</span>
                <span className={cx("font-medium", done && "text-good")}>{h.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- food logging
type Picked = { kind: "food"; food: Food } | { kind: "recipe"; recipe: Recipe; per: Macros };

export function FoodLogSheet({ open, onClose, date = today(), category }: { open: boolean; onClose: () => void; date?: string; category?: MealCategory }) {
  const toast = useToast();
  const [cat, setCat] = useState<MealCategory>(category ?? defaultCategory());
  const [tab, setTab] = useState<"search" | "favorites" | "meals" | "recipes" | "custom">("search");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const foods = useRows<Food>({ table: "foods", order: [["name", true]] }, open);
  const favs = useRows<{ food_id: string }>({ table: "food_favorites" }, open);
  const meals = useRows<Meal>({ table: "meals", order: [["use_count", false]] }, open);
  const recipes = useRows<Recipe>({ table: "recipes", order: [["name", true]] }, open);
  const ingr = useRows<RecipeIngredient>({ table: "recipe_ingredients" }, open);
  const recent = useRows<NutritionLog>({ table: "nutrition_logs", filters: [["date", "gte", addDays(today(), -21)]], order: [["logged_at", false]], limit: 300 }, open);
  const favSet = new Set(favs.rows.map((f) => f.food_id));
  const foodById = useMemo(() => new Map(foods.rows.map((f) => [f.id, f])), [foods.rows]);

  const recentUnique = useMemo(() => {
    const seen = new Set<string>(); const out: NutritionLog[] = [];
    for (const r of recent.rows) { const k = r.name.toLowerCase(); if (!seen.has(k) && !r.meal_id) { seen.add(k); out.push(r); } if (out.length >= 8) break; }
    return out;
  }, [recent.rows]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const words = s.split(/\s+/);
    return foods.rows.filter((f) => words.every((w) => `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(w))).slice(0, 40);
  }, [q, foods.rows]);

  const close = () => { setPicked(null); setQ(""); setTab("search"); onClose(); };

  const logRows = async (rows: Partial<NutritionLog>[], label: string) => {
    try {
      const ins = await insertRows("nutrition_logs", rows.map((r) => ({ date, meal_category: cat, logged_at: new Date().toISOString(), ...r })));
      toast(`Logged ${label}`, { undo: () => ins.forEach((r) => deleteById("nutrition_logs", r.id)) });
      close();
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };

  const repeatLog = (r: NutritionLog) => logRows([{ name: r.name, quantity: r.quantity, unit: r.unit, food_id: r.food_id, recipe_id: r.recipe_id, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber }], r.name);

  const logMeal = async (m: Meal) => {
    await logRows(m.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, food_id: i.food_id ?? null, meal_id: m.id, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat, fiber: i.fiber })), m.name);
    updateById("meals", m.id, { use_count: (m.use_count || 0) + 1 }).catch(() => {});
  };

  const toggleFav = (f: Food) => favSet.has(f.id) ? deleteRows("food_favorites", { food_id: f.id }) : insertRows("food_favorites", { food_id: f.id });

  const FoodRow = ({ f }: { f: Food }) => (
    <div className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-card-2">
      <button className="min-w-0 flex-1 text-left" onClick={() => setPicked({ kind: "food", food: f })}>
        <div className="truncate text-[15px] font-medium">{f.name}{f.user_id && <span className="ml-1.5 text-[11px] text-faint">custom</span>}</div>
        <div className="num text-xs text-faint">{f.serving_size} {f.serving_unit} · {Math.round(f.calories)} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</div>
      </button>
      <button aria-label={favSet.has(f.id) ? "Unfavorite" : "Favorite"} onClick={() => toggleFav(f)} className="grid size-9 place-items-center text-faint"><Star className={cx("size-4", favSet.has(f.id) && "fill-warm text-warm")} /></button>
      <button aria-label={`Quick add ${f.name}`} onClick={() => logRows([{ name: f.name, food_id: f.id, quantity: f.serving_size, unit: f.serving_unit, ...scaleFood(f, f.serving_size) }], f.name)} className="grid size-9 place-items-center rounded-xl bg-good-soft text-good active:scale-90"><Plus className="size-4" /></button>
    </div>
  );

  return (
    <Sheet open={open} onClose={close} title={picked ? <button className="flex items-center gap-1" onClick={() => setPicked(null)}><ChevronLeft className="size-5" />Back</button> : "Log food"}>
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
        {MEAL_CATS.map((m) => <Chip key={m.value} active={cat === m.value} onClick={() => setCat(m.value)}>{m.label}</Chip>)}
      </div>
      {picked ? <PortionStep picked={picked} onLog={(r) => logRows([r], r.name ?? "food")} /> : (
        <>
          <Segmented className="mb-3 w-full" value={tab} onChange={setTab} options={[{ value: "search", label: "Search" }, { value: "favorites", label: "Favorites" }, { value: "meals", label: "Meals" }, { value: "recipes", label: "Recipes" }, { value: "custom", label: "Custom" }]} />
          {tab === "search" && (
            <>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
                <Input autoFocus placeholder="Search foods…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
              {q ? (results.length ? results.map((f) => <FoodRow key={f.id} f={f} />) : <Empty title="No match" body="Add it as a custom food — it'll be saved for next time." action={<Button size="sm" onClick={() => setTab("custom")}>Create custom food</Button>} />) : (
                <>
                  {recentUnique.length > 0 && <div className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wider text-faint">Recent — tap to repeat</div>}
                  {recentUnique.map((r) => (
                    <button key={r.id} onClick={() => repeatLog(r)} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left hover:bg-card-2">
                      <div className="min-w-0"><div className="truncate text-[15px] font-medium">{r.name}</div><div className="num text-xs text-faint">{r.quantity} {r.unit} · {Math.round(r.calories)} kcal · P {r.protein}</div></div>
                      <Plus className="size-4 shrink-0 text-good" />
                    </button>
                  ))}
                  {!recentUnique.length && <p className="px-2 py-6 text-center text-sm text-muted">Search {foods.rows.length} foods, or create your own.</p>}
                </>
              )}
            </>
          )}
          {tab === "favorites" && (favSet.size ? foods.rows.filter((f) => favSet.has(f.id)).map((f) => <FoodRow key={f.id} f={f} />) : <Empty icon={<Star className="size-5" />} title="No favorites yet" body="Tap the star next to any food to pin it here." />)}
          {tab === "meals" && (meals.rows.length ? meals.rows.map((m) => {
            const t = sumMacros(m.items);
            return (
              <button key={m.id} onClick={() => logMeal(m)} className="mb-1.5 flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 px-4 py-3 text-left active:scale-[.99]">
                <div className="min-w-0"><div className="truncate font-medium">{m.name}</div><div className="num text-xs text-faint">{m.items.length} items · {t.calories} kcal · P {t.protein}g</div></div>
                <span className="rounded-lg bg-good-soft px-2.5 py-1 text-xs font-semibold text-good">Log</span>
              </button>
            );
          }) : <Empty title="No saved meals" body="Save a combination of foods on the Nutrition page to log it in one tap." />)}
          {tab === "recipes" && (recipes.rows.length ? recipes.rows.map((r) => {
            const n = recipeNutrition(ingr.rows.filter((i) => i.recipe_id === r.id).map((i) => ({ quantity: Number(i.quantity), food: foodById.get(i.food_id) })), Number(r.servings));
            return (
              <button key={r.id} onClick={() => setPicked({ kind: "recipe", recipe: r, per: n.perServing })} className="mb-1.5 flex w-full items-center justify-between rounded-2xl border border-line bg-bg-2 px-4 py-3 text-left">
                <div><div className="font-medium">{r.name}</div><div className="num text-xs text-faint">per serving · {n.perServing.calories} kcal · P {n.perServing.protein}g</div></div>
                <ChevronLeft className="size-4 rotate-180 text-faint" />
              </button>
            );
          }) : <Empty title="No recipes" body="Build recipes from ingredients on the Nutrition page — nutrition is calculated for you." />)}
          {tab === "custom" && <CustomFood initialName={q} onLog={(r) => logRows([r], r.name ?? "food")} />}
        </>
      )}
    </Sheet>
  );
}

function PortionStep({ picked, onLog }: { picked: Picked; onLog: (r: Partial<NutritionLog>) => void }) {
  const isFood = picked.kind === "food";
  const base = isFood ? picked.food.serving_size : 1;
  const [qty, setQty] = useState<number>(base);
  const auto = isFood ? scaleFood(picked.food, qty) : sumMacros([{ calories: picked.per.calories * qty, protein: picked.per.protein * qty, carbs: picked.per.carbs * qty, fat: picked.per.fat * qty, fiber: picked.per.fiber * qty }]);
  const [manual, setManual] = useState<Macros | null>(null);
  const m = manual ?? auto;
  const name = isFood ? picked.food.name : picked.recipe.name;
  const unit = isFood ? picked.food.serving_unit : "serving";
  return (
    <div>
      <div className="mb-4 text-xl font-semibold">{name}</div>
      <Stepper big label={`Quantity (${unit})`} value={qty} onChange={(v) => { setQty(v); setManual(null); }} step={isFood && ["g", "ml"].includes(unit) ? 10 : 0.5} unit={unit} />
      <div className="mt-2 flex gap-1.5">
        {[0.5, 1, 1.5, 2, 3].map((x) => <Chip key={x} active={qty === base * x} onClick={() => { setQty(base * x); setManual(null); }}>{x}×</Chip>)}
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {(["calories", "protein", "carbs", "fat", "fiber"] as const).map((k) => (
          <label key={k} className="rounded-xl border border-line bg-bg-2 px-2 py-2 text-center">
            <span className="block text-[10px] uppercase tracking-wide text-faint">{k === "calories" ? "kcal" : k}</span>
            <input inputMode="decimal" className="num w-full bg-transparent text-center text-base font-semibold outline-none" value={m[k]} onChange={(e) => setManual({ ...m, [k]: Number(e.target.value) || 0 })} />
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-faint">{manual ? "Manually corrected values will be logged." : "Calculated from quantity — tap a value to correct it."}</p>
      <Button variant="good" size="lg" className="mt-5 w-full" onClick={() => onLog({ name, quantity: qty, unit, food_id: isFood ? picked.food.id : null, recipe_id: isFood ? null : picked.recipe.id, ...m })}>Add · {m.calories} kcal</Button>
    </div>
  );
}

function CustomFood({ initialName, onLog }: { initialName: string; onLog: (r: Partial<NutritionLog>) => void }) {
  const [f, setF] = useState({ name: initialName, serving_size: 100, serving_unit: "g", calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  const [save, setSave] = useState(true);
  const act = useAction();
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) || 0 });
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Homemade chicken wrap" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serving size"><Input inputMode="decimal" value={f.serving_size} onChange={num("serving_size")} /></Field>
        <Field label="Unit"><Select value={f.serving_unit} onChange={(e) => setF({ ...f, serving_unit: e.target.value })}>{["g", "ml", "piece", "serving", "cup", "tbsp", "tsp", "slice", "scoop"].map((u) => <option key={u}>{u}</option>)}</Select></Field>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {(["calories", "protein", "carbs", "fat", "fiber"] as const).map((k) => <Field key={k} label={k === "calories" ? "kcal" : k[0].toUpperCase() + k.slice(1)}><Input inputMode="decimal" className="px-2 text-center" value={f[k]} onChange={num(k)} /></Field>)}
      </div>
      <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-4 accent-[var(--good)]" />Save to my food database</label>
      <Button variant="good" size="lg" className="w-full" disabled={!f.name.trim()} onClick={() => act(async () => {
        let food_id: string | null = null;
        if (save) { const [row] = await insertRows("foods", { ...f, name: f.name.trim() }); food_id = row.id; }
        onLog({ name: f.name.trim(), quantity: f.serving_size, unit: f.serving_unit, food_id, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber });
      })}>Log food</Button>
    </div>
  );
}

// ---------------------------------------------------------------- weight / measurements
export function WeightSheet({ open, onClose, full }: { open: boolean; onClose: () => void; full?: boolean }) {
  const { profile, update } = useProfile();
  const toast = useToast();
  const p = profile ?? { unit_weight: "kg" as const, unit_length: "cm" as const };
  const last = profile?.weight_kg ?? 75;
  const [w, setW] = useState<number | null>(null);
  const [m, setM] = useState({ waist: "", chest: "", arms: "", thighs: "", bf: "", notes: "" });
  const [date, setDate] = useState(today());
  const val = w ?? (p.unit_weight === "lbs" ? Math.round(last * 2.20462 * 10) / 10 : last);
  const save = async () => {
    const kg = Math.round(wIn(val, p) * 100) / 100;
    const n = (s: string) => (s.trim() ? Math.round(lIn(Number(s), p) * 10) / 10 : null);
    try {
      const [row] = await insertRows("body_measurements", { date, weight_kg: kg, waist_cm: n(m.waist), chest_cm: n(m.chest), arms_cm: n(m.arms), thighs_cm: n(m.thighs), body_fat_pct: m.bf ? Number(m.bf) : null, notes: m.notes || null });
      if (date === today()) update({ weight_kg: kg }).catch(() => {});
      toast(`Logged ${val} ${wUnit(p)}`, { undo: () => deleteById("body_measurements", row.id) });
      setW(null); setM({ waist: "", chest: "", arms: "", thighs: "", bf: "", notes: "" }); onClose();
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log weight" footer={<Button variant="good" size="lg" className="w-full" onClick={save}>Save</Button>}>
      <Stepper big label={`Body weight (${wUnit(p)})`} value={val} onChange={setW} step={0.1} />
      <Field label="Date" className="mt-4"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <details className="mt-4 rounded-2xl border border-line bg-bg-2 p-3" open={full}>
        <summary className="cursor-pointer text-sm font-medium text-muted">Measurements & body fat (optional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["waist", "chest", "arms", "thighs"] as const).map((k) => <Field key={k} label={`${k[0].toUpperCase() + k.slice(1)} (${lUnit(p)})`}><Input inputMode="decimal" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></Field>)}
          <Field label="Body fat %"><Input inputMode="decimal" value={m.bf} onChange={(e) => setM({ ...m, bf: e.target.value })} /></Field>
          <Field label="Notes" className="col-span-2"><Input value={m.notes} onChange={(e) => setM({ ...m, notes: e.target.value })} /></Field>
        </div>
      </details>
    </Sheet>
  );
}

// ---------------------------------------------------------------- activity
export function ActivitySheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: { distance_km?: number; duration_min?: number } }) {
  const toast = useToast();
  const [type, setType] = useState<ActivityType>("walk");
  const [km, setKm] = useState(initial?.distance_km ?? 2);
  const [min, setMin] = useState(initial?.duration_min ?? 25);
  const [steps, setSteps] = useState(0);
  const [cal, setCal] = useState(0);
  const [date, setDate] = useState(today());
  const save = async () => {
    try {
      const [row] = await insertRows("activity_logs", { date, type, distance_km: km, duration_min: Math.round(min), steps: Math.round(steps), active_calories: Math.round(cal), source: "manual", logged_at: new Date().toISOString() });
      toast(`Logged ${km} km ${type}`, { undo: () => deleteById("activity_logs", row.id) });
      onClose();
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log activity" footer={<Button variant="good" size="lg" className="w-full" onClick={save}>Save activity</Button>}>
      <Segmented className="mb-4 w-full" value={type} onChange={setType} options={(["walk", "run", "cycle", "cardio", "hike", "swim"] as ActivityType[]).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))} />
      <div className="grid grid-cols-2 gap-3">
        <Stepper label="Distance" unit="km" value={km} onChange={setKm} step={0.5} />
        <Stepper label="Duration" unit="min" value={min} onChange={setMin} step={5} />
        <Stepper label="Steps (optional)" value={steps} onChange={setSteps} step={500} max={100000} />
        <Stepper label="Active kcal (optional)" value={cal} onChange={setCal} step={10} />
      </div>
      <Field label="Date" className="mt-4"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="mt-3 text-xs text-faint">If you only log steps, distance is estimated at ~0.76 m per step.</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- sleep
export function SleepSheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: SleepLog }) {
  const toast = useToast();
  const { profile } = useProfile();
  const t = today();
  const hm = (iso?: string) => (iso ? `${String(new Date(iso).getHours()).padStart(2, "0")}:${String(new Date(iso).getMinutes()).padStart(2, "0")}` : "");
  const [date, setDate] = useState(existing?.date ?? t);
  const [bed, setBed] = useState(hm(existing?.bedtime) || profile?.bedtime_target?.slice(0, 5) || "23:00");
  const [wake, setWake] = useState(hm(existing?.wake_time) || "07:00");
  const [quality, setQuality] = useState<number | null>(existing?.quality ?? null);
  const [refreshed, setRefreshed] = useState<number | null>(existing?.refreshed ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const iso = (k: string, h: string) => { const [y, m, d] = k.split("-").map(Number); const [hh, mm] = h.split(":").map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
  const bedDay = Number(bed.split(":")[0]) >= 12 ? addDays(date, -1) : date;
  const bedISO = iso(bedDay, bed), wakeISO = iso(date, wake);
  const dur = sleepMinutes(bedISO, wakeISO);
  const save = async () => {
    try {
      await upsertRow("sleep_logs", { date, bedtime: bedISO, wake_time: wakeISO, duration_min: dur, quality, refreshed, notes: notes || null }, "user_id,date");
      toast(`Sleep logged · ${(dur / 60).toFixed(1)} h`);
      onClose();
    } catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Log sleep" footer={<Button variant="good" size="lg" className="w-full" onClick={save}>Save · {(dur / 60).toFixed(1)} h</Button>}>
      <Field label="Woke up on"><Input type="date" value={date} max={t} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Bedtime"><Input type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></Field>
        <Field label="Wake-up"><Input type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
      </div>
      <div className="mt-4"><div className="mb-1.5 text-[13px] font-medium text-muted">Sleep quality</div><Scale value={quality} onChange={setQuality} max={5} lowLabel="Poor" highLabel="Great" /></div>
      <div className="mt-4"><div className="mb-1.5 text-[13px] font-medium text-muted">How refreshed do you feel?</div><Scale value={refreshed} onChange={setRefreshed} max={5} lowLabel="Groggy" highLabel="Fresh" /></div>
      <Field label="Notes" className="mt-4"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Late caffeine, woke up at 3am…" /></Field>
    </Sheet>
  );
}

// ---------------------------------------------------------------- recovery check-in (< 1 minute)
export function CheckInSheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: RecoveryLog }) {
  const toast = useToast();
  const [v, setV] = useState({ energy: existing?.energy ?? null, soreness: existing?.soreness ?? null, stress: existing?.stress ?? null, motivation: existing?.motivation ?? null, fatigue: existing?.fatigue ?? null });
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const save = async () => {
    try { await upsertRow("recovery_logs", { date: today(), ...v, notes: notes || null }, "user_id,date"); toast("Check-in saved"); onClose(); }
    catch (e) { toast((e as Error).message, { tone: "bad" }); }
  };
  const rows: { k: keyof typeof v; label: string; low: string; high: string; invert?: boolean }[] = [
    { k: "energy", label: "Energy", low: "Drained", high: "Energised" },
    { k: "motivation", label: "Motivation", low: "None", high: "Fired up" },
    { k: "soreness", label: "Muscle soreness", low: "None", high: "Very sore", invert: true },
    { k: "fatigue", label: "Fatigue", low: "Fresh", high: "Exhausted", invert: true },
    { k: "stress", label: "Stress", low: "Calm", high: "Very stressed", invert: true },
  ];
  return (
    <Sheet open={open} onClose={onClose} title="Daily check-in" footer={<Button variant="good" size="lg" className="w-full" onClick={save}>Save check-in</Button>}>
      <div className="space-y-4">
        {rows.map((r) => <div key={r.k}><div className="mb-1.5 text-[13px] font-medium text-muted">{r.label}</div><Scale value={v[r.k]} onChange={(n) => setV({ ...v, [r.k]: n })} lowLabel={r.low} highLabel={r.high} invert={r.invert} /></div>)}
        <Field label="Notes (optional)"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

export function DeleteButton({ onClick }: { onClick: () => void }) {
  return <button aria-label="Delete" onClick={onClick} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-bad-soft hover:text-bad"><Trash2 className="size-4" /></button>;
}

export const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export { dateKey };
