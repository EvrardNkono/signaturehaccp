export const EQUIPMENT_TYPES = ["fridge", "freezer", "coldroom", "fryer"] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export type ReadingStatus = "ok" | "warn" | "critical";
export type EquipmentStatus = ReadingStatus | "offline";

export const PAIRING_STATES = ["paired", "pending", "none"] as const;
export type PairingState = (typeof PAIRING_STATES)[number];

export const DELETE_REASONS = ["breakdown", "replacement", "end_of_life", "other"] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

export type Thresholds = { min: number; max: number; warnMargin: number };

/** Même règle que le front (src/lib/equipment.ts). */
export function statusForValue(value: number, t: Thresholds): ReadingStatus {
  if (value > t.max || value < t.min) return "critical";
  if (value > t.max - t.warnMargin || value < t.min + t.warnMargin) return "warn";
  return "ok";
}

export function equipmentStatus(e: {
  temp: number | null;
  min: number;
  max: number;
  warnMargin: number;
  sensor?: { online: boolean } | null;
}): EquipmentStatus {
  if (e.sensor && !e.sensor.online) return "offline";
  if (e.temp === null || e.temp === undefined) return "offline";
  return statusForValue(e.temp, e);
}

/** Seuils par défaut à la création d'un équipement, selon le type et les réglages de l'établissement. */
export function defaultThresholds(
  type: EquipmentType,
  s: { coldroomMax: number; fridgeMax: number; freezerMax: number; warnMargin: number; oilMaxTemp: number }
): Thresholds {
  switch (type) {
    case "coldroom":
      return { min: 0, max: s.coldroomMax, warnMargin: s.warnMargin };
    case "fridge":
      return { min: 0, max: s.fridgeMax, warnMargin: s.warnMargin };
    case "freezer":
      return { min: -30, max: s.freezerMax, warnMargin: Math.max(1, s.warnMargin) };
    case "fryer":
      return { min: 150, max: s.oilMaxTemp, warnMargin: 5 };
  }
}
