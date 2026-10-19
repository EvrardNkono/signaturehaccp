export type OilStatus = "ok" | "warn" | "change";
export type Slot = "morning" | "evening";
export type Aspect = "normal" | "dark" | "foam" | "smell";

export type OilControl = {
  id: string;
  fryerId: string;
  fryerName: string;
  slot: Slot;
  dayKey: string; // "YYYY-MM-DD" dans le fuseau de l'établissement
  at: string; // ISO
  temp: number;
  polar: number; // taux de composés polaires, en %
  aspect: Aspect;
  status: OilStatus;
  by: string;
  action?: string;
};

/** Vue d'une friteuse (GET /oil/fryers). */
export type Fryer = {
  id: string;
  name: string;
  zone: string;
  lastControl: OilControl | null;
  slotsDone: Slot[];
  expected: number;
  lastChangeAt: string | null;
};

export type OilLimits = { polarWarn: number; polarLimit: number; oilMaxTemp: number };

export type OilInput = {
  fryerId: string;
  slot: Slot;
  temp: number;
  polar: number;
  aspect: Aspect;
  action?: string;
};

// Valeurs par défaut ; les seuils réels de l'établissement viennent de l'API (GET /oil/fryers → limits).
export const DEFAULT_LIMITS: OilLimits = { polarWarn: 22, polarLimit: 25, oilMaxTemp: 180 };
export const EXPECTED_PER_FRYER = 2; // matin et soir

export const slotLabels: Record<Slot, string> = { morning: "Matin", evening: "Soir" };

export const aspectLabels: Record<Aspect, string> = {
  normal: "Normal",
  dark: "Huile foncée",
  foam: "Mousse excessive",
  smell: "Odeur forte",
};

export const statusLabels: Record<OilStatus, string> = {
  ok: "Conforme",
  warn: "À surveiller",
  change: "Huile à changer",
};

export const tone: Record<OilStatus, { text: string; bar: string; chip: string }> = {
  ok: { text: "text-status-ok", bar: "bg-status-ok", chip: "bg-status-ok/10 text-status-ok" },
  warn: { text: "text-status-warn", bar: "bg-status-warn", chip: "bg-status-warn/10 text-status-warn" },
  change: { text: "text-status-critical", bar: "bg-status-critical", chip: "bg-status-critical/10 text-status-critical" },
};

export function getOilStatus(polar: number, temp: number, aspect: Aspect, l: OilLimits = DEFAULT_LIMITS): OilStatus {
  if (polar >= l.polarLimit) return "change";
  if (polar >= l.polarWarn || temp > l.oilMaxTemp || aspect !== "normal") return "warn";
  return "ok";
}

export function parseNumber(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return input.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function formatPolar(n: number): string {
  return `${n.toFixed(1).replace(".", ",")} %`;
}
