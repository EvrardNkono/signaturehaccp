export type Category = "meat" | "fish" | "dairy" | "veg" | "dry" | "other";
export type LotState = "stock" | "used" | "discarded";
export type DlcStatus = "expired" | "today" | "soon" | "ok";

export type Lot = {
  id: string;
  product: string;
  supplier: string;
  lotNumber: string;
  category: Category;
  quantity: string;
  receivedAt: string; // "YYYY-MM-DD"
  dlc: string; // "YYYY-MM-DD"
  receptionTemp: number | null;
  note?: string;
  state: LotState;
  closedAt?: string;
  /** Calculés par l'API selon le fuseau et le réglage « DLC bientôt » de l'établissement. */
  daysLeft: number;
  dlcStatus: DlcStatus | null;
};

export type LotInput = {
  product: string;
  supplier: string;
  lotNumber: string;
  category: Category;
  quantity: string;
  dlc: string;
  receptionTemp: number | null;
  note?: string;
};

export const categoryLabels: Record<Category, string> = {
  meat: "Viande",
  fish: "Poisson",
  dairy: "Produits laitiers",
  veg: "Fruits et légumes",
  dry: "Épicerie",
  other: "Autre",
};

// Température maximale à réception (°C). null = pas de contrôle.
// Valeurs de référence : à ajuster selon votre plan de maîtrise sanitaire.
export const maxReceptionTemp: Record<Category, number | null> = {
  meat: 4,
  fish: 2,
  dairy: 4,
  veg: null,
  dry: null,
  other: null,
};

export const statusLabels: Record<DlcStatus, string> = {
  expired: "Périmé",
  today: "Expire aujourd'hui",
  soon: "Expire bientôt",
  ok: "Valide",
};

export const tone: Record<DlcStatus, { text: string; bar: string; chip: string }> = {
  expired: { text: "text-status-critical", bar: "bg-status-critical", chip: "bg-status-critical/10 text-status-critical" },
  today: { text: "text-status-critical", bar: "bg-status-critical", chip: "bg-status-critical/10 text-status-critical" },
  soon: { text: "text-status-warn", bar: "bg-status-warn", chip: "bg-status-warn/10 text-status-warn" },
  ok: { text: "text-status-ok", bar: "bg-status-ok", chip: "bg-status-ok/10 text-status-ok" },
};

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysUntil(dlc: string, today: string): number {
  const a = new Date(`${dlc}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function dayLabel(days: number): string {
  if (days < 0) return `Périmé depuis ${-days} j`;
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Demain";
  return `Dans ${days} j`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function parseTemp(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return input.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function isTempOk(category: Category, temp: number | null): boolean {
  const max = maxReceptionTemp[category];
  if (max === null || temp === null) return true;
  return temp <= max;
}
