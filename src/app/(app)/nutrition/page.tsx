"use client";
import { BookmarkPlus, CalendarPlus, ChevronLeft, ChevronRight, Copy, Plus, Search, Star, Trash2, Utensils, Clock, ChefHat } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { addDays, dailyTargets, isTrainingDay, pct, recipeNutrition, remaining, scaleFood, sumMacros, weekday } from "@/lib/calc";
import { deleteById, insertRows, updateById, useRows } from "@/lib/data";
import { today, useProfile } from "@/lib/hooks";
import type { Food, Meal, MealCategory, MealItem, MealPlanEntry, NutritionLog, Recipe, RecipeIngredient, WorkoutPlan } from "@/lib/types";
import { BarSeries, ChartFrame } from "@/components/charts";
import { catLabel, FoodLogSheet, MEAL_CATS } from "@/components/loggers";
import { Badge, Button, Card, Chip, cx, Empty, Field, IconButton, Input, MacroBar, PageHeader, Ring, Section, Segmented, Select, Sheet, Textarea, useAction, useToast } from "@/components/ui";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function NutritionPage() { return <Suspense><Inner /></Suspense>; }

function Inner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<"day" | "plan" | "library" | "trends">("day");
  return (
    <div className="anim-rise">
      <PageHeader title="Nutrition" sub="Targets adapt to training and rest days." />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: "day", label: "Log" }, { value: "plan", label: "Meal plan" }, { value: "library", label: "Library" }, { value: "trends", label: "Trends" }]} />
      {tab === "day" && <DayLog openLog={sp.get("log") === "1"} />}
      {tab === "plan" && <MealPlan />}
      {tab === "library" && <Library />}
      {tab === "trends" && <Trends />}
    </div>
  );
}

