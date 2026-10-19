import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { Company, DocumentModel, Establishment, User, IUser } from "../models";
import { env } from "../config/env";
import { HydratedDocument } from "mongoose";
import { authenticate, fullName, getAuth, originGuard } from "../middleware/auth";
import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "../utils/password";
import { badRequest, HttpError, unauthorized } from "../utils/httpError";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  issueRefreshToken,
  revokeAllForUser,
  revokeRefreshToken,
  rotateRefreshToken,
  setAuthCookies,
  signAccessToken,
} from "../services/tokens";
import { buildResetEmail, sendMail } from "../services/mail";
import { saveFile } from "../services/storage";
import { audit } from "../services/audit";
import { permissions, allowedEstablishmentIds } from "../domain/permissions";
import { presentEstablishment, presentUser } from "../services/presenters";
import { unprocessable } from "../utils/httpError";
import { logger } from "../config/logger";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === "test" ? 1000 : 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Trop de tentatives. Réessayez dans quelques minutes." } },
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// Le Kbis (facultatif) est limité à 5 Mo, PDF / JPG / PNG, comme dans le formulaire d'inscription du front.
const kbisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype)) {
      return cb(unprocessable("Format accepté : PDF, JPG ou PNG.", "FILE_TYPE_INVALID"));
    }
    cb(null, true);
  },
});

const emailField = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160);
const passwordField = z
  .string()
  .superRefine((p, ctx) => {
    const problem = passwordProblem(p);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

const registerSchema = z
  .object({
    company: z.string().trim().min(1, "Le nom de l'établissement est obligatoire.").max(160),
    kbis: z
      .string()
      .transform((s) => s.replace(/[\s.]/g, ""))
      .refine((s) => /^\d{9}$/.test(s) || /^\d{14}$/.test(s), "9 chiffres (Kbis/RCS) ou 14 chiffres (SIRET)."),
    manager: z.string().trim().min(1, "Votre nom est obligatoire.").max(160),
    email: emailField,
    password: passwordField,
    confirm: z.string().optional(),
    accepted: z.preprocess((v) => v === true || v === "true" || v === "on" || v === "1", z.literal(true, { errorMap: () => ({ message: "Vous devez accepter les conditions." }) })),
  })
  .refine((d) => d.confirm === undefined || d.confirm === d.password, { path: ["confirm"], message: "Les mots de passe ne correspondent pas." });

async function startSession(req: Request, res: Response, user: HydratedDocument<IUser>) {
  const access = signAccessToken(user);
  const refresh = await issueRefreshToken(user._id, { userAgent: req.headers["user-agent"], ip: req.ip });
  setAuthCookies(res, access, refresh);
  // Les clients non navigateur (application mobile) demandent les jetons dans le corps de la réponse.
  const wantsTokens = req.headers["x-client"] === "mobile";
  return wantsTokens ? { accessToken: access, refreshToken: refresh } : {};
}

async function sessionPayload(user: HydratedDocument<IUser>) {
  const allowed = allowedEstablishmentIds({
    role: user.role,
    primaryEstablishmentId: user.primaryEstablishmentId ? String(user.primaryEstablishmentId) : null,
    authorizedEstablishmentIds: user.authorizedEstablishmentIds.map(String),
  });
  const filter: Record<string, unknown> = { companyId: user.companyId, active: true };
  if (allowed !== null) filter._id = { $in: allowed };
  const establishments = await Establishment.find(filter).sort({ name: 1 });
  const company = await Company.findById(user.companyId);
  return {
    user: presentUser(user),
    company: company ? { id: String(company._id), name: company.name } : null,
    permissions: permissions[user.role],
    establishments: establishments.map(presentEstablishment),
  };
}

/** Inscription : crée l'entreprise, un premier établissement et le compte super administrateur. */
router.post("/register", authLimiter, kbisUpload.single("kbisFile"), async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (await User.exists({ email: body.email })) {
    throw new HttpError(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
  }

  const [firstName, ...rest] = body.manager.split(/\s+/);
  const company = await Company.create({ name: body.company, kbis: body.kbis });
  const establishment = await Establishment.create({
    companyId: company._id,
    name: body.company,
    manager: body.manager,
    email: body.email,
    siret: body.kbis.length === 14 ? body.kbis : undefined,
  });
  const user = await User.create({
    companyId: company._id,
    firstName,
    lastName: rest.join(" "),
    email: body.email,
    passwordHash: await hashPassword(body.password),
    role: "super_admin",
  });

  if (req.file) {
    const stored = await saveFile(req.file.buffer, { originalName: req.file.originalname, mime: req.file.mimetype, folder: `company-${company._id}` });
    await DocumentModel.create({
      establishmentId: establishment._id,
      name: "Extrait Kbis",
      category: "autre",
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      storageDriver: stored.driver,
      storageKey: stored.key,
      fileUrl: stored.url,
      uploadedBy: fullName(user),
      uploadedByUserId: user._id,
      tags: ["kbis"],
    });
  }

  const extra = await startSession(req, res, user);
  req.auth = { user, userId: String(user._id), companyId: String(company._id), name: fullName(user) };
  await audit(req, { action: "auth.register", entity: "company", entityId: String(company._id), establishmentId: establishment._id });
  res.status(201).json({ ...(await sessionPayload(user)), ...extra });
});

const loginSchema = z.object({ email: emailField, password: z.string().min(1, "Mot de passe obligatoire.").max(128) });

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email });
  const generic = () => new HttpError(401, "INVALID_CREDENTIALS", "Adresse e-mail ou mot de passe incorrect.");

  if (!user || !user.active) {
    await verifyPassword(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi"); // temps constant
    throw generic();
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new HttpError(429, "ACCOUNT_LOCKED", `Compte temporairement verrouillé. Réessayez dans ${Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)} min.`);
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount += 1;
    if (user.failedLoginCount >= MAX_FAILED) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginCount = 0;
    }
    await user.save();
    throw generic();
  }

  user.failedLoginCount = 0;
  user.lockedUntil = null;
  user.lastSeenAt = new Date();
  await user.save();

  const extra = await startSession(req, res, user);
  res.json({ ...(await sessionPayload(user)), ...extra });
});

