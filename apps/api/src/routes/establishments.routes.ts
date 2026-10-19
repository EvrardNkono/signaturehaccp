import { Router } from "express";
import { z } from "zod";
import { Establishment } from "../models";
import { defaultNotificationPrefs, defaultThresholdSettings } from "../models/Establishment";
import { getAuth, getEst, loadEstablishment, requireAccess } from "../middleware/auth";
import { allowedEstablishmentIds, canAddEstablishment } from "../domain/permissions";
import { forbidden, unprocessable } from "../utils/httpError";
import { isHHMM } from "../domain/time";
import { presentEstablishment } from "../services/presenters";
import { audit } from "../services/audit";
import { decimal, optText } from "./helpers";

import equipmentRoutes from "./equipments.routes";
import readingRoutes from "./readings.routes";
import cleaningRoutes from "./cleaning.routes";
import oilRoutes from "./oil.routes";
import lotRoutes from "./lots.routes";
import documentRoutes from "./documents.routes";
import alertRoutes from "./alerts.routes";
import dashboardRoutes from "./dashboard.routes";
import reportRoutes from "./reports.routes";

const router = Router();

const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Fuseau horaire inconnu.");

const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160);

const profileSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(160),
  city: optText(80),
  address: optText(200),
  zip: optText(20),
  phone: optText(30),
  email: email.or(z.literal("")).optional(),
  siret: z
    .string()
    .trim()
    .refine((s) => s === "" || /^\d{14}$/.test(s.replace(/\s/g, "")), "Le SIRET comporte 14 chiffres.")
    .optional(),
  manager: optText(160),
  timezone: timezoneSchema.optional(),
});

router.get("/", async (req, res) => {
  const { user, companyId } = getAuth(req);
  const includeArchived = req.query.includeArchived === "true";
  const allowed = allowedEstablishmentIds({
    role: user.role,
    primaryEstablishmentId: user.primaryEstablishmentId ? String(user.primaryEstablishmentId) : null,
    authorizedEstablishmentIds: user.authorizedEstablishmentIds.map(String),
  });
  const filter: Record<string, unknown> = { companyId };
  if (allowed !== null) filter._id = { $in: allowed };
  if (!includeArchived) filter.active = true;
  const list = await Establishment.find(filter).sort({ name: 1 });
  res.json({ data: list.map(presentEstablishment) });
});

router.post("/", async (req, res) => {
  const { user, companyId } = getAuth(req);
  if (!canAddEstablishment(user.role)) throw forbidden("Seuls les administrateurs peuvent ajouter un établissement.", "INSUFFICIENT_ROLE");
  const body = profileSchema.parse(req.body);
  const est = await Establishment.create({
    companyId,
    ...body,
    siret: body.siret ? body.siret.replace(/\s/g, "") : undefined,
    email: body.email || undefined,
  });
  // Un administrateur (non super) obtient automatiquement l'accès au site qu'il vient de créer.
  if (user.role === "admin") {
    user.authorizedEstablishmentIds.push(est._id);
    await user.save();
  }
  req.est = est;
  await audit(req, { action: "establishment.create", entity: "establishment", entityId: String(est._id), establishmentId: est._id });
  res.status(201).json(presentEstablishment(est));
});

// ---- Un établissement précis ------------------------------------------------
const one = Router({ mergeParams: true });
one.use(loadEstablishment);

one.get("/", (req, res) => res.json(presentEstablishment(getEst(req))));

one.patch("/", requireAccess("parametres", "write"), async (req, res) => {
  const est = getEst(req);
  const body = profileSchema.partial().parse(req.body);
  Object.assign(est, {
    ...body,
    siret: body.siret !== undefined ? body.siret.replace(/\s/g, "") || undefined : est.siret,
    email: body.email !== undefined ? body.email || undefined : est.email,
  });
  await est.save();
  await audit(req, { action: "establishment.update", entity: "establishment", entityId: String(est._id), meta: { fields: Object.keys(body) } });
  res.json(presentEstablishment(est));
});

/** Archivage (pas de suppression) : les relevés restent consultables pour les contrôles. */
one.delete("/", requireAccess("parametres", "write"), async (req, res) => {
  const { user, companyId } = getAuth(req);
  if (!canAddEstablishment(user.role)) throw forbidden("Seuls les administrateurs peuvent archiver un établissement.", "INSUFFICIENT_ROLE");
  const est = getEst(req);
  const activeCount = await Establishment.countDocuments({ companyId, active: true });
  if (activeCount <= 1) throw unprocessable("Impossible d'archiver le dernier établissement actif.", "LAST_ESTABLISHMENT");
  est.active = false;
  await est.save();
  await audit(req, { action: "establishment.archive", entity: "establishment", entityId: String(est._id) });
  res.json(presentEstablishment(est));
});

