import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { Equipment, Establishment } from "../models";
import { sha256 } from "../utils/password";
import { unauthorized, notFound } from "../utils/httpError";
import { recordReading, touchSensor } from "../services/readingService";
import { decimal } from "./helpers";
import { env } from "../config/env";

const router = Router();

const limiter = rateLimit({
  windowMs: 60_000,
  limit: env.NODE_ENV === "test" ? 10_000 : 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => (typeof req.headers["x-device-key"] === "string" ? sha256(req.headers["x-device-key"]).slice(0, 16) : (req.ip ?? "anon")),
  message: { error: { code: "RATE_LIMITED", message: "Trop de messages." } },
});

const schema = z.object({
  value: decimal.pipe(z.number().min(-100).max(400)),
  battery: z.number().int().min(0).max(100).optional(),
  signal: z.number().int().min(0).max(4).optional(),
  at: z.coerce.date().optional(), // horodatage du capteur (relevés mis en tampon hors ligne)
});

/**
 * Ingestion des relevés d'un capteur. Authentification par clé d'appareil (en-tête x-device-key),
 * générée lors de l'appairage — jamais par session utilisateur.
 */
router.post("/readings", limiter, async (req, res) => {
  const key = req.headers["x-device-key"];
  if (typeof key !== "string" || key.length < 16) throw unauthorized("Clé d'appareil manquante.", "DEVICE_KEY_REQUIRED");

  const equipment = await Equipment.findOne({ "sensor.deviceKeyHash": sha256(key), archived: false });
  if (!equipment) throw unauthorized("Clé d'appareil invalide.", "DEVICE_KEY_INVALID");
  const est = await Establishment.findById(equipment.establishmentId);
  if (!est || !est.active) throw notFound("Établissement inactif.");

  const body = schema.parse(req.body);
  const at = body.at && body.at.getTime() <= Date.now() + 60_000 ? body.at : new Date();

  // Premier message reçu : l'appairage passe de "en attente" à "appairé".
  if (equipment.sensor && equipment.sensor.pairing !== "paired") {
    await Equipment.updateOne({ _id: equipment._id }, { $set: { "sensor.pairing": "paired" } });
    equipment.sensor.pairing = "paired";
  }

  const result = await recordReading({ equipment, value: body.value, source: "iot", by: "Capteur", at });
  await touchSensor(equipment, { battery: body.battery, signal: body.signal });
  res.status(201).json({ ok: true, status: result.status, readingId: String(result.reading._id) });
});

export default router;