router.post("/refresh", authLimiter, async (req, res) => {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);
  if (!token) throw unauthorized("Session invalide.", "REFRESH_INVALID");

  let rotated;
  try {
    rotated = await rotateRefreshToken(token, { userAgent: req.headers["user-agent"], ip: req.ip });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
  const user = await User.findById(rotated.userId);
  if (!user || !user.active) {
    clearAuthCookies(res);
    throw unauthorized("Compte désactivé ou introuvable.", "ACCOUNT_DISABLED");
  }
  const access = signAccessToken(user);
  setAuthCookies(res, access, rotated.newToken);
  const wantsTokens = req.headers["x-client"] === "mobile";
  res.json(wantsTokens ? { ok: true, accessToken: access, refreshToken: rotated.newToken } : { ok: true });
});

router.post("/logout", async (req, res) => {
  const token = (req.cookies?.[REFRESH_COOKIE] as string | undefined) ?? (typeof req.body?.refreshToken === "string" ? req.body.refreshToken : undefined);
  if (token) await revokeRefreshToken(token);
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get("/me", authenticate, async (req, res) => {
  res.json(await sessionPayload(getAuth(req).user));
});

const forgotSchema = z.object({ email: emailField });

/** Répond toujours de la même façon, que le compte existe ou non (pas d'énumération de comptes). */
router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  const user = await User.findOne({ email, active: true });
  if (user) {
    const token = randomToken(32);
    user.passwordResetTokenHash = sha256(token);
    user.passwordResetExpires = new Date(Date.now() + 60 * 60_000);
    await user.save();
    const link = `${env.APP_URL}/reinitialiser-mot-de-passe?token=${token}`;
    sendMail({ to: user.email, ...buildResetEmail(user.firstName, link) }).catch((err) => logger.error({ err }, "Échec d'envoi de l'e-mail de réinitialisation"));
  }
  res.json({ ok: true, message: "Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d'être envoyé." });
});

const resetSchema = z.object({ token: z.string().min(20).max(200), password: passwordField });

router.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = resetSchema.parse(req.body);
  const user = await User.findOne({ passwordResetTokenHash: sha256(token), passwordResetExpires: { $gt: new Date() } });
  if (!user) throw badRequest("Lien invalide ou expiré.", "RESET_TOKEN_INVALID");

  user.passwordHash = await hashPassword(password);
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  user.mustChangePassword = false;
  user.failedLoginCount = 0;
  user.lockedUntil = null;
  await user.save();
  await revokeAllForUser(user._id); // toutes les sessions existantes sont fermées
  res.json({ ok: true });
});

const changeSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordField });

router.post("/change-password", authenticate, originGuard, async (req, res) => {
  const { user } = getAuth(req);
  const { currentPassword, newPassword } = changeSchema.parse(req.body);
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new HttpError(422, "WRONG_PASSWORD", "Mot de passe actuel incorrect.");
  }
  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  await user.save();
  await revokeAllForUser(user._id);
  // Nouvelle session pour l'appareil courant
  const extra = await startSession(req, res, user);
  await audit(req, { action: "auth.change_password", entity: "user", entityId: String(user._id) });
  res.json({ ok: true, ...extra });
});

export default router;
