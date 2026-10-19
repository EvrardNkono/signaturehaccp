import { NextFunction, Request, Response } from "express";
import { HydratedDocument } from "mongoose";
import { corsOrigins } from "../config/env";
import { Establishment, IEstablishment, IUser, User } from "../models";
import { Access, Module, allowedEstablishmentIds, hasAccess } from "../domain/permissions";
import { forbidden, notFound, unauthorized } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { ACCESS_COOKIE, verifyAccessToken } from "../services/tokens";

export type AuthContext = {
  user: HydratedDocument<IUser>;
  userId: string;
  companyId: string;
  name: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      est?: HydratedDocument<IEstablishment>;
    }
  }
}

export const fullName = (u: { firstName: string; lastName?: string }) => `${u.firstName} ${u.lastName ?? ""}`.trim();

export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function getEst(req: Request): HydratedDocument<IEstablishment> {
  if (!req.est) throw notFound("Établissement introuvable.");
  return req.est;
}

/** Vérifie le jeton (cookie httpOnly ou en-tête Authorization: Bearer) puis charge l'utilisateur. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = bearer ?? (req.cookies?.[ACCESS_COOKIE] as string | undefined);
  if (!token) throw unauthorized();

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw unauthorized("Compte désactivé ou introuvable.", "ACCOUNT_DISABLED");

  req.auth = { user, userId: String(user._id), companyId: String(user.companyId), name: fullName(user) };

  // Dernière activité (au plus une écriture toutes les 5 minutes)
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 5 * 60_000) {
    User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  next();
}

/** Protection CSRF pour l'authentification par cookie : l'origine d'une requête modifiante doit être autorisée. */
export function originGuard(req: Request, _res: Response, next: NextFunction) {
  const unsafe = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const usesCookie = Boolean(req.cookies?.[ACCESS_COOKIE]) && !req.headers.authorization;
  if (unsafe && usesCookie) {
    const origin = req.headers.origin;
    if (origin && !corsOrigins.includes(origin)) throw forbidden("Origine non autorisée.", "BAD_ORIGIN");
  }
  next();
}

export const requireAccess =
  (module: Module, min: Access = "read") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const { user } = getAuth(req);
    if (!hasAccess(user.role, module, min)) {
      throw forbidden(min === "write" ? "Vous n'avez pas le droit de modifier ce module." : "Vous n'avez pas accès à ce module.", "INSUFFICIENT_ROLE");
    }
    next();
  };

/** Charge l'établissement du chemin et vérifie qu'il appartient à l'entreprise ET que l'utilisateur y a accès. */
export async function loadEstablishment(req: Request, _res: Response, next: NextFunction) {
  const { user, companyId } = getAuth(req);
  const id = oid(req.params.establishmentId, "Établissement");
  const est = await Establishment.findOne({ _id: id, companyId });
  if (!est) throw notFound("Établissement introuvable.");

  const allowed = allowedEstablishmentIds({
    role: user.role,
    primaryEstablishmentId: user.primaryEstablishmentId ? String(user.primaryEstablishmentId) : null,
    authorizedEstablishmentIds: user.authorizedEstablishmentIds.map(String),
  });
  if (allowed !== null && !allowed.includes(String(est._id))) {
    throw forbidden("Vous n'avez pas accès à cet établissement.", "ESTABLISHMENT_FORBIDDEN");
  }
  if (!est.active && req.method !== "GET") throw forbidden("Cet établissement est archivé.", "ESTABLISHMENT_ARCHIVED");
  req.est = est;
  next();
}
