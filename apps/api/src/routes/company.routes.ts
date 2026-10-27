import { Router } from "express";
import { z } from "zod";
import { AuditLog, Company, DocumentModel, Equipment, Establishment, User } from "../models";
import { getAuth, requireAccess } from "../middleware/auth";
import { hasAccess } from "../domain/permissions";
import { forbidden, notFound } from "../utils/httpError";
import { paginationQuery, pageMeta } from "../utils/pagination";
import { objectId } from "./helpers";
import { Types } from "mongoose";

const router = Router();

export const ONBOARDING_STEPS = ["establishment", "equipments", "team", "thresholds", "document"] as const;

/**
 * Étapes de démarrage déjà accomplies d'après les données réelles de l'entreprise (rien à cocher à la main).
 * Une étape reste aussi valide si un administrateur l'a confirmée à la main (PUT).
 */
async function detectSteps(companyId: string): Promise<string[]> {
  const cid = new Types.ObjectId(companyId);
  const estIds = (await Establishment.find({ companyId: cid, active: true }).select("_id")).map((e) => e._id);
  const detected: string[] = [];
  if (estIds.length > 0) detected.push("establishment");
  if (estIds.length === 0) return detected;

  const [equipments, members, thresholds, documents] = await Promise.all([
    Equipment.countDocuments({ establishmentId: { $in: estIds }, archived: false }),
    User.countDocuments({ companyId: cid, active: true }),
    AuditLog.countDocuments({ companyId: cid, action: "equipment.thresholds_change" }),
    DocumentModel.countDocuments({ establishmentId: { $in: estIds }, archived: false }),
  ]);
  if (equipments > 0) detected.push("equipments");
  if (members > 1) detected.push("team");
  if (thresholds > 0) detected.push("thresholds");
  if (documents > 0) detected.push("document");
  return detected;
}

router.get("/onboarding", async (req, res) => {
  const { companyId } = getAuth(req);
  const company = await Company.findById(companyId);
  if (!company) throw notFound();
  const done = company.onboarding?.completedSteps ?? [];
  const detected = await detectSteps(companyId);
  const all = new Set([...done, ...detected]);
  res.json({
    steps: ONBOARDING_STEPS,
    completedSteps: done,
    detectedSteps: detected,
    completed: ONBOARDING_STEPS.every((s) => all.has(s)),
  });
});

const stepSchema = z.object({ completedSteps: z.array(z.enum(ONBOARDING_STEPS)).max(ONBOARDING_STEPS.length) });

router.put("/onboarding", async (req, res) => {
  const { user, companyId } = getAuth(req);
  if (!hasAccess(user.role, "parametres", "write")) throw forbidden("Action réservée aux administrateurs.", "INSUFFICIENT_ROLE");
  const { completedSteps } = stepSchema.parse(req.body);
  const unique = [...new Set(completedSteps)];
  await Company.updateOne({ _id: companyId }, { $set: { "onboarding.completedSteps": unique } });
  const detected = await detectSteps(companyId);
  const all = new Set([...unique, ...detected]);
  res.json({ steps: ONBOARDING_STEPS, completedSteps: unique, detectedSteps: detected, completed: ONBOARDING_STEPS.every((s) => all.has(s)) });
});

/** Journal d'audit de l'entreprise (lecture : administrateurs et contrôleurs externes via le module "rapports"). */
router.get("/audit-logs", requireAccess("rapports", "read"), async (req, res) => {
  const { user, companyId } = getAuth(req);
  if (!["super_admin", "admin", "auditor"].includes(user.role)) throw forbidden("Journal réservé aux administrateurs et contrôleurs.", "INSUFFICIENT_ROLE");
  const q = paginationQuery
    .extend({ establishmentId: objectId.optional(), action: z.string().trim().max(60).optional(), userId: objectId.optional() })
    .parse(req.query);

  const filter: Record<string, unknown> = { companyId: new Types.ObjectId(companyId) };
  if (q.establishmentId) filter.establishmentId = new Types.ObjectId(q.establishmentId);
  if (q.userId) filter.userId = new Types.ObjectId(q.userId);
  if (q.action) filter.action = { $regex: `^${q.action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` };

  const [total, rows] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
  ]);
  res.json({
    data: rows.map((r) => ({
      id: String(r._id),
      at: r.at.toISOString(),
      userName: r.userName,
      userId: r.userId ? String(r.userId) : undefined,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      establishmentId: r.establishmentId ? String(r.establishmentId) : undefined,
      meta: r.meta,
    })),
    meta: pageMeta(total, q.page, q.limit),
  });
});

export default router;
