export const OIL_SLOTS = ["morning", "evening"] as const;
export type OilSlot = (typeof OIL_SLOTS)[number];

export const OIL_ASPECTS = ["normal", "dark", "foam", "smell"] as const;
export type OilAspect = (typeof OIL_ASPECTS)[number];

export type OilStatus = "ok" | "warn" | "change";

export const EXPECTED_PER_FRYER = 2; // matin et soir

export type OilLimits = { polarWarn: number; polarLimit: number; oilMaxTemp: number };

export function getOilStatus(polar: number, temp: number, aspect: OilAspect, l: OilLimits): OilStatus {
  if (polar >= l.polarLimit) return "change";
  if (polar >= l.polarWarn || temp > l.oilMaxTemp || aspect !== "normal") return "warn";
  return "ok";
}
