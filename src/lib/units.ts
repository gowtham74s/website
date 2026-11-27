import type { Profile } from "./types";

// Everything is stored metric (kg, cm, ml) and converted only for display/input.
const KG_LB = 2.20462;
const CM_IN = 0.393701;

export const wOut = (kg: number | null | undefined, p: Pick<Profile, "unit_weight">) =>
  kg == null ? null : p.unit_weight === "lbs" ? Math.round(kg * KG_LB * 10) / 10 : Math.round(kg * 10) / 10;
export const wIn = (v: number, p: Pick<Profile, "unit_weight">) => (p.unit_weight === "lbs" ? v / KG_LB : v);
export const wUnit = (p: Pick<Profile, "unit_weight">) => p.unit_weight;

export const lOut = (cm: number | null | undefined, p: Pick<Profile, "unit_length">) =>
  cm == null ? null : p.unit_length === "in" ? Math.round(cm * CM_IN * 10) / 10 : Math.round(cm * 10) / 10;
export const lIn = (v: number, p: Pick<Profile, "unit_length">) => (p.unit_length === "in" ? v / CM_IN : v);
export const lUnit = (p: Pick<Profile, "unit_length">) => p.unit_length;

export function vol(ml: number, p: Pick<Profile, "unit_volume">) {
  if (p.unit_volume === "l") return `${(ml / 1000).toFixed(ml % 1000 === 0 ? 1 : 2)} L`;
  if (p.unit_volume === "oz") return `${Math.round(ml / 29.5735)} oz`;
  return `${Math.round(ml)} ml`;
}
export const volIn = (v: number, p: Pick<Profile, "unit_volume">) => (p.unit_volume === "l" ? v * 1000 : p.unit_volume === "oz" ? v * 29.5735 : v);

export const fmtMin = (min: number) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? `${h}h ${m ? `${m}m` : ""}`.trim() : `${m}m`; };
export const fmtSec = (s: number) => { const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, "0")}`; };
export const fmtNum = (n: number, d = 0) => n.toLocaleString(undefined, { maximumFractionDigits: d });