// ---- Paramètres (profil + seuils + notifications) ---------------------------
const num = (min: number, max: number, msg: string) => decimal.pipe(z.number().min(min, msg).max(max, msg));

const thresholdsSchema = z
  .object({
    coldroomMax: num(-30, 30, "Valeur entre -30 et 30."),
    fridgeMax: num(-30, 30, "Valeur entre -30 et 30."),
    freezerMax: num(-60, 0, "Valeur entre -60 et 0."),
    warnMargin: num(0, 20, "Entre 0 et 20."),
    polarWarn: num(0, 100, "Entre 0 et 100 %."),
    polarLimit: num(1, 100, "Entre 1 et 100 %."),
    oilMaxTemp: num(100, 300, "Entre 100 et 300 °C."),
    dlcSoonDays: decimal.pipe(z.number().int("Nombre entier de jours.").min(0, "Ne peut pas être négatif.").max(30, "30 jours maximum.")),
  })
  .refine((t) => t.polarWarn < t.polarLimit, { path: ["polarWarn"], message: "Doit être inférieur à la limite." });

const prefsSchema = z
  .object({
    channels: z.object({ push: z.boolean(), email: z.boolean() }),
    byLevel: z.object({ critical: z.boolean(), warn: z.boolean(), info: z.boolean() }),
    quietHours: z.object({ enabled: z.boolean(), from: z.string(), to: z.string() }),
    frequency: z.enum(["immediate", "daily", "weekly"]),
    extraRecipients: z
      .union([z.string(), z.array(z.string())])
      .transform((v) => (Array.isArray(v) ? v : v.split(/[,;\s]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean))
      .refine((l) => l.length <= 20, "20 destinataires maximum.")
      .refine((l) => l.every((e) => email.safeParse(e).success), "Adresse e-mail invalide."),
  })
  .superRefine((p, ctx) => {
    if (p.quietHours.enabled) {
      if (!isHHMM(p.quietHours.from)) ctx.addIssue({ code: "custom", path: ["quietHours", "from"], message: "Format HH:MM attendu." });
      if (!isHHMM(p.quietHours.to)) ctx.addIssue({ code: "custom", path: ["quietHours", "to"], message: "Format HH:MM attendu." });
      if (p.quietHours.from === p.quietHours.to) ctx.addIssue({ code: "custom", path: ["quietHours", "to"], message: "Différent de l'heure de début." });
    }
  });

function settingsPayload(est: ReturnType<typeof getEst>) {
  return {
    profile: presentEstablishment(est),
    thresholds: { ...defaultThresholdSettings, ...est.toObject().settings },
    notificationPrefs: { ...defaultNotificationPrefs, ...est.toObject().notificationPrefs },
  };
}

one.get("/settings", requireAccess("parametres", "read"), (req, res) => res.json(settingsPayload(getEst(req))));

one.put("/settings", requireAccess("parametres", "write"), async (req, res) => {
  const est = getEst(req);
  const body = z
    .object({ thresholds: thresholdsSchema.optional(), notificationPrefs: prefsSchema.optional(), profile: profileSchema.partial().optional() })
    .parse(req.body);

  const before = { thresholds: est.toObject().settings };
  if (body.thresholds) est.set("settings", body.thresholds);
  if (body.notificationPrefs) est.set("notificationPrefs", body.notificationPrefs);
  if (body.profile) {
    const p = body.profile;
    Object.assign(est, {
      ...p,
      siret: p.siret !== undefined ? p.siret.replace(/\s/g, "") || undefined : est.siret,
      email: p.email !== undefined ? p.email || undefined : est.email,
    });
  }
  await est.save();
  await audit(req, {
    action: "settings.update",
    entity: "establishment",
    entityId: String(est._id),
    meta: { sections: Object.keys(body), before: body.thresholds ? before.thresholds : undefined, after: body.thresholds },
  });
  res.json(settingsPayload(est));
});

// ---- Modules rattachés à l'établissement -------------------------------------
one.use("/equipments", requireAccess("equipements", "read"), equipmentRoutes);
one.use("/readings", requireAccess("releves", "read"), readingRoutes);
one.use("/cleaning", requireAccess("nettoyage", "read"), cleaningRoutes);
one.use("/oil", requireAccess("huile", "read"), oilRoutes);
one.use("/lots", requireAccess("tracabilite", "read"), lotRoutes);
one.use("/documents", requireAccess("documents", "read"), documentRoutes);
one.use("/alerts", requireAccess("alertes", "read"), alertRoutes);
one.use("/dashboard", requireAccess("dashboard", "read"), dashboardRoutes);
one.use("/reports", requireAccess("rapports", "read"), reportRoutes);

router.use("/:establishmentId", one);

export default router;
