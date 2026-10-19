import { HydratedDocument } from "mongoose";
import { Alert, Equipment, IEstablishment, Lot, OilControl, Reading } from "../models";
import { EXPECTED_PER_FRYER } from "../domain/oil";
import { daysUntil } from "../domain/traceability";
import { nowInTz } from "../domain/time";
import { tasksForDay } from "./cleaningService";
import { presentEquipment } from "./presenters";

export type SummaryItem = { label: string; done: number; total: number };

/** Rassemble les données du jour d'un établissement (utilisé par le tableau de bord et les rapports). */
export async function collectDayData(est: HydratedDocument<IEstablishment>) {
  const now = new Date();
  const local = nowInTz(est.timezone, now);
  const startOfDay = new Date(now.getTime() - local.minutes * 60_000 - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds());
  const since30 = new Date(now.getTime() - 30 * 86_400_000);

  const [equipments, readings, cleaning, oil, lots, alerts] = await Promise.all([
    Equipment.find({ establishmentId: est._id, archived: false }).sort({ name: 1 }),
    Reading.find({ establishmentId: est._id, at: { $gte: startOfDay } }).sort({ at: -1 }),
    tasksForDay(est, local.date),
    OilControl.find({ establishmentId: est._id, dayKey: local.date }).sort({ at: -1 }),
    Lot.find({ establishmentId: est._id, state: "stock" }).sort({ dlc: 1 }),
    Alert.find({ establishmentId: est._id, createdAt: { $gte: since30 } }).sort({ createdAt: -1 }),
  ]);

  return { now, today: local.date, equipments, readings, cleaning, oil, lots, alerts };
}

export type DayData = Awaited<ReturnType<typeof collectDayData>>;

export function buildSummary(d: DayData): { items: SummaryItem[]; score: number } {
  const equipOk = d.equipments.filter((e) => presentEquipment(e).status === "ok").length;
  const readingsOk = d.readings.filter((r) => r.status === "ok").length;
  const tasksDone = d.cleaning.tasks.filter((t) => t.done).length;

  const fryers = d.equipments.filter((e) => e.type === "fryer");
  const oilDone = new Set(d.oil.map((c) => `${c.fryerId}-${c.slot}`)).size;
  const oilExpected = fryers.length * EXPECTED_PER_FRYER;

  const lotsValid = d.lots.filter((l) => daysUntil(l.dlc, d.today) >= 0).length;
  const alertsResolved = d.alerts.filter((a) => a.state === "resolved").length;

  const items: SummaryItem[] = [
    { label: "Équipements conformes", done: equipOk, total: d.equipments.length },
    { label: "Relevés conformes", done: readingsOk, total: d.readings.length },
    { label: "Tâches de nettoyage faites", done: tasksDone, total: d.cleaning.tasks.length },
    { label: "Contrôles d'huile faits", done: Math.min(oilDone, oilExpected), total: oilExpected },
    { label: "Lots en stock valides", done: lotsValid, total: d.lots.length },
    { label: "Alertes résolues (30 j)", done: alertsResolved, total: d.alerts.length },
  ];
  const ratios = items.filter((i) => i.total > 0).map((i) => i.done / i.total);
  const score = ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : 0;
  return { items, score };
}

export function buildProgress(d: DayData): SummaryItem[] {
  const fryers = d.equipments.filter((e) => e.type === "fryer");
  const oilDone = new Set(d.oil.map((c) => `${c.fryerId}-${c.slot}`)).size;
  const oilExpected = fryers.length * EXPECTED_PER_FRYER;
  const equipmentsRead = new Set(d.readings.map((r) => String(r.equipmentId))).size;
  return [
    { label: "Équipements relevés", done: equipmentsRead, total: d.equipments.length },
    { label: "Tâches de nettoyage", done: d.cleaning.tasks.filter((t) => t.done).length, total: d.cleaning.tasks.length },
    { label: "Contrôle huile de friture", done: Math.min(oilDone, oilExpected), total: oilExpected },
  ];
}

export async function buildDashboard(est: HydratedDocument<IEstablishment>) {
  const d = await collectDayData(est);
  const { items, score } = buildSummary(d);
  const presented = d.equipments.map(presentEquipment);
  const counts = { ok: 0, warn: 0, critical: 0, offline: 0 };
  presented.forEach((e) => (counts[e.status] += 1));

  const open = await Alert.find({ establishmentId: est._id, state: { $ne: "resolved" } });
  const critical = presented.find((e) => e.status === "critical") ?? null;

  return {
    date: d.today,
    score,
    summary: items,
    progress: buildProgress(d),
    equipmentCounts: { ...counts, total: presented.length },
    criticalEquipment: critical,
    alerts: {
      open: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      warn: open.filter((a) => a.severity === "warn").length,
      info: open.filter((a) => a.severity === "info").length,
    },
  };
}
