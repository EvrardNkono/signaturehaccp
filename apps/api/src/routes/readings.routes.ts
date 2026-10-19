import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Equipment, Reading } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { statusForValue } from "../domain/equipment";
import { dayBounds, nowInTz } from "../domain/time";
import { notFound, unprocessable } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { pageMeta, paginationQuery } from "../utils/pagination";
import { presentAlert, presentEquipment, presentReading } from "../services/presenters";
import { recordReading } from "../services/readingService";
import { decimal, isoDay, objectId, optText } from "./helpers";
import { MIN_ACTION_LENGTH } from "../domain/alerts";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const est = getEst(req);
  const q = paginationQuery
    .extend({
      equipmentId: objectId.optional(),
      status: z.enum(["ok", "warn", "critical"]).optional(),
      source: z.enum(["manual", "iot"]).optional(),
      day: isoDay.optional(), // journée locale de l'établissement ; défaut : aujourd'hui
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.equipmentId) filter.equipmentId = q.equipmentId;
  if (q.status) filter.status = q.status;
  if (q.source) filter.source = q.source;

  if (q.from || q.to) {
    filter.at = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };
  } else {
    const { start, end } = dayBounds(est.timezone, q.day ?? nowInTz(est.timezone).date);
    filter.at = { $gte: start, $lt: end };
  }

  const [total, rows] = await Promise.all([
    Reading.countDocuments(filter),
    Reading.find(filter).sort({ at: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
  ]);
  res.json({ data: rows.map(presentReading), meta: pageMeta(total, q.page, q.limit) });
});

const createSchema = z.object({
  equipmentId: objectId,
  value: decimal.pipe(z.number().min(-100, "Valeur improbable.").max(400, "Valeur improbable.")),
  action: optText(500),
});

/**
 * Saisie manuelle d'un relevé. Règle du front reprise côté serveur :
 * une température critique exige une action corrective (preuve réglementaire).
 */
router.post("/", requireAccess("releves", "write"), async (req, res) => {
  const est = getEst(req);
  const { userId, name } = getAuth(req);
  const body = createSchema.parse(req.body);

  const equipment = await Equipment.findOne({ _id: oid(body.equipmentId, "Équipement"), establishmentId: est._id });
  if (!equipment) throw notFound("Équipement introuvable.");
  if (equipment.archived) throw unprocessable("Équipement archivé.", "EQUIPMENT_ARCHIVED");

  const status = statusForValue(body.value, equipment);
  if (status === "critical" && (body.action?.trim().length ?? 0) < MIN_ACTION_LENGTH) {
    throw unprocessable("Une action corrective est obligatoire pour une température critique.", "ACTION_REQUIRED", { field: "action" });
  }

  const result = await recordReading({ equipment, value: body.value, source: "manual", by: name, byUserId: new Types.ObjectId(userId), action: body.action });
  res.status(201).json({
    reading: presentReading(result.reading),
    status: result.status,
    alert: result.alert ? presentAlert(result.alert) : null,
    equipment: presentEquipment(equipment),
  });
});

export default router;
