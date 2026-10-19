import { Router, Request } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Company, Establishment, User } from "../models";
import { getAuth, requireAccess } from "../middleware/auth";
import { USER_ROLES, UserRole, allowedEstablishmentIds, canAssignRole, roleLevel } from "../domain/permissions";
import { HttpError, forbidden, notFound, unprocessable } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { hashPassword, randomToken, sha256 } from "../utils/password";
import { presentUser } from "../services/presenters";
import { audit } from "../services/audit";
import { revokeAllForUser } from "../services/tokens";
import { buildInviteEmail, sendMail } from "../services/mail";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { objectId } from "./helpers";

const router = Router();

const base = z.object({
  firstName: z.string().trim().min(1, "Prénom obligatoire.").max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160),
  role: z.enum(USER_ROLES),
  primaryEstablishmentId: objectId.nullish(),
  authorizedEstablishmentIds: z.array(objectId).max(100).default([]),
});

/** Vérifie que les établissements désignés appartiennent à l'entreprise ET sont accessibles à celui qui les attribue. */
async function checkEstablishments(req: Request, ids: string[]) {
  const { user, companyId } = getAuth(req);
  if (ids.length === 0) return;
  const found = await Establishment.countDocuments({ _id: { $in: ids }, companyId });
  if (found !== new Set(ids).size) throw unprocessable("Établissement inconnu.", "ESTABLISHMENT_UNKNOWN");
  const mine = allowedEstablishmentIds({
    role: user.role,
    primaryEstablishmentId: user.primaryEstablishmentId ? String(user.primaryEstablishmentId) : null,
    authorizedEstablishmentIds: user.authorizedEstablishmentIds.map(String),
  });
  if (mine !== null && ids.some((i) => !mine.includes(i))) {
    throw forbidden("Vous ne pouvez attribuer que vos propres établissements.", "ESTABLISHMENT_FORBIDDEN");
  }
}

function normalizeScope(role: UserRole, primary: string | null | undefined, authorized: string[]) {
  if (role === "super_admin") return { primary: null, authorized: [] as string[] };
  if (role === "operator") {
    if (!primary) throw unprocessable("Un opérateur doit avoir un établissement principal.", "PRIMARY_REQUIRED", { field: "primaryEstablishmentId" });
    return { primary, authorized: [] as string[] };
  }
  if (authorized.length === 0) throw unprocessable("Choisissez au moins un établissement.", "ESTABLISHMENT_REQUIRED", { field: "authorizedEstablishmentIds" });
  return { primary: null, authorized: [...new Set(authorized)] };
}

async function sendInvite(inviterName: string, companyId: unknown, user: InstanceType<typeof User>) {
  const token = randomToken(32);
  user.passwordResetTokenHash = sha256(token);
  user.passwordResetExpires = new Date(Date.now() + 7 * 86_400_000);
  user.mustChangePassword = true;
  await user.save();
  const company = await Company.findById(companyId);
  const link = `${env.APP_URL}/reinitialiser-mot-de-passe?token=${token}&invitation=1`;
  sendMail({ to: user.email, ...buildInviteEmail(user.firstName, inviterName, company?.name ?? "votre entreprise", link) }).catch((err) =>
    logger.error({ err }, "Échec d'envoi de l'invitation")
  );
}

router.get("/", requireAccess("utilisateurs", "read"), async (req, res) => {
  const { companyId } = getAuth(req);
  const q = z.object({ role: z.enum(USER_ROLES).optional(), active: z.enum(["true", "false"]).optional(), search: z.string().trim().max(80).optional() }).parse(req.query);
  const filter: Record<string, unknown> = { companyId };
  if (q.role) filter.role = q.role;
  if (q.active) filter.active = q.active === "true";
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  const users = await User.find(filter).sort({ lastName: 1, firstName: 1 });
  res.json({ data: users.map(presentUser) });
});

router.post("/", requireAccess("utilisateurs", "write"), async (req, res) => {
  const { user: actor, companyId, name } = getAuth(req);
  const body = base.parse(req.body);

  if (!canAssignRole(actor.role, body.role)) throw forbidden("Vous ne pouvez pas attribuer ce rôle.", "ROLE_NOT_ASSIGNABLE");
  const scope = normalizeScope(body.role, body.primaryEstablishmentId, body.authorizedEstablishmentIds);
  await checkEstablishments(req, [...(scope.primary ? [scope.primary] : []), ...scope.authorized]);
  if (await User.exists({ email: body.email })) throw new HttpError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");

  const user = await User.create({
    companyId,
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    role: body.role,
    primaryEstablishmentId: scope.primary,
    authorizedEstablishmentIds: scope.authorized,
    passwordHash: await hashPassword(randomToken(24)), // mot de passe aléatoire : la personne le choisit via le lien d'invitation
    mustChangePassword: true,
  });
  await sendInvite(name, companyId, user);
  await audit(req, { action: "user.create", entity: "user", entityId: String(user._id), meta: { role: user.role, email: user.email } });
  res.status(201).json(presentUser(user));
});

