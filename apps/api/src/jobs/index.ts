import cron from "node-cron";
import { Alert, CleaningTask, Equipment, Establishment, Lot, RefreshToken, CleaningCompletion } from "../models";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { daysUntil, getDlcStatus } from "../domain/traceability";
import { isoWeekKey, nowInTz, toMinutes } from "../domain/time";
import { raiseAlert } from "../services/alertService";
import { formatTemp } from "../domain/format";

/** Capteurs sans nouvelles : le capteur passe hors ligne et une alerte critique est levée. */
export async function sensorWatchdog(now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - env.SENSOR_OFFLINE_MINUTES * 60_000);
  const stale = await Equipment.find({
    archived: false,
    "sensor.pairing": "paired",
    $or: [{ "sensor.lastSeenAt": { $lt: limit } }, { "sensor.lastSeenAt": null, createdAt: { $lt: limit } }],
  });

  let raised = 0;
  for (const e of stale) {
    if (!e.sensor) continue;
    if (e.sensor.online) await Equipment.updateOne({ _id: e._id }, { $set: { "sensor.online": false } });
    const since = e.sensor.lastSeenAt ? `Dernier signal : ${e.sensor.lastSeenAt.toISOString()}` : "Aucun signal reçu";
    const { created } = await raiseAlert({
      establishmentId: e.establishmentId,
      severity: "critical",
      kind: "sensor",
      title: "Capteur hors ligne",
      detail: `Le capteur ne répond plus depuis plus de ${env.SENSOR_OFFLINE_MINUTES} minutes. ${since}. Relever la température manuellement.`,
      equipmentId: e._id,
      equipmentName: e.name,
      zone: e.zone,
      value: e.temp !== null ? `Dernier : ${formatTemp(e.temp)}` : undefined,
      dedupeKey: `sensor-offline:${e._id}`,
    });
    if (created) raised += 1;
  }
  return raised;
}

/** DLC : lots périmés, du jour ou proches de l'échéance. */
export async function dlcWatcher(now = new Date()): Promise<number> {
  const establishments = await Establishment.find({ active: true });
  let raised = 0;
  for (const est of establishments) {
    const today = nowInTz(est.timezone, now).date;
    const lots = await Lot.find({ establishmentId: est._id, state: "stock" });
    for (const lot of lots) {
      const days = daysUntil(lot.dlc, today);
      const status = getDlcStatus(days, est.settings.dlcSoonDays);
      if (status === "ok") continue;
      const expired = status === "expired";
      const label = expired ? `périmé depuis ${-days} j` : status === "today" ? "expire aujourd'hui" : `expire dans ${days} j`;
      const { created } = await raiseAlert({
        establishmentId: est._id,
        severity: status === "soon" ? "warn" : "critical",
        kind: "dlc",
        title: expired ? "Produit périmé en stock" : status === "today" ? "DLC atteinte aujourd'hui" : "DLC proche",
        detail: `${lot.product} (lot ${lot.lotNumber}, ${lot.supplier}) ${label}.`,
        value: lot.dlc,
        dedupeKey: `dlc:${lot._id}`,
      });
      if (created) raised += 1;
    }
  }
  // Lots sortis du stock : l'alerte DLC n'a plus d'objet.
  const closed = await Lot.find({ state: { $ne: "stock" } }, { _id: 1 });
  if (closed.length) {
    await Alert.updateMany(
      { kind: "dlc", state: { $ne: "resolved" }, dedupeKey: { $in: closed.map((l) => `dlc:${l._id}`) } },
      { $set: { state: "resolved", resolvedAt: new Date(), resolvedBy: "Système", correctiveAction: "Lot sorti du stock (utilisé ou jeté)." } }
    );
  }
  return raised;
}

/** Nettoyage en retard : tâche non validée après son heure limite (hebdomadaires : contrôlées le dimanche). */
export async function cleaningWatcher(now = new Date()): Promise<number> {
  const establishments = await Establishment.find({ active: true });
  let raised = 0;
  for (const est of establishments) {
    const local = nowInTz(est.timezone, now);
    const tasks = await CleaningTask.find({ establishmentId: est._id, active: true });
    for (const t of tasks) {
      if (local.minutes < toMinutes(t.dueTime)) continue;
      if (t.frequency === "weekly" && !local.isSunday) continue;
      const periodKey = t.frequency === "weekly" ? isoWeekKey(local.date) : local.date;
      if (await CleaningCompletion.exists({ taskId: t._id, periodKey })) continue;
      const { created } = await raiseAlert({
        establishmentId: est._id,
        severity: "warn",
        kind: "cleaning",
        title: "Nettoyage en retard",
        detail: `${t.title} (${t.zone}) devait être validé avant ${t.dueTime}.`,
        zone: t.zone,
        dedupeKey: `cleaning:${t._id}:${periodKey}`,
      });
      if (created) raised += 1;
    }
  }
  return raised;
}

/** Purge des jetons de rafraîchissement expirés ou révoqués depuis plus de 30 jours. */
export async function purgeTokens(now = new Date()): Promise<number> {
  const res = await RefreshToken.deleteMany({
    $or: [{ expiresAt: { $lt: now } }, { revokedAt: { $lt: new Date(now.getTime() - 30 * 86_400_000) } }],
  });
  return res.deletedCount ?? 0;
}

async function safely(name: string, fn: () => Promise<number>) {
  try {
    const n = await fn();
    if (n > 0) logger.info({ job: name, count: n }, "Tâche planifiée terminée");
  } catch (err) {
    logger.error({ err, job: name }, "Échec de la tâche planifiée");
  }
}

export function startJobs(): () => void {
  const tasks = [
    cron.schedule("*/5 * * * *", () => void safely("sensorWatchdog", () => sensorWatchdog())),
    cron.schedule("*/15 * * * *", () => void safely("cleaningWatcher", () => cleaningWatcher())),
    cron.schedule("5 * * * *", () => void safely("dlcWatcher", () => dlcWatcher())),
    cron.schedule("30 3 * * *", () => void safely("purgeTokens", () => purgeTokens())),
  ];
  logger.info("Tâches planifiées démarrées (capteurs, nettoyage, DLC, purge)");
  return () => tasks.forEach((t) => t.stop());
}
