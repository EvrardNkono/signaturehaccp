import { Router } from "express";
import { z } from "zod";
import { Equipment, Reading } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { DELETE_REASONS, EQUIPMENT_TYPES, PAIRING_STATES, defaultThresholds } from "../domain/equipment";
import { notFound, unprocessable } from "../utils/httpError";
import { oid, escapeRegex } from "../utils/mongo";
import { randomToken, sha256 } from "../utils/password";
import { presentEquipment } from "../services/presenters";
import { audit } from "../services/audit";
import { decimal, optText, text } from "./helpers";

const router = Router({ mergeParams: true });

const thresholdFields = {
  min: decimal.pipe(z.number().min(-100).max(400)),
  max: decimal.pipe(z.number().min(-100).max(400)),
  warnMargin: decimal.pipe(z.number().min(0, "Ne peut pas être négatif.").max(50)),
};

const createSchema = z
  .object({
    name: text(120, "Nom"),
    type: z.enum(EQUIPMENT_TYPES),
    zone: text(80, "Zone"),
    min: thresholdFields.min.optional(),
    max: thresholdFields.max.optional(),
    warnMargin: thresholdFields.warnMargin.optional(),
    hasSensor: z.boolean().default(false),
    pairing: z.enum(PAIRING_STATES).optional(),
  });

function assertRange(min: number, max: number) {
  if (min >= max) throw unprocessable("Le minimum doit être inférieur au maximum.", "RANGE_INVALID", { field: "min" });
}

