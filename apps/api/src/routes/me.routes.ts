import { Router } from "express";
import { HydratedDocument } from "mongoose";
import { z } from "zod";
import { IUser, User } from "../models";
import { getAuth } from "../middleware/auth";
import { GUIDE_STATUSES, GUIDE_STEPS } from "../domain/guide";
import { notFound } from "../utils/httpError";

/**
 * Espace personnel de l'utilisateur connecté. Ouvert à tous les rôles : chacun a son propre guide,
 * indépendamment de l'entreprise (contrairement à /company/onboarding, réservé à la configuration admin).
 */
const router = Router();

function presentGuide(user: HydratedDocument<IUser> | IUser) {
  const g = user.guide;
  return {
    steps: GUIDE_STEPS,
    status: g?.status ?? "active",
    seenSteps: g?.seenSteps ?? [],
    checklistHidden: g?.checklistHidden ?? false,
    lastStartedAt: g?.lastStartedAt ? g.lastStartedAt.toISOString() : null,
  };
}

router.get("/guide", async (req, res) => {
  res.json(presentGuide(getAuth(req).user));
});

const updateSchema = z
  .object({
    status: z.enum(GUIDE_STATUSES),
    seenSteps: z.array(z.enum(GUIDE_STEPS)).max(GUIDE_STEPS.length),
    checklistHidden: z.boolean(),
  })
  .partial();

/** Mise à jour partielle : seuls les champs envoyés changent. `seenSteps` remplace la liste (doublons retirés). */
router.put("/guide", async (req, res) => {
  const { userId } = getAuth(req);
  const body = updateSchema.parse(req.body ?? {});
  const set: Record<string, unknown> = { "guide.updatedAt": new Date() };
  if (body.status !== undefined) set["guide.status"] = body.status;
  if (body.seenSteps !== undefined) set["guide.seenSteps"] = [...new Set(body.seenSteps)];
  if (body.checklistHidden !== undefined) set["guide.checklistHidden"] = body.checklistHidden;

  const user = await User.findByIdAndUpdate(userId, { $set: set }, { new: true });
  if (!user) throw notFound("Utilisateur introuvable.");
  res.json(presentGuide(user));
});

/** Relance le guide depuis le début (bouton « Revoir la visite »). */
router.post("/guide/reset", async (req, res) => {
  const { userId } = getAuth(req);
  const now = new Date();
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { "guide.status": "active", "guide.seenSteps": [], "guide.checklistHidden": false, "guide.lastStartedAt": now, "guide.updatedAt": now } },
    { new: true }
  );
  if (!user) throw notFound("Utilisateur introuvable.");
  res.json(presentGuide(user));
});

export default router;
