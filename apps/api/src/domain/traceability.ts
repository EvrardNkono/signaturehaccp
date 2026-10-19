export const LOT_CATEGORIES = ["meat", "fish", "dairy", "veg", "dry", "other"] as const;
export type LotCategory = (typeof LOT_CATEGORIES)[number];

export const LOT_STATES = ["stock", "used", "discarded"] as const;
export type LotState = (typeof LOT_STATES)[number];

export type DlcStatus = "expired" | "today" | "soon" | "ok";

/** Température maximale à réception (°C). null = pas de contrôle. */
export const maxReceptionTemp: Record<LotCategory, number | null> = {
  meat: 4,
  fish: 2,
  dairy: 4,
  veg: null,
  dry: null,
  other: null,
};

export function isTempOk(category: LotCategory, temp: number | null | undefined): boolean {
  const max = maxReceptionTemp[category];
  if (max === null || temp === null || temp === undefined) return true;
  return temp <= max;
}

/** Jours entiers entre deux dates "YYYY-MM-DD" (dlc - today). */
export function daysUntil(dlc: string, today: string): number {
  const a = Date.UTC(+dlc.slice(0, 4), +dlc.slice(5, 7) - 1, +dlc.slice(8, 10));
  const b = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

export function getDlcStatus(days: number, soonDays: number): DlcStatus {
  if (days < 0) return "expired";
  if (days === 0) return "today";
  if (days <= soonDays) return "soon";
  return "ok";
}

export const isIsoDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