// ---------------------------------------------------------------- daily log
function DayLog({ openLog }: { openLog: boolean }) {
  const act = useAction();
  const toast = useToast();
  const { profile } = useProfile();
  const [date, setDate] = useState(today());
  const [logCat, setLogCat] = useState<MealCategory | null>(openLog ? "lunch" : null);
  const [saveCat, setSaveCat] = useState<MealCategory | null>(null);
  const [editing, setEditing] = useState<NutritionLog | null>(null);
  const logs = useRows<NutritionLog>({ table: "nutrition_logs", filters: [["date", "eq", date]], order: [["logged_at", true]] });
  const yesterday = useRows<NutritionLog>({ table: "nutrition_logs", filters: [["date", "eq", addDays(date, -1)]], order: [["logged_at", true]] });
  const plans = useRows<WorkoutPlan>({ table: "workout_plans", filters: [["archived", "eq", false]] });
  const planEntries = useRows<MealPlanEntry>({ table: "meal_plan_entries", filters: [["weekday", "eq", weekday(date)]], order: [["time", true]] });
  if (!profile) return null;
  const training = isTrainingDay(profile, plans.rows, date);
  const tg = dailyTargets(profile, training);
  const tot = sumMacros(logs.rows);
  const cats = MEAL_CATS.filter((c) => logs.rows.some((l) => l.meal_category === c.value) || ["breakfast", "lunch", "dinner", "snack"].includes(c.value));
  const planned = planEntries.rows.filter((e) => e.day_type === "any" || (e.day_type === "training") === training);

  const copy = (rows: NutritionLog[], label: string) => act(async () => {
    if (!rows.length) throw new Error("Nothing to copy");
    const ins = await insertRows("nutrition_logs", rows.map(({ id: _i, user_id: _u, logged_at: _l, date: _d, is_demo: _x, ...r }) => ({ ...r, date, logged_at: new Date().toISOString() })));
    toast(`Copied ${label}`, { undo: () => ins.forEach((r) => deleteById("nutrition_logs", r.id)) });
  });
  const logPlanned = (e: MealPlanEntry) => act(async () => {
    const ins = await insertRows("nutrition_logs", e.items.map((i) => ({ date, meal_category: e.meal_category, name: i.name, quantity: i.quantity, unit: i.unit, food_id: i.food_id ?? null, calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat, fiber: i.fiber, logged_at: new Date().toISOString() })));
    toast(`Logged ${e.name}`, { undo: () => ins.forEach((r) => deleteById("nutrition_logs", r.id)) });
  });
  const removeLog = (l: NutritionLog) => act(async () => { await deleteById("nutrition_logs", l.id); }, `Removed ${l.name}`, () => insertRows("nutrition_logs", { ...l }));

  const fastingNow = (() => {
    if (!profile.fasting_enabled || date !== today()) return null;
    const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
    const [a, b] = [profile.eating_window_start, profile.eating_window_end].map((t) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; });
    const open = a <= b ? m >= a && m < b : m >= a || m < b;
    return { open, label: open ? `Eating window open until ${profile.eating_window_end.slice(0, 5)}` : `Fasting · window opens ${profile.eating_window_start.slice(0, 5)}` };
  })();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="size-5" /></IconButton>
          <div className="min-w-[150px] text-center font-semibold">{date === today() ? "Today" : new Date(`${date}T12:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
          <IconButton label="Next day" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))}><ChevronRight className="size-5" /></IconButton>
        </div>
        <Badge tone={training ? "warm" : "neutral"}>{training ? "Training day" : "Rest day"}</Badge>
      </div>

      <Card className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <Ring value={tg.calories ? tot.calories / tg.calories : 0} size={124} stroke={11} color={tot.calories > tg.calories * 1.1 ? "var(--bad)" : undefined}>
              <div><div className="num font-display text-3xl font-semibold">{tot.calories}</div><div className="text-[11px] text-faint">of {tg.calories} kcal</div></div>
            </Ring>
            <div className="space-y-1 sm:hidden"><div className="num text-2xl font-semibold">{remaining(tg.calories, tot.calories)}</div><div className="text-sm text-faint">kcal remaining · {pct(tot.calories, tg.calories)}%</div></div>
          </div>
          <div className="flex-1 space-y-2.5">
            <div className="hidden items-baseline gap-2 sm:flex"><span className="num text-2xl font-semibold">{remaining(tg.calories, tot.calories)}</span><span className="text-sm text-faint">kcal remaining · {pct(tot.calories, tg.calories)}% of target{!training && profile.rest_day_calorie_delta ? ` (rest day ${profile.rest_day_calorie_delta > 0 ? "+" : ""}${profile.rest_day_calorie_delta})` : ""}</span></div>
            <MacroBar label={`Protein · ${remaining(tg.protein, tot.protein)}g left`} value={tot.protein} target={tg.protein} color="var(--good)" />
            <MacroBar label="Carbs" value={tot.carbs} target={tg.carbs} color="var(--warm)" />
            <MacroBar label="Fat" value={tot.fat} target={tg.fat} color="var(--violet)" />
            <MacroBar label="Fiber" value={tot.fiber} target={tg.fiber} color="var(--cyan)" />
          </div>
        </div>
        {fastingNow && <div className={cx("mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-sm", fastingNow.open ? "bg-good-soft text-good" : "bg-warm-soft text-warm")}><Clock className="size-4" />{fastingNow.label}</div>}
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button variant="good" size="lg" onClick={() => setLogCat("lunch")} icon={<Plus className="size-4" />}>Log food</Button>
        <Button size="lg" onClick={() => copy(yesterday.rows, "yesterday's meals")} icon={<Copy className="size-4" />}>Copy yesterday</Button>
      </div>

      {planned.length > 0 && (
        <Section title="Planned for today">
          <div className="grid gap-2 sm:grid-cols-2">
            {planned.map((e) => { const m = sumMacros(e.items); const done = logs.rows.some((l) => l.name === e.items[0]?.name && l.meal_category === e.meal_category); return (
              <Card key={e.id} className="flex items-center gap-3 p-3">
                <div className="num w-12 text-sm text-faint">{e.time.slice(0, 5)}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.name}</div><div className="num text-xs text-faint">{catLabel(e.meal_category)} · {m.calories} kcal · P {m.protein}g</div></div>
                <Button size="sm" variant={done ? "ghost" : "good"} onClick={() => logPlanned(e)}>{done ? "Log again" : "Log"}</Button>
              </Card>
            ); })}
          </div>
        </Section>
      )}

      {cats.map((c) => {
        const rows = logs.rows.filter((l) => l.meal_category === c.value);
        const m = sumMacros(rows);
        const yRows = yesterday.rows.filter((l) => l.meal_category === c.value);
        return (
          <Section key={c.value} title={c.label} action={<div className="flex items-center gap-1">
            {rows.length > 0 && <span className="num mr-2 text-xs text-faint">{m.calories} kcal · P {m.protein}g</span>}
            {!rows.length && yRows.length > 0 && <Button size="sm" variant="ghost" onClick={() => copy(yRows, `yesterday's ${c.label.toLowerCase()}`)} icon={<Copy className="size-3.5" />}>Yesterday</Button>}
            {rows.length > 0 && <IconButton label="Save as meal" onClick={() => setSaveCat(c.value)}><BookmarkPlus className="size-4" /></IconButton>}
            <IconButton label={`Add to ${c.label}`} onClick={() => setLogCat(c.value)}><Plus className="size-4" /></IconButton>
          </div>}>
            {rows.length ? (
              <Card className="divide-y divide-line">
                {rows.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(l)}>
                      <div className="truncate font-medium">{l.name}{l.is_demo && <Badge className="ml-2">Demo</Badge>}</div>
                      <div className="num text-xs text-faint">{l.quantity} {l.unit} · P {l.protein} · C {l.carbs} · F {l.fat}</div>
                    </button>
                    <span className="num text-sm font-semibold">{Math.round(l.calories)}</span>
                    <IconButton label="Delete" onClick={() => removeLog(l)}><Trash2 className="size-4" /></IconButton>
                  </div>
                ))}
              </Card>
            ) : <button onClick={() => setLogCat(c.value)} className="w-full rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-faint hover:border-line-2 hover:text-muted">Nothing logged — tap to add</button>}
          </Section>
        );
      })}

      <FoodLogSheet open={!!logCat} onClose={() => setLogCat(null)} date={date} category={logCat ?? undefined} key={`${logCat}-${date}`} />
      <SaveMealSheet open={!!saveCat} onClose={() => setSaveCat(null)} cat={saveCat} rows={logs.rows.filter((l) => l.meal_category === saveCat)} />
      <EditLogSheet log={editing} onClose={() => setEditing(null)} />
    </>
  );
}