async function assertUniqueName(estId: unknown, name: string, exceptId?: unknown) {
  const exists = await Equipment.exists({
    establishmentId: estId,
    archived: false,
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (exists) throw unprocessable("Un équipement porte déjà ce nom.", "NAME_TAKEN", { field: "name" });
}

router.get("/", async (req, res) => {
  const est = getEst(req);
  const q = z
    .object({ archived: z.enum(["true", "false", "all"]).default("false"), type: z.enum(EQUIPMENT_TYPES).optional(), search: z.string().trim().max(80).optional() })
    .parse(req.query);
  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.archived !== "all") filter.archived = q.archived === "true";
  if (q.type) filter.type = q.type;
  if (q.search) filter.name = { $regex: escapeRegex(q.search), $options: "i" };
  const list = await Equipment.find(filter).sort({ archived: 1, name: 1 });
  res.json({ data: list.map(presentEquipment) });
});

router.post("/", requireAccess("equipements", "write"), async (req, res) => {
  const est = getEst(req);
  const body = createSchema.parse(req.body);
  await assertUniqueName(est._id, body.name);

  const d = defaultThresholds(body.type, est.settings);
  const min = body.min ?? d.min;
  const max = body.max ?? d.max;
  assertRange(min, max);

  const eq = await Equipment.create({
    establishmentId: est._id,
    name: body.name,
    type: body.type,
    zone: body.zone,
    min,
    max,
    warnMargin: body.warnMargin ?? d.warnMargin,
    sensor: body.hasSensor ? { battery: 100, signal: 0, online: false, pairing: body.pairing ?? "pending" } : null,
  });
  await audit(req, { action: "equipment.create", entity: "equipment", entityId: String(eq._id), meta: { name: eq.name, type: eq.type } });
  res.status(201).json(presentEquipment(eq));
});

async function loadEquipment(req: Parameters<typeof getEst>[0]) {
  const est = getEst(req);
  const eq = await Equipment.findOne({ _id: oid(req.params.id, "Équipement"), establishmentId: est._id });
  if (!eq) throw notFound("Équipement introuvable.");
  return eq;
}

router.get("/:id", async (req, res) => {
  res.json(presentEquipment(await loadEquipment(req)));
});

/** Courbe de température : relevés horodatés (24 h par défaut, 30 jours maximum). */
router.get("/:id/history", async (req, res) => {
  const eq = await loadEquipment(req);
  const q = z.object({ hours: z.coerce.number().int().min(1).max(720).default(24), limit: z.coerce.number().int().min(1).max(2000).default(500) }).parse(req.query);
  const since = new Date(Date.now() - q.hours * 3_600_000);
  const rows = await Reading.find({ equipmentId: eq._id, at: { $gte: since } }).sort({ at: 1 }).limit(q.limit);
  const values = rows.map((r) => r.value);
  res.json({
    equipmentId: String(eq._id),
    min: eq.min,
    max: eq.max,
    points: rows.map((r) => ({ at: r.at.toISOString(), value: r.value, status: r.status, source: r.source })),
    stats: values.length ? { min: Math.min(...values), max: Math.max(...values), avg: values.reduce((a, b) => a + b, 0) / values.length } : null,
  });
});

const patchSchema = z.object({
  name: text(120, "Nom").optional(),
  type: z.enum(EQUIPMENT_TYPES).optional(),
  zone: text(80, "Zone").optional(),
  min: thresholdFields.min.optional(),
  max: thresholdFields.max.optional(),
  warnMargin: thresholdFields.warnMargin.optional(),
  hasSensor: z.boolean().optional(),
  pairing: z.enum(PAIRING_STATES).optional(),
});

router.patch("/:id", requireAccess("equipements", "write"), async (req, res) => {
  const eq = await loadEquipment(req);
  if (eq.archived) throw unprocessable("Équipement archivé : restaurez-le avant de le modifier.", "EQUIPMENT_ARCHIVED");
  const body = patchSchema.parse(req.body);

  if (body.name && body.name !== eq.name) {
    await assertUniqueName(eq.establishmentId, body.name, eq._id);
    eq.name = body.name;
  }
  if (body.type) eq.type = body.type;
  if (body.zone) eq.zone = body.zone;

  const before = { min: eq.min, max: eq.max, warnMargin: eq.warnMargin };
  const min = body.min ?? eq.min;
  const max = body.max ?? eq.max;
  assertRange(min, max);
  eq.min = min;
  eq.max = max;
  if (body.warnMargin !== undefined) eq.warnMargin = body.warnMargin;

  if (body.hasSensor === false) eq.sensor = null;
  if (body.hasSensor === true && !eq.sensor) eq.sensor = { battery: 100, signal: 0, online: false, pairing: body.pairing ?? "pending" };
  if (body.pairing && eq.sensor) eq.sensor.pairing = body.pairing;

  await eq.save();
  const changedThresholds = before.min !== eq.min || before.max !== eq.max || before.warnMargin !== eq.warnMargin;
  await audit(req, {
    action: changedThresholds ? "equipment.thresholds_change" : "equipment.update",
    entity: "equipment",
    entityId: String(eq._id),
    meta: changedThresholds ? { before, after: { min: eq.min, max: eq.max, warnMargin: eq.warnMargin } } : { fields: Object.keys(body) },
  });
  res.json(presentEquipment(eq));
});

const archiveSchema = z
  .object({ reason: z.enum(DELETE_REASONS), note: optText(500) })
  .refine((d) => d.reason !== "other" || (d.note && d.note.length > 0), { path: ["note"], message: "Précisez le motif." });

/** Suppression = archivage avec motif (traçabilité HACCP) ; l'historique des relevés est conservé. */
router.delete("/:id", requireAccess("equipements", "write"), async (req, res) => {
  const eq = await loadEquipment(req);
  const { name } = getAuth(req);
  const body = archiveSchema.parse(req.body ?? {});
  eq.archived = true;
  eq.archivedAt = new Date();
  eq.deleteReason = body.reason;
  eq.deleteNote = body.note;
  eq.deletedBy = name;
  await eq.save();
  await audit(req, { action: "equipment.archive", entity: "equipment", entityId: String(eq._id), meta: { reason: body.reason, note: body.note } });
  res.json(presentEquipment(eq));
});

router.post("/:id/restore", requireAccess("equipements", "write"), async (req, res) => {
  const eq = await loadEquipment(req);
  await assertUniqueName(eq.establishmentId, eq.name, eq._id);
  eq.archived = false;
  eq.archivedAt = null;
  eq.deleteReason = undefined;
  eq.deleteNote = undefined;
  eq.deletedBy = undefined;
  await eq.save();
  await audit(req, { action: "equipment.restore", entity: "equipment", entityId: String(eq._id) });
  res.json(presentEquipment(eq));
});

// ---- Capteur IoT : appairage -------------------------------------------------

/** Démarre l'appairage : la clé d'appareil est affichée UNE seule fois (seule son empreinte est conservée). */
router.post("/:id/sensor/pair", requireAccess("equipements", "write"), async (req, res) => {
  const eq = await loadEquipment(req);
  if (eq.archived) throw unprocessable("Équipement archivé.", "EQUIPMENT_ARCHIVED");
  const deviceKey = `shk_${randomToken(24)}`;
  eq.sensor = {
    battery: eq.sensor?.battery ?? 100,
    signal: eq.sensor?.signal ?? 0,
    online: false,
    pairing: "pending",
    deviceKeyHash: sha256(deviceKey),
    lastSeenAt: null,
  };
  await eq.save();
  await audit(req, { action: "sensor.pair_start", entity: "equipment", entityId: String(eq._id) });
  res.status(201).json({ equipment: presentEquipment(eq), deviceKey, notice: "Conservez cette clé : elle ne sera plus affichée." });
});

router.delete("/:id/sensor", requireAccess("equipements", "write"), async (req, res) => {
  const eq = await loadEquipment(req);
  eq.sensor = null;
  await eq.save();
  await audit(req, { action: "sensor.unpair", entity: "equipment", entityId: String(eq._id) });
  res.json(presentEquipment(eq));
});

export default router;
