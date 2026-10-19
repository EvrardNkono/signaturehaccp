export type EquipmentType = "fridge" | "freezer" | "coldroom" | "fryer";
export type Status = "ok" | "warn" | "critical" | "offline";

export type Equipment = {
  id: string;
  name: string;
  type: EquipmentType;
  zone: string;
  temp: number | null;
  min: number;
  max: number;
  warnMargin: number;
  sensor: { battery: number; signal: number; online: boolean; pairing?: "paired" | "pending" | "none"; lastSeenAt?: string } | null;
  lastReadingAt: string | null; // ISO
  history: number[];
  /** Statut déjà calculé par l'API. */
  status?: Status;
  archived?: boolean;
};

export const typeLabels: Record<EquipmentType, string> = {
  fridge: "Réfrigérateur",
  freezer: "Congélateur",
  coldroom: "Chambre froide",
  fryer: "Friteuse",
};

export function statusForValue(t: number, e: Pick<Equipment, "min" | "max" | "warnMargin">): Exclude<Status, "offline"> {
  if (t > e.max || t < e.min) return "critical";
  if (t > e.max - e.warnMargin || t < e.min + e.warnMargin) return "warn";
  return "ok";
}

export function getStatus(e: Equipment): Status {
  if (e.status) return e.status;
  if (e.sensor && !e.sensor.online) return "offline";
  if (e.temp === null) return "offline";
  return statusForValue(e.temp, e);
}

export function formatTemp(t: number | null) {
  if (t === null) return "--";
  const s = t.toFixed(1).replace(".", ",");
  return `${t > 0 ? "+" : ""}${s}°C`;
}

export function formatRange(e: Pick<Equipment, "min" | "max">) {
  const f = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  return `${f(e.min)} à ${f(e.max)}°C`;
}
