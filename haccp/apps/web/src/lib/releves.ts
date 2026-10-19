import { Equipment, formatRange, formatTemp, statusForValue } from "@/lib/equipment";

export type ReadingStatus = "ok" | "warn" | "critical";

export type Reading = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  value: number;
  status: ReadingStatus;
  source: "manual" | "iot";
  at: string; // ISO
  by: string;
  action?: string;
};

export { formatRange, formatTemp };

export function getStatus(value: number, e: Equipment): ReadingStatus {
  return statusForValue(value, e);
}

export function parseTemp(input: string): number | null {
  const n = Number(input.trim().replace(",", "."));
  return input.trim() !== "" && Number.isFinite(n) ? n : null;
}

export const statusLabels: Record<ReadingStatus, string> = {
  ok: "Conforme",
  warn: "À surveiller",
  critical: "Critique",
};