const toItem = (l: NutritionLog): MealItem => ({ name: l.name, quantity: Number(l.quantity), unit: l.unit, food_id: l.food_id, calories: Number(l.calories), protein: Number(l.protein), carbs: Number(l.carbs), fat: Number(l.fat), fiber: Number(l.fiber) });

function SaveMealSheet({ open, onClose, cat, rows }: { open: boolean; onClose: () => void; cat: MealCategory | null; rows: NutritionLog[] }) {
  const act = useAction();
  const [name, setName] = useState("");
  useEffect(() => { if (open) setName(rows.map((r) => r.name).slice(0, 2).join(" + ")); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = sumMacros(rows);
  return (
    <Sheet open={open} onClose={onClose} title="Save as meal" footer={<Button variant="good" className="w-full" disabled={!name.trim()} onClick={() => act(async () => { await insertRows("meals", { name: name.trim(), category: cat, items: rows.map(toItem), is_favorite: true }); onClose(); }, "Saved to your meals — log it in one tap next time")}>Save meal</Button>}>
      <Field label="Meal name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <p className="num mt-3 text-sm text-muted">{rows.length} items · {m.calories} kcal · P {m.protein}g · C {m.carbs}g · F {m.fat}g</p>
    </Sheet>
  );
}

function EditLogSheet({ log, onClose }: { log: NutritionLog | null; onClose: () => void }) {
  const act = useAction();
  const [v, setV] = useState<Partial<NutritionLog>>({});
  useEffect(() => setV(log ? { ...log } : {}), [log]);
  if (!log) return null;
  const n = (k: keyof NutritionLog) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) || 0 });
  return (
    <Sheet open={!!log} onClose={onClose} title="Edit entry" footer={<Button variant="good" className="w-full" onClick={() => act(async () => { await updateById("nutrition_logs", log.id, { name: v.name, quantity: v.quantity, meal_category: v.meal_category, calories: v.calories, protein: v.protein, carbs: v.carbs, fat: v.fat, fiber: v.fiber }); onClose(); }, "Updated")}>Save</Button>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantity (${log.unit})`}><Input inputMode="decimal" value={v.quantity ?? 0} onChange={n("quantity")} /></Field>
          <Field label="Meal"><Select value={v.meal_category} onChange={(e) => setV({ ...v, meal_category: e.target.value as MealCategory })}>{MEAL_CATS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-5 gap-2">{(["calories", "protein", "carbs", "fat", "fiber"] as const).map((k) => <Field key={k} label={k === "calories" ? "kcal" : k}><Input inputMode="decimal" className="px-2 text-center" value={v[k] ?? 0} onChange={n(k)} /></Field>)}</div>
        <p className="text-xs text-faint">Adjust values manually if a label differs from the database.</p>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- weekly meal plan
function MealPlan() {
  const act = useAction();
  const entries = useRows<MealPlanEntry>({ table: "meal_plan_entries", order: [["time", true]] });
  const meals = useRows<Meal>({ table: "meals", order: [["name", true]] });
  const { profile } = useProfile();
  const [wd, setWd] = useState(weekday(today()));
  const [adding, setAdding] = useState(false);
  const day = entries.rows.filter((e) => e.weekday === wd);
  const tot = sumMacros(day.filter((e) => e.day_type !== "rest").flatMap((e) => e.items));
  const copyDay = (to: number[]) => act(async () => {
    const rows = to.flatMap((t) => day.map(({ id: _i, user_id: _u, is_demo: _d, ...e }) => ({ ...e, weekday: t })));
    await insertRows("meal_plan_entries", rows);
  }, "Day copied");
  const toCalendar = () => act(async () => {
    const t = today();
    await insertRows("calendar_events", entries.rows.map((e) => {
      const k = addDays(t, (e.weekday - weekday(t) + 7) % 7);
      const s = new Date(`${k}T${e.time.slice(0, 5)}:00`);
      return { title: e.name, type: "meal", start_at: s.toISOString(), end_at: new Date(s.getTime() + 30 * 60000).toISOString(), recurrence: "weekly", reminder_minutes: 10, source: "meal_plan", source_ref: e.id };
    }));
  }, "Meal plan added to calendar (weekly)");
  return (
    <>
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">{WD.map((d, i) => <Chip key={d} active={wd === i} onClick={() => setWd(i)}>{d}{entries.rows.some((e) => e.weekday === i) && <span className="size-1.5 rounded-full bg-good" />}</Chip>)}</div>
      {profile?.fasting_enabled && <p className="mb-3 text-sm text-muted">Intermittent fasting: eating window {profile.eating_window_start.slice(0, 5)}–{profile.eating_window_end.slice(0, 5)}.</p>}
      <Card className="mb-4 p-4"><div className="num text-sm text-muted">{WD[wd]} plan (training-day total): <b className="text-fg">{tot.calories} kcal</b> · P {tot.protein}g · C {tot.carbs}g · F {tot.fat}g{profile && <> · target {profile.calorie_target} kcal / {profile.protein_target}g P</>}</div></Card>
      {day.length ? (
        <div className="mb-4 space-y-2">
          {day.map((e) => { const m = sumMacros(e.items); return (
            <Card key={e.id} className="flex items-center gap-3 p-3">
              <div className="num w-12 text-sm font-semibold">{e.time.slice(0, 5)}</div>
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{e.name}</div><div className="num text-xs text-faint">{catLabel(e.meal_category)}{e.day_type !== "any" && ` · ${e.day_type} days`} · {m.calories} kcal · P {m.protein}g</div></div>
              <IconButton label="Delete" onClick={() => act(() => deleteById("meal_plan_entries", e.id))}><Trash2 className="size-4" /></IconButton>
            </Card>
          ); })}
        </div>
      ) : <Card className="mb-4"><Empty icon={<Utensils className="size-5" />} title={`No meals planned for ${WD[wd]}`} body="Plan meals from your saved meals. The plan repeats every week and shows up on your daily log." /></Card>}
      <div className="flex flex-wrap gap-2">
        <Button variant="good" onClick={() => setAdding(true)} icon={<Plus className="size-4" />}>Add to {WD[wd]}</Button>
        {day.length > 0 && <Button onClick={() => copyDay([0, 1, 2, 3, 4, 5, 6].filter((x) => x !== wd && !entries.rows.some((e) => e.weekday === x)))} icon={<Copy className="size-4" />}>Copy to empty days</Button>}
        {entries.rows.length > 0 && <Button onClick={toCalendar} icon={<CalendarPlus className="size-4" />}>Add plan to calendar</Button>}
      </div>
      <PlanEntrySheet open={adding} onClose={() => setAdding(false)} weekday={wd} meals={meals.rows} />
    </>
  );
}

function PlanEntrySheet({ open, onClose, weekday: wd, meals }: { open: boolean; onClose: () => void; weekday: number; meals: Meal[] }) {
  const act = useAction();
  const [mealId, setMealId] = useState("");
  const [time, setTime] = useState("13:00");
  const [cat, setCat] = useState<MealCategory>("lunch");
  const [dayType, setDayType] = useState<"any" | "training" | "rest">("any");
  const meal = meals.find((m) => m.id === mealId);
  return (
    <Sheet open={open} onClose={onClose} title={`Plan a meal · ${WD[wd]}`} footer={<Button variant="good" className="w-full" disabled={!meal} onClick={() => act(async () => { await insertRows("meal_plan_entries", { weekday: wd, time, meal_category: cat, day_type: dayType, name: meal!.name, items: meal!.items }); onClose(); }, "Added to plan")}>Add</Button>}>
      {!meals.length ? <Empty title="Save a meal first" body="Log foods on the Log tab, then tap the bookmark icon on a meal to save it. Saved meals become plan building blocks." /> : (
        <div className="space-y-3">
          <Field label="Meal"><Select value={mealId} onChange={(e) => { setMealId(e.target.value); const m = meals.find((x) => x.id === e.target.value); if (m) setCat(m.category); }}><option value="">Choose a saved meal…</option>{meals.map((m) => <option key={m.id} value={m.id}>{m.name} · {sumMacros(m.items).calories} kcal</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Slot"><Select value={cat} onChange={(e) => setCat(e.target.value as MealCategory)}>{MEAL_CATS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></Field>
          </div>
          <Field label="Applies on"><Segmented value={dayType} onChange={setDayType} options={[{ value: "any", label: "Every day" }, { value: "training", label: "Training days" }, { value: "rest", label: "Rest days" }]} /></Field>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- library: meals, recipes, foods
function Library() {
  const act = useAction();
  const [view, setView] = useState<"meals" | "recipes" | "foods">("meals");
  const meals = useRows<Meal>({ table: "meals", order: [["use_count", false]] });
  const recipes = useRows<Recipe>({ table: "recipes", order: [["name", true]] });
  const ingr = useRows<RecipeIngredient>({ table: "recipe_ingredients" });
  const foods = useRows<Food>({ table: "foods", order: [["name", true]] });
  const [recipe, setRecipe] = useState<Recipe | "new" | null>(null);
  const [mealNotes, setMealNotes] = useState<Meal | null>(null);
  const foodById = new Map(foods.rows.map((f) => [f.id, f]));
  const myFoods = foods.rows.filter((f) => f.user_id);
  return (
    <>
      <Segmented className="mb-4" value={view} onChange={setView} options={[{ value: "meals", label: `Meals (${meals.rows.length})` }, { value: "recipes", label: `Recipes (${recipes.rows.length})` }, { value: "foods", label: `My foods (${myFoods.length})` }]} />
      {view === "meals" && (meals.rows.length ? <div className="grid gap-2 sm:grid-cols-2">{meals.rows.map((m) => { const t = sumMacros(m.items); return (
        <Card key={m.id} className="p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-semibold">{m.name}</div><div className="text-xs text-faint">{catLabel(m.category)} · used {m.use_count}×</div></div>
            <div className="flex"><IconButton label="Favourite" onClick={() => act(() => updateById("meals", m.id, { is_favorite: !m.is_favorite }))}><Star className={cx("size-4", m.is_favorite && "fill-warm text-warm")} /></IconButton><IconButton label="Prep notes" onClick={() => setMealNotes(m)}><ChefHat className="size-4" /></IconButton><IconButton label="Delete" onClick={() => act(() => deleteById("meals", m.id), "Meal deleted")}><Trash2 className="size-4" /></IconButton></div></div>
          <div className="mt-2 text-sm text-muted">{m.items.map((i) => i.name).join(", ")}</div>
          <div className="num mt-2 text-sm"><b>{t.calories}</b> kcal · P {t.protein}g · C {t.carbs}g · F {t.fat}g</div>
          {m.notes && <p className="mt-2 rounded-lg bg-bg-2 p-2 text-xs text-muted">{m.notes}</p>}
        </Card>
      ); })}</div> : <Card><Empty title="No saved meals" body="Save meals from the daily log for one-tap logging and meal planning." /></Card>)}
      {view === "recipes" && (
        <>
          <Button className="mb-3" variant="good" onClick={() => setRecipe("new")} icon={<Plus className="size-4" />}>New recipe</Button>
          {recipes.rows.length ? <div className="grid gap-2 sm:grid-cols-2">{recipes.rows.map((r) => { const n = recipeNutrition(ingr.rows.filter((i) => i.recipe_id === r.id).map((i) => ({ quantity: Number(i.quantity), food: foodById.get(i.food_id) })), Number(r.servings)); return (
            <Card key={r.id} as="button" onClick={() => setRecipe(r)} className="p-4"><div className="font-semibold">{r.name}</div><div className="num mt-1 text-sm text-muted">{r.servings} servings · per serving {n.perServing.calories} kcal · P {n.perServing.protein}g</div></Card>
          ); })}</div> : <Card><Empty icon={<ChefHat className="size-5" />} title="No recipes" body="Build a recipe from ingredients — total and per-serving nutrition are calculated automatically." /></Card>}
        </>
      )}
      {view === "foods" && (myFoods.length ? <Card className="divide-y divide-line">{myFoods.map((f) => (
        <div key={f.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><div className="truncate font-medium">{f.name}</div><div className="num text-xs text-faint">{f.serving_size} {f.serving_unit} · {f.calories} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</div></div><IconButton label="Delete" onClick={() => act(() => deleteById("foods", f.id), "Food deleted")}><Trash2 className="size-4" /></IconButton></div>
      ))}</Card> : <Card><Empty title="No custom foods" body={`You have ${foods.rows.length} foods in the shared database. Custom foods you create while logging appear here.`} /></Card>)}
      <RecipeSheet recipe={recipe} onClose={() => setRecipe(null)} foods={foods.rows} ingredients={ingr.rows} />
      <Sheet open={!!mealNotes} onClose={() => setMealNotes(null)} title="Meal prep notes">
        {mealNotes && <Textarea rows={6} defaultValue={mealNotes.notes ?? ""} onBlur={(e) => updateById("meals", mealNotes.id, { notes: e.target.value }).catch(() => {})} placeholder="Batch-cook on Sunday, keeps 3 days…" />}
      </Sheet>
    </>
  );
}

function RecipeSheet({ recipe, onClose, foods, ingredients }: { recipe: Recipe | "new" | null; onClose: () => void; foods: Food[]; ingredients: RecipeIngredient[] }) {
  const act = useAction();
  const r = recipe && recipe !== "new" ? recipe : null;
  const [name, setName] = useState(""); const [servings, setServings] = useState(2); const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ food_id: string; quantity: number }[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!recipe) return;
    setName(r?.name ?? ""); setServings(Number(r?.servings ?? 2)); setNotes(r?.prep_notes ?? "");
    setItems(r ? ingredients.filter((i) => i.recipe_id === r.id).map((i) => ({ food_id: i.food_id, quantity: Number(i.quantity) })) : []);
  }, [recipe]); // eslint-disable-line react-hooks/exhaustive-deps
  const byId = new Map(foods.map((f) => [f.id, f]));
  const n = recipeNutrition(items.map((i) => ({ quantity: i.quantity, food: byId.get(i.food_id) })), servings);
  const results = q ? foods.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const save = () => act(async () => {
    let id = r?.id;
    if (r) { await updateById("recipes", r.id, { name, servings, prep_notes: notes || null }); await Promise.all(ingredients.filter((i) => i.recipe_id === r.id).map((i) => deleteById("recipe_ingredients", i.id))); }
    else { const [x] = await insertRows("recipes", { name, servings, prep_notes: notes || null }); id = x.id; }
    if (items.length) await insertRows("recipe_ingredients", items.map((i) => ({ ...i, recipe_id: id })));
    onClose();
  }, "Recipe saved");
  return (
    <Sheet open={!!recipe} onClose={onClose} title={r ? "Edit recipe" : "New recipe"} wide footer={<div className="flex gap-2">{r && <Button variant="danger" onClick={() => act(async () => { await deleteById("recipes", r.id); onClose(); }, "Recipe deleted")}>Delete</Button>}<Button variant="good" className="flex-1" disabled={!name.trim() || !items.length} onClick={save}>Save recipe</Button></div>}>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_120px] gap-3"><Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Servings"><Input inputMode="decimal" value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} /></Field></div>
        <Field label="Add ingredient"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" /><Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Search foods" /></div></Field>
        {results.map((f) => <button key={f.id} onClick={() => { setItems([...items, { food_id: f.id, quantity: f.serving_size }]); setQ(""); }} className="flex w-full justify-between rounded-xl px-2 py-2 text-left text-sm hover:bg-card-2"><span>{f.name}</span><span className="text-faint">{f.serving_size}{f.serving_unit}</span></button>)}
        <div className="space-y-1.5">{items.map((i, k) => { const f = byId.get(i.food_id); const m = f ? scaleFood(f, i.quantity) : null; return (
          <div key={k} className="flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{f?.name}</span>
            <input inputMode="decimal" value={i.quantity} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, quantity: Number(e.target.value) || 0 } : x)))} className="num w-16 rounded-lg bg-card px-2 py-1 text-right text-sm outline-none" />
            <span className="w-10 text-xs text-faint">{f?.serving_unit}</span>
            <span className="num w-14 text-right text-xs text-muted">{m?.calories} kcal</span>
            <IconButton label="Remove" onClick={() => setItems(items.filter((_, j) => j !== k))}><Trash2 className="size-4" /></IconButton>
          </div>
        ); })}</div>
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-3 text-sm">
          <div><div className="text-xs text-faint">Total</div><div className="num font-semibold">{n.total.calories} kcal · P {n.total.protein} · C {n.total.carbs} · F {n.total.fat}</div></div>
          <div><div className="text-xs text-faint">Per serving</div><div className="num font-semibold text-good">{n.perServing.calories} kcal · P {n.perServing.protein} · C {n.perServing.carbs} · F {n.perServing.fat}</div></div>
        </div>
        <Field label="Prep notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- trends
function Trends() {
  const { profile } = useProfile();
  const t = today();
  const from = addDays(t, -27);
  const logs = useRows<NutritionLog>({ table: "nutrition_logs", filters: [["date", "gte", from], ["date", "lte", t]] });
  const data = useMemo(() => { const out = []; for (let k = from; k <= t; k = addDays(k, 1)) { const m = sumMacros(logs.rows.filter((l) => l.date === k)); out.push({ date: k, ...m, logged: logs.rows.some((l) => l.date === k) }); } return out; }, [logs.rows, from, t]);
  if (!profile) return null;
  const logged = data.filter((d) => d.logged && d.date !== t);
  const avgOf = (k: "calories" | "protein") => (logged.length ? Math.round(logged.reduce((a, d) => a + d[k], 0) / logged.length) : 0);
  const proteinHit = logged.filter((d) => d.protein >= profile.protein_target).length;
  const calHit = logged.filter((d) => d.calories >= profile.calorie_target * 0.9 && d.calories <= profile.calorie_target * 1.1).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-faint">Avg calories</div><div className="num text-xl font-semibold">{avgOf("calories")}</div><div className="text-xs text-faint">target {profile.calorie_target}</div></Card>
        <Card className="p-4"><div className="text-xs text-faint">Avg protein</div><div className="num text-xl font-semibold">{avgOf("protein")}g</div><div className="text-xs text-faint">target {profile.protein_target}g</div></Card>
        <Card className="p-4"><div className="text-xs text-faint">Protein target hit</div><div className="num text-xl font-semibold">{proteinHit}/{logged.length}</div><div className="text-xs text-faint">logged days</div></Card>
        <Card className="p-4"><div className="text-xs text-faint">Calories within ±10%</div><div className="num text-xl font-semibold">{calHit}/{logged.length}</div><div className="text-xs text-faint">logged days</div></Card>
      </div>
      <ChartFrame title="Calories per day (dashed = target)" height={200}><BarSeries data={data} x="date" y="calories" name="Calories" unit="kcal" target={profile.calorie_target} colorFn={(r) => (Number(r.calories) > profile.calorie_target * 1.1 ? "var(--bad)" : "var(--warm)")} /></ChartFrame>
      <ChartFrame title="Protein per day (dashed = target)" height={200}><BarSeries data={data} x="date" y="protein" name="Protein" unit="g" target={profile.protein_target} colorFn={(r) => (Number(r.protein) >= profile.protein_target ? "var(--good)" : "var(--muted)")} /></ChartFrame>
      <p className="text-xs text-faint">Days with nothing logged show as zero and are excluded from averages. Today is excluded because it isn&apos;t over.</p>
    </div>
  );
}
