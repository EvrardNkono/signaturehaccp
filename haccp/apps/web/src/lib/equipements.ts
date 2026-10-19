import { hhmm } from "@/lib/time";

export type Point = { time: string; value: number };

/** Point d'historique renvoyé par GET /equipments/:id/history. */
export type HistoryPoint = { at: string; value: number; status: "ok" | "warn" | "critical"; source: "manual" | "iot" };

export type EquipmentHistory = {
  equipmentId: string;
  min: number;
  max: number;
  points: HistoryPoint[];
  stats: { min: number; max: number; avg: number } | null;
};

export function toPoints(points: HistoryPoint[], tz?: string): Point[] {
  return points.map((p) => ({ time: hhmm(p.at, tz), value: p.value }));
}
