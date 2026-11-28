// Row types mirroring supabase/migrations. Kept hand-written so the app compiles without codegen.

export type Role = "user" | "coach" | "admin";

export type ScoreKey = "workout" | "nutrition" | "protein" | "water" | "walk" | "sleep" | "habits";

export interface Profile {
  id: string;
  name: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal_weight_kg: number | null;
  fitness_goal: string;
  experience: string;
  workout_days: number[];
  preferred_workout_time: string;
  dietary_prefs: string[];
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  fiber_target: number;
  rest_day_calorie_delta: number;
  fasting_enabled: boolean;
  eating_window_start: string;
  eating_window_end: string;
  water_target_ml: number;
  walk_target_km: number;
  steps_target: number;
  sleep_target_hours: number;
  bedtime_target: string;
  unit_weight: "kg" | "lbs";
  unit_length: "cm" | "in";
  unit_volume: "ml" | "l" | "oz";
  timezone: string;
  theme: "dark" | "light" | "system";
  score_weights: Record<ScoreKey, number>;
  notification_settings: { enabled: boolean; quiet_start: string; quiet_end: string; max_per_hour: number };
  google_calendar: { connected?: boolean; calendar_id?: string; last_sync?: string };
  onboarded: boolean;
  role?: Role;
  coach_id?: string | null;
  avatar_emoji?: string | null;
  avatar_color?: string | null;
}

interface Owned { id: string; user_id: string; is_demo?: boolean }

export interface Goal extends Owned {
  title: string; metric: string | null; start_value: number | null; target_value: number | null;
  target_date: string | null; status: "active" | "achieved" | "abandoned"; created_at?: string;
}

export interface Exercise {
  id: string; user_id: string | null; name: string; muscle_group: string; secondary_muscles: string[];
  equipment: string | null; category: string; instructions: string | null; default_sets: number;
  default_reps: number; default_weight: number; default_rest_seconds: number; tempo: string | null;
  notes: string | null; alternatives: string[]; media_url: string | null;
}

export interface WorkoutPlan extends Owned {
  name: string; split_type: string; color: string; scheduled_days: number[]; estimated_minutes: number;
  position: number; notes: string | null; archived: boolean;
}

export interface PlanExercise extends Owned {
  plan_id: string; exercise_id: string; position: number; sets: number; reps: number; weight: number;
  rest_seconds: number; tempo: string | null; notes: string | null;
}

export type WorkoutStatus = "in_progress" | "paused" | "completed" | "skipped";
export interface Workout extends Owned {
  plan_id: string | null; name: string; date: string; status: WorkoutStatus; started_at: string;
  ended_at: string | null; paused_seconds: number; paused_at: string | null; duration_seconds: number | null;
  total_volume: number; notes: string | null;
}

export interface WorkoutSet extends Owned {
  workout_id: string; exercise_id: string | null; exercise_name: string; muscle_group: string | null;
  exercise_order: number; set_number: number; target_reps: number | null; reps: number | null; weight: number;
  rest_seconds: number; completed: boolean; completed_at: string | null; skipped: boolean; is_pr: boolean;
  notes: string | null;
}

export interface Macros { calories: number; protein: number; carbs: number; fat: number; fiber: number }

export interface Food extends Macros {
  id: string; user_id: string | null; name: string; brand: string | null; serving_size: number; serving_unit: string;
}

export interface Recipe extends Owned { name: string; servings: number; prep_notes: string | null; is_favorite: boolean }
export interface RecipeIngredient extends Owned { recipe_id: string; food_id: string; quantity: number }

export interface MealItem extends Macros { name: string; quantity: number; unit: string; food_id?: string | null }
export interface Meal extends Owned {
  name: string; category: MealCategory; items: MealItem[]; notes: string | null; is_favorite: boolean; use_count: number;
}

export type MealCategory = "first_meal" | "breakfast" | "lunch" | "pre_workout" | "post_workout" | "dinner" | "snack";

export interface NutritionLog extends Owned, Macros {
  date: string; meal_category: MealCategory; food_id: string | null; recipe_id: string | null; meal_id: string | null;
  name: string; quantity: number; unit: string; logged_at: string;
}

export interface MealPlanEntry extends Owned {
  weekday: number; day_type: "any" | "training" | "rest"; meal_category: MealCategory; time: string; name: string;
  items: MealItem[]; notes: string | null; position: number;
}

export interface HydrationLog extends Owned { date: string; amount_ml: number; logged_at: string }

export type ActivityType = "walk" | "run" | "cycle" | "cardio" | "swim" | "hike" | "other";
export interface ActivityLog extends Owned {
  date: string; type: ActivityType; steps: number; distance_km: number; duration_min: number; active_calories: number; resting_calories?: number; avg_hr?: number | null; max_hr?: number | null;
  source: string; notes: string | null; logged_at: string;
}

export interface SleepLog extends Owned {
  date: string; bedtime: string; wake_time: string; duration_min: number; quality: number | null;
  refreshed: number | null; notes: string | null;
  // detail from a watch (Samsung Health import); null when logged by hand
  source?: string; score?: number | null; efficiency?: number | null; deep_min?: number | null; light_min?: number | null;
  rem_min?: number | null; awake_min?: number | null; snoring_min?: number | null; spo2_avg?: number | null; spo2_min?: number | null;
  sessions?: number; physical_recovery?: number | null; mental_recovery?: number | null;
}