async function loadTarget(req: Request) {
  const { companyId } = getAuth(req);
  const target = await User.findOne({ _id: oid(req.params.id, "Utilisateur"), companyId });
  if (!target) throw notFound("Utilisateur introuvable.");
  return target;
}

function assertCanManage(actorRole: UserRole, actorId: string, target: { _id: unknown; role: UserRole }) {
  if (actorRole !== "super_admin" && roleLevel[target.role] >= roleLevel[actorRole] && String(target._id) !== actorId) {
    throw forbidden("Vous ne pouvez pas modifier un utilisateur de rang supérieur ou égal.", "ROLE_NOT_ASSIGNABLE");
  }
}

async function assertNotLastSuperAdmin(companyId: string, target: { _id: unknown; role: UserRole; active: boolean }) {
  if (target.role !== "super_admin" || !target.active) return;
  const others = await User.countDocuments({ companyId, role: "super_admin", active: true, _id: { $ne: target._id } });
  if (others === 0) throw unprocessable("Il doit rester au moins un super administrateur actif.", "LAST_SUPER_ADMIN");
}

router.get("/:id", requireAccess("utilisateurs", "read"), async (req, res) => {
  res.json(presentUser(await loadTarget(req)));
});

const patchSchema = base.partial().extend({ active: z.boolean().optional() });

router.patch("/:id", requireAccess("utilisateurs", "write"), async (req, res) => {
  const { user: actor, userId, companyId } = getAuth(req);
  const target = await loadTarget(req);
  const body = patchSchema.parse(req.body);
  assertCanManage(actor.role, userId, target);

  const isSelf = String(target._id) === userId;
  if (isSelf && (body.role !== undefined && body.role !== target.role)) throw forbidden("Vous ne pouvez pas modifier votre propre rôle.", "SELF_ROLE_CHANGE");
  if (isSelf && body.active === false) throw forbidden("Vous ne pouvez pas désactiver votre propre compte.", "SELF_DEACTIVATE");

  const nextRole = body.role ?? target.role;
  if (body.role !== undefined && body.role !== target.role && !canAssignRole(actor.role, body.role)) {
    throw forbidden("Vous ne pouvez pas attribuer ce rôle.", "ROLE_NOT_ASSIGNABLE");
  }
  if ((body.role !== undefined && body.role !== "super_admin") || body.active === false) {
    await assertNotLastSuperAdmin(companyId, target);
  }

  if (body.email && body.email !== target.email) {
    if (await User.exists({ email: body.email, _id: { $ne: target._id } })) throw new HttpError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
    target.email = body.email;
  }
  if (body.firstName !== undefined) target.firstName = body.firstName;
  if (body.lastName !== undefined) target.lastName = body.lastName;

  if (body.role !== undefined || body.primaryEstablishmentId !== undefined || body.authorizedEstablishmentIds !== undefined) {
    const primary = body.primaryEstablishmentId !== undefined ? body.primaryEstablishmentId : target.primaryEstablishmentId ? String(target.primaryEstablishmentId) : null;
    const authorized = body.authorizedEstablishmentIds ?? target.authorizedEstablishmentIds.map(String);
    const scope = normalizeScope(nextRole, primary, authorized);
    await checkEstablishments(req, [...(scope.primary ? [scope.primary] : []), ...scope.authorized]);
    target.role = nextRole;
    target.primaryEstablishmentId = scope.primary ? new Types.ObjectId(scope.primary) : null;
    target.authorizedEstablishmentIds = scope.authorized.map((i) => new Types.ObjectId(i));
  }
  if (body.active !== undefined) target.active = body.active;

  await target.save();
  if (body.active === false || body.role !== undefined) await revokeAllForUser(target._id);
  await audit(req, { action: "user.update", entity: "user", entityId: String(target._id), meta: { fields: Object.keys(body) } });
  res.json(presentUser(target));
});

/** Désactivation (les données historiques gardent leur auteur) : jamais de suppression physique. */
router.delete("/:id", requireAccess("utilisateurs", "write"), async (req, res) => {
  const { user: actor, userId, companyId } = getAuth(req);
  const target = await loadTarget(req);
  if (String(target._id) === userId) throw forbidden("Vous ne pouvez pas désactiver votre propre compte.", "SELF_DEACTIVATE");
  assertCanManage(actor.role, userId, target);
  await assertNotLastSuperAdmin(companyId, target);
  target.active = false;
  await target.save();
  await revokeAllForUser(target._id);
  await audit(req, { action: "user.deactivate", entity: "user", entityId: String(target._id) });
  res.json(presentUser(target));
});

router.post("/:id/resend-invite", requireAccess("utilisateurs", "write"), async (req, res) => {
  const { user: actor, userId, companyId, name } = getAuth(req);
  const target = await loadTarget(req);
  assertCanManage(actor.role, userId, target);
  await sendInvite(name, companyId, target);
  res.json({ ok: true });
});

export default router;
