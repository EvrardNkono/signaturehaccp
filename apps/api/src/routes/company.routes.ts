import { Router } from "express";
import { z } from "zod";
import { AuditLog, Company } from "../models";
import { getAuth, requireAccess } from "../middleware/auth";
import { hasAccess } from "../domain/permissions";
import { forbidden, notFound } from "../utils/httpError";
import { paginationQuery, pageMeta } from "../utils/pagination";
import { objectId } from "./helpers";
import { Types } from "mongoose";

const router = Router();

export const ONBOARDING_STEPS = ["establishment", "equipments", "team", "thresholds", "document"] as const;

router.get("/onboarding", async (req, res) => {
  const { companyId } = getAuth(req);
  const company = await Company.findById(companyId);
  if (!company) throw notFound();
  const done = company.onboarding?.completedSteps ?? [];
  res.json({ steps: ONBOARDING_STEPS, completedSteps: done, completed: ONBOARDING_STEPS.every((s) => done.includes(s)) });
});

const stepSchema = z.object({ completedSteps: z.array(z.enum(ONBOARDING_STEPS)).max(ONBOARDING_STEPS.length) });

router.put("/onboarding", async (req, res) => {
  const { user, companyId } = getAuth(req);
  if (!hasAccess(user.role, "parametres", "write")) throw forbidden("Action réservée aux administrateurs.", "INSUFFICIENT_ROLE");
  const { completedSteps } = stepSchema.parse(req.body);
  const unique = [...new Set(completedSteps)];
  await Company.updateOne({ _id: companyId }, { $set: { "onboarding.completedSteps": unique } });
  res.json({ steps: ONBOARDING_STEPS, completedSteps: unique, completed: ONBOARDING_STEPS.every((s) => unique.includes(s)) });
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