export interface HealthDaily extends Owned {
  date: string; resting_hr: number | null; avg_hr: number | null; min_hr: number | null; max_hr: number | null; hr_samples: number | null;
  stress_avg: number | null; stress_min: number | null; stress_max: number | null; stress_samples: number | null;
  spo2_avg: number | null; spo2_min: number | null; floors: number | null; source: string;
}

export interface RecoveryLog extends Owned {
  date: string; energy: number | null; soreness: number | null; stress: number | null; motivation: number | null;
  fatigue: number | null; notes: string | null;
}

export interface Habit extends Owned {
  name: string; icon: string; color: string; frequency: "daily" | "weekly"; target_per_week: number; days: number[];
  reminder_time: string | null; auto_metric: string | null; position: number; archived: boolean; created_at?: string;
}
export interface HabitLog extends Owned { habit_id: string; date: string; completed: boolean }

export type EventType = "workout" | "meal" | "water" | "walk" | "sleep" | "work" | "meeting" | "personal" | "recovery" | "study" | "other";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export interface CalendarEvent extends Owned {
  title: string; type: EventType; start_at: string; end_at: string; all_day: boolean; notes: string | null;
  location: string | null; recurrence: Recurrence; recurrence_until: string | null; recurrence_exceptions: string[];
  completed_dates: string[]; reminder_minutes: number | null; source: string; source_ref: string | null;
  external_id: string | null;
}

export interface BodyMeasurement extends Owned {
  date: string; weight_kg: number | null; waist_cm: number | null; chest_cm: number | null; arms_cm: number | null;
  thighs_cm: number | null; body_fat_pct: number | null; notes: string | null;
}

export interface ProgressPhoto extends Owned { date: string; storage_path: string; pose: string; notes: string | null }

export interface Reminder extends Owned {
  type: string; label: string; time: string | null; interval_minutes: number | null; window_start: string | null;
  window_end: string | null; days: number[]; enabled: boolean; snoozed_until: string | null; last_fired_at: string | null;
}

export interface Program extends Owned {
  name: string; start_date: string; duration_days: number; primary_goals: string[]; secondary_goals: string[];
  daily_objectives: string[]; milestones: { day: number; title: string }[]; status: "active" | "paused" | "completed" | "abandoned";
  paused_at: string | null; paused_days: number;
}

export interface AiMessage extends Owned { role: "user" | "assistant"; content: string; proposals: Proposal[] | null; created_at: string }

export type Proposal =
  | { kind: "calendar_event"; title: string; type: EventType; start_at: string; end_at: string; notes?: string; status?: "applied" | "dismissed" }
  | { kind: "log_food"; name: string; meal_category: MealCategory; calories: number; protein: number; carbs: number; fat: number; fiber: number; status?: "applied" | "dismissed" }
  | { kind: "plan_exercise_change"; plan_name: string; exercise_name: string; sets: number; reps: number; weight: number; status?: "applied" | "dismissed" }
  | { kind: "target_change"; field: "calorie_target" | "protein_target" | "carbs_target" | "fat_target" | "water_target_ml" | "walk_target_km" | "sleep_target_hours"; value: number; reason: string; status?: "applied" | "dismissed" };

export type TableName =
  | "profiles" | "goals" | "exercises" | "workout_plans" | "plan_exercises" | "workouts" | "workout_sets" | "foods"
  | "food_favorites" | "recipes" | "recipe_ingredients" | "meals" | "nutrition_logs" | "meal_plan_entries"
  | "hydration_logs" | "activity_logs" | "sleep_logs" | "recovery_logs" | "habits" | "habit_logs" | "calendar_events"
  | "body_measurements" | "progress_photos" | "reminders" | "transformation_programs" | "ai_messages" | "health_daily" | "assignments" | "assignment_messages" | "notifications" | "group_sessions" | "session_rsvps";

export type AssignmentStatus = "assigned" | "accepted" | "done" | "change_requested" | "declined" | "cancelled";
export interface Assignment {
  id: string; coach_id: string; coach_name: string | null; user_id: string; title: string; type: EventType; details: string | null;
  date: string; start_time: string | null; duration_min: number | null; status: AssignmentStatus; calendar_event_id: string | null;
  created_at: string; updated_at: string;
}
export interface AssignmentMessage {
  id: string; assignment_id: string; author_id: string; body: string | null; created_at: string; rating: number | null;
  proposal: { date?: string; start_time?: string | null; duration_min?: number | null; title?: string; details?: string } | null;
}
export interface AppNotification {
  id: string; user_id: string; sender_id: string | null; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string;
}
export interface CoachRow {
  user_id: string; name: string | null; role: Role; coach_id: string | null; coach_name: string | null; avatar_emoji: string | null; avatar_color: string | null; steps: number; walk_km: number; water_ml: number; water_target: number; sleep_min: number | null;
  sleep_target: number; calories: number; calorie_target: number; protein: number; protein_target: number; walk_target: number; steps_target: number;
  workout_done: boolean; resting_hr: number | null; stress_avg: number | null; open_assignments: number; last_log: string | null;
}

export interface DirectoryEntry { id: string; name: string | null; role: Role; coach_id: string | null; coach_name: string | null; avatar_emoji: string | null; avatar_color: string | null }
export interface GroupSession {
  id: string; created_by: string; creator_name: string | null; title: string; description: string | null; location: string | null;
  starts_at: string; ends_at: string; banner_path: string | null; audience: "everyone" | "my_members"; capacity: number | null;
  status: "scheduled" | "cancelled"; created_at: string;
}
export interface SessionRsvp { session_id: string; user_id: string; user_name: string | null; status: "going" | "maybe" | "not_going"; calendar_event_id: string | null; created_at: string }
