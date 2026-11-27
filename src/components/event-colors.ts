import type { EventType } from "@/lib/types";
export const EVENT_COLORS: Record<EventType, string> = {
  workout: "#f59e0b", meal: "#10b981", water: "#22d3ee", walk: "#60a5fa", sleep: "#a78bfa", work: "#94a3b8",
  meeting: "#f472b6", personal: "#fb923c", recovery: "#34d399", study: "#facc15", other: "#9a9ca3",
};
export const EVENT_LABELS: Record<EventType, string> = {
  workout: "Workout", meal: "Meal", water: "Water", walk: "Walking", sleep: "Sleep", work: "Work", meeting: "Meeting",
  personal: "Personal", recovery: "Recovery", study: "Study", other: "Other",
};
