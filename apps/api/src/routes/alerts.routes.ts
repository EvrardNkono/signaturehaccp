import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Alert } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATES, MIN_ACTION_LENGTH, computeEscalation, requiresCorrectiveAction } from "../domain/alerts";
import { forbidden, notFound, unprocessable } from "../utils/httpError";
import { escapeRegex, oid } from "../utils/mongo";
import { pageMeta, paginationQuery } from "../utils/pagination";
import { presentAlert } from "../services/presenters";
import { audit } from "../services/audit";
import { objectId, requireRoleAtLeast } from "./helpers";

const router = Router({ mergeParams: true });

const sevOrder: Record<string, number> = { critical: 0, warn: 1, info: 2 };

router.get("/", async (req, res) => {
  const est = getEst(req);
  const q = paginationQuery
    .extend({
      state: z.enum([...ALERT_STATES, "active"] as [string, ...string[]]).default("active"),
      severity: z.enum(ALERT_SEVERITIES).optional(),
      kind: z.enum(ALERT_KINDS).optional(),
      equipmentId: objectId.optional(),
      search: z.string().trim().max(80).optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.state === "active") filter.state = { $ne: "resolved" };
  else filter.state = q.state;
  if (q.severity) filter.severity = q.severity;
  if (q.kind) filter.kind = q.kind;
  if (q.equipmentId) filter.equipmentId = q.equipmentId;
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: "i" };
    filter.$or = [{ title: rx }, { detail: rx }, { equipmentName: rx }];
  }

  const [total, rows, open] = await Promise.all([
    Alert.countDocuments(filter),
    Alert.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    Alert.find({ establishmentId: est._id, state: { $ne: "resolved" } }, { severity: 1, state: 1, createdAt: 1 }),
  ]);

  const now = new Date();
  // Tri métier : gravité d'abord, puis la plus ancienne en tête.
  const data = rows
    .map((a) => presentAlert(a, now))
    .sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity] || a.createdAt.localeCompare(b.createdAt));

  res.json({
    data,
    meta: pageMeta(total, q.page, q.limit),
    summary: {
      open: open.length,
      critical: open.filter((a) => a.severity === "critical").length,
      warn: open.filter((a) => a.severity === "warn").length,
      info: open.filter((a) => a.severity === "info").length,
      escalated: open.filter((a) => computeEscalation(a, now) > 0).length,
    },
  });
});

async function loadAlert(req: Parameters<typeof getEst>[0]) {
  const est = getEst(req);
  const alert = await Alert.findOne({ _id: oid(req.params.id, "Alerte"), establishmentId: est._id });
  if (!alert) throw notFound("Alerte introuvable.");
  return alert;
}

router.get("/:id", async (req, res) => res.json(presentAlert(await loadAlert(req))));

/** Prise en charge : l'alerte passe "en cours" et garde la trace de qui s'en occupe. */
router.post("/:id/take", requireAccess("alertes", "write"), async (req, res) => {
  const { userId, name } = getAuth(req);
  const alert = await loadAlert(req);
  if (alert.state === "resolved") throw unprocessable("Cette alerte est déjà résolue.", "ALERT_RESOLVED");
  if (alert.state === "in_progress") {
    if (String(alert.takenByUserId) === userId) return res.json(presentAlert(alert)); // idempotent
    throw unprocessable(`Déjà prise en charge par ${alert.takenBy}.`, "ALERT_TAKEN");
  }
  alert.state = "in_progress";
  alert.takenAt = new Date();
  alert.takenBy = name;
  alert.takenByUserId = new Types.ObjectId(userId);
  await alert.save();
  await audit(req, { action: "alert.take", entity: "alert", entityId: String(alert._id) });
  res.json(presentAlert(alert));
});

/** Libère une alerte prise en charge (par son auteur, ou par un responsable). */
router.post("/:id/release", requireAccess("alertes", "write"), async (req, res) => {
  const { userId, user } = getAuth(req);
  const alert = await loadAlert(req);
  if (alert.state !== "in_progress") throw unprocessable("Cette alerte n'est pas en cours.", "NOT_IN_PROGRESS");
  const isOwner = String(alert.takenByUserId) === userId;
  if (!isOwner && !["super_admin", "admin", "manager"].includes(user.role)) {
    throw forbidden("Seul l'auteur ou un responsable peut libérer l'alerte.", "INSUFFICIENT_ROLE");
  }
  alert.state = "open";
  alert.takenAt = null;
  alert.takenBy = undefined;
  alert.takenByUserId = null;
  await alert.save();
  await audit(req, { action: "alert.release", entity: "alert", entityId: String(alert._id) });
  res.json(presentAlert(alert));
});

const resolveSchema = z.object({ correctiveAction: z.string().trim().max(1000).optional() });

/** Résolution : action corrective obligatoire pour les alertes critiques et d'attention (preuve réglementaire). */
router.post("/:id/resolve", requireAccess("alertes", "write"), async (req, res) => {
  const { userId, name } = getAuth(req);
  const alert = await loadAlert(req);
  const { correctiveAction } = resolveSchema.parse(req.body ?? {});
  if (alert.state === "resolved") throw unprocessable("Cette alerte est déjà résolue.", "ALERT_RESOLVED");
  if (requiresCorrectiveAction(alert.severity) && (correctiveAction?.length ?? 0) < MIN_ACTION_LENGTH) {
    throw unprocessable("Une action corrective est obligatoire.", "ACTION_REQUIRED", { field: "correctiveAction" });
  }
  alert.state = "resolved";
  alert.resolvedAt = new Date();
  alert.resolvedBy = name;
  alert.resolvedByUserId = new Types.ObjectId(userId);
  if (correctiveAction) alert.correctiveAction = correctiveAction;
  await alert.save();
  await audit(req, { action: "alert.resolve", entity: "alert", entityId: String(alert._id), meta: { severity: alert.severity, correctiveAction } });
  res.json(presentAlert(alert));
});

/** Réouverture : réservée aux responsables. Le motif initial de résolution reste dans le journal d'audit. */
router.post("/:id/reopen", requireAccess("alertes", "write"), requireRoleAtLeast("manager"), async (req, res) => {
  const alert = await loadAlert(req);
  if (alert.state !== "resolved") throw unprocessable("Cette alerte n'est pas résolue.", "NOT_RESOLVED");
  alert.state = "open";
  alert.resolvedAt = null;
  alert.resolvedBy = undefined;
  alert.resolvedByUserId = null;
  alert.takenAt = null;
  alert.takenBy = undefined;
  alert.takenByUserId = null;
  await alert.save();
  await audit(req, { action: "alert.reopen", entity: "alert", entityId: String(alert._id) });
  res.json(presentAlert(alert));
});

export default router;
