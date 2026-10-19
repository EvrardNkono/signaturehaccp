import { HydratedDocument, Types } from "mongoose";
import { Alert, Establishment, IAlert, IEstablishment, User } from "../models";
import { ALERT_SEVERITIES, AlertKind, AlertSeverity } from "../domain/alerts";
import { nowInTz, toMinutes } from "../domain/time";
import { allowedEstablishmentIds } from "../domain/permissions";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { buildAlertEmail, sendMail } from "./mail";

export type RaiseInput = {
  establishmentId: Types.ObjectId;
  severity: AlertSeverity;
  kind: AlertKind;
  title: string;
  detail: string;
  equipmentId?: Types.ObjectId | null;
  equipmentName?: string;
  zone?: string;
  value?: string;
  threshold?: string;
  dedupeKey: string;
};

const sevRank = (s: AlertSeverity) => ALERT_SEVERITIES.length - ALERT_SEVERITIES.indexOf(s); // critical=3, warn=2, info=1
const severityLabel: Record<AlertSeverity, string> = { critical: "Critique", warn: "Attention", info: "Info" };

/**
 * Crée une alerte, ou met à jour l'alerte déjà ouverte pour la même cause (déduplication par dedupeKey).
 * Une alerte déjà ouverte n'est jamais dupliquée ; sa gravité peut seulement monter.
 */
export async function raiseAlert(input: RaiseInput): Promise<{ alert: HydratedDocument<IAlert>; created: boolean }> {
  const existing = await Alert.findOne({
    establishmentId: input.establishmentId,
    dedupeKey: input.dedupeKey,
    state: { $ne: "resolved" },
  });

  if (existing) {
    const upgraded = sevRank(input.severity) > sevRank(existing.severity);
    if (upgraded) existing.severity = input.severity;
    existing.title = input.title;
    existing.detail = input.detail;
    if (input.value !== undefined) existing.value = input.value;
    if (input.threshold !== undefined) existing.threshold = input.threshold;
    await existing.save();
    if (upgraded) void notifyAlert(existing);
    return { alert: existing, created: false };
  }

  const alert = await Alert.create({ ...input, state: "open", source: "auto" });
  void notifyAlert(alert);
  return { alert, created: true };
}

/** Clôture automatique d'alertes dont la cause a disparu (ex. capteur reconnecté). */
export async function autoResolve(establishmentId: Types.ObjectId, dedupeKey: string, action: string): Promise<number> {
  const res = await Alert.updateMany(
    { establishmentId, dedupeKey, state: { $ne: "resolved" } },
    { $set: { state: "resolved", resolvedAt: new Date(), resolvedBy: "Système", correctiveAction: action } }
  );
  return res.modifiedCount ?? 0;
}

function inQuietHours(est: IEstablishment, now = new Date()): boolean {
  const q = est.notificationPrefs?.quietHours;
  if (!q?.enabled) return false;
  const cur = nowInTz(est.timezone, now).minutes;
  const from = toMinutes(q.from);
  const to = toMinutes(q.to);
  return from < to ? cur >= from && cur < to : cur >= from || cur < to;
}

/**
 * Notification e-mail immédiate. Règles :
 *  - respecte les canaux, niveaux et la fréquence choisis dans les paramètres de l'établissement ;
 *  - les alertes critiques passent toujours, même pendant les heures calmes (sécurité alimentaire) ;
 *  - destinataires : administrateurs et responsables ayant accès à l'établissement + destinataires supplémentaires.
 * Les erreurs sont journalisées et ne remontent jamais à l'appelant.
 */
export async function notifyAlert(alert: HydratedDocument<IAlert>): Promise<void> {
  try {
    const est = await Establishment.findById(alert.establishmentId);
    if (!est) return;
    const prefs = est.notificationPrefs;
    if (!prefs.channels.email || !prefs.byLevel[alert.severity] || prefs.frequency !== "immediate") return;
    if (alert.severity !== "critical" && inQuietHours(est)) return;

    const users = await User.find({ companyId: est.companyId, active: true, role: { $in: ["super_admin", "admin", "manager"] } });
    const emails = new Set<string>(prefs.extraRecipients ?? []);
    for (const u of users) {
      const allowed = allowedEstablishmentIds({
        role: u.role,
        primaryEstablishmentId: u.primaryEstablishmentId ? String(u.primaryEstablishmentId) : null,
        authorizedEstablishmentIds: u.authorizedEstablishmentIds.map(String),
      });
      if (allowed === null || allowed.includes(String(est._id))) emails.add(u.email);
    }
    if (emails.size === 0) return;

    const mail = buildAlertEmail({
      establishment: est.name,
      severityLabel: severityLabel[alert.severity],
      title: alert.title,
      detail: alert.detail,
      equipment: alert.equipmentName,
      value: alert.value,
      threshold: alert.threshold,
      link: `${env.APP_URL}/alertes`,
    });
    await sendMail({ to: [...emails], ...mail });
  } catch (err) {
    logger.error({ err, alertId: String(alert._id) }, "Échec de l'envoi de la notification d'alerte");
  }
}

export type EstDoc = HydratedDocument<IEstablishment>;
