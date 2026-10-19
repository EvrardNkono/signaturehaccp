import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Equipment, OilChange, OilControl } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { EXPECTED_PER_FRYER, OIL_ASPECTS, OIL_SLOTS, getOilStatus } from "../domain/oil";
import { MIN_ACTION_LENGTH } from "../domain/alerts";
import { nowInTz } from "../domain/time";
import { formatPolar } from "../domain/format";
import { notFound, unprocessable } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { presentAlert, presentOilControl } from "../services/presenters";
import { autoResolve, raiseAlert } from "../services/alertService";
import { audit } from "../services/audit";
import { decimal, isoDay, objectId, optText } from "./helpers";

const router = Router({ mergeParams: true });

router.get("/controls", async (req, res) => {
  const est = getEst(req);
  const q = z.object({ day: isoDay.optional(), fryerId: objectId.optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.fryerId) filter.fryerId = q.fryerId;
  if (q.day) filter.dayKey = q.day;
  else if (!q.fryerId) filter.dayKey = nowInTz(est.timezone).date;
  const rows = await OilControl.find(filter).sort({ at: -1 }).limit(q.limit);
  res.json({ data: rows.map(presentOilControl) });
});

/** Vue d'ensemble par friteuse : dernier contrôle, créneaux faits aujourd'hui, dernier changement d'huile. */
router.get("/fryers", async (req, res) => {
  const est = getEst(req);
  const today = nowInTz(est.timezone).date;
  const fryers = await Equipment.find({ establishmentId: est._id, type: "fryer", archived: false }).sort({ name: 1 });
  const data = await Promise.all(
    fryers.map(async (f) => {
      const [last, todayRows, lastChange] = await Promise.all([
        OilControl.findOne({ fryerId: f._id }).sort({ at: -1 }),
        OilControl.find({ fryerId: f._id, dayKey: today }),
        OilChange.findOne({ fryerId: f._id }).sort({ at: -1 }),
      ]);
      const slotsDone = [...new Set(todayRows.map((c) => c.slot))];
      return {
        id: String(f._id),
        name: f.name,
        zone: f.zone,
        lastControl: last ? presentOilControl(last) : null,
        slotsDone,
        expected: EXPECTED_PER_FRYER,
        lastChangeAt: lastChange?.at.toISOString() ?? null,
      };
    })
  );
  res.json({
    date: today,
    limits: { polarWarn: est.settings.polarWarn, polarLimit: est.settings.polarLimit, oilMaxTemp: est.settings.oilMaxTemp },
    data,
  });
});

const controlSchema = z.object({
  fryerId: objectId,
  slot: z.enum(OIL_SLOTS),
  temp: decimal.pipe(z.number().min(0, "Température invalide.").max(300, "Température invalide.")),
  polar: decimal.pipe(z.number().min(0, "Entre 0 et 100 %.").max(100, "Entre 0 et 100 %.")),
  aspect: z.enum(OIL_ASPECTS),
  action: optText(500),
});

router.post("/controls", requireAccess("huile", "write"), async (req, res) => {
  const est = getEst(req);
  const { userId, name } = getAuth(req);
  const body = controlSchema.parse(req.body);

  const fryer = await Equipment.findOne({ _id: oid(body.fryerId, "Friteuse"), establishmentId: est._id, type: "fryer", archived: false });
  if (!fryer) throw notFound("Friteuse introuvable.");

  const status = getOilStatus(body.polar, body.temp, body.aspect, est.settings);
  if (status === "change" && (body.action?.trim().length ?? 0) < MIN_ACTION_LENGTH) {
    throw unprocessable("Une action corrective est obligatoire quand l'huile doit être changée.", "ACTION_REQUIRED", { field: "action" });
  }

  const control = await OilControl.create({
    establishmentId: est._id,
    fryerId: fryer._id,
    fryerName: fryer.name,
    slot: body.slot,
    dayKey: nowInTz(est.timezone).date,
    temp: body.temp,
    polar: body.polar,
    aspect: body.aspect,
    status,
    by: name,
    byUserId: new Types.ObjectId(userId),
    action: body.action?.trim() || undefined,
  });

  let alert = null;
  if (status !== "ok") {
    const change = status === "change";
    const reasons: string[] = [];
    if (body.polar >= est.settings.polarWarn) reasons.push(`composés polaires à ${formatPolar(body.polar)}`);
    if (body.temp > est.settings.oilMaxTemp) reasons.push(`huile à ${body.temp} °C (max ${est.settings.oilMaxTemp} °C)`);
    if (body.aspect !== "normal") reasons.push("aspect anormal");
    const res2 = await raiseAlert({
      establishmentId: est._id,
      severity: change ? "critical" : "warn",
      kind: "oil",
      title: change ? "Huile de friture à changer" : "Huile de friture à surveiller",
      detail: `${fryer.name} : ${reasons.join(", ")}.`,
      equipmentId: fryer._id,
      equipmentName: fryer.name,
      zone: fryer.zone,
      value: formatPolar(body.polar),
      threshold: `${formatPolar(est.settings.polarLimit)} max`,
      dedupeKey: `oil:${fryer._id}`,
    });
    alert = res2.alert;
  } else {
    await autoResolve(est._id, `oil:${fryer._id}`, "Contrôle suivant conforme.");
  }

  res.status(201).json({ control: presentOilControl(control), alert: alert ? presentAlert(alert) : null });
});

router.get("/changes", async (req, res) => {
  const est = getEst(req);
  const q = z.object({ fryerId: objectId.optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(req.query);
  const rows = await OilChange.find({ establishmentId: est._id, ...(q.fryerId ? { fryerId: q.fryerId } : {}) }).sort({ at: -1 }).limit(q.limit);
  res.json({
    data: rows.map((c) => ({ id: String(c._id), fryerId: String(c.fryerId), fryerName: c.fryerName, by: c.by, note: c.note, at: c.at.toISOString() })),
  });
});

/** Enregistre un changement d'huile : clôt l'alerte "huile à changer" de cette friteuse. */
router.post("/fryers/:fryerId/changes", requireAccess("huile", "write"), async (req, res) => {
  const est = getEst(req);
  const { userId, name } = getAuth(req);
  const { note } = z.object({ note: optText(400) }).parse(req.body ?? {});
  const fryer = await Equipment.findOne({ _id: oid(req.params.fryerId, "Friteuse"), establishmentId: est._id, type: "fryer", archived: false });
  if (!fryer) throw notFound("Friteuse introuvable.");

  const change = await OilChange.create({ establishmentId: est._id, fryerId: fryer._id, fryerName: fryer.name, by: name, byUserId: new Types.ObjectId(userId), note });
  const resolved = await autoResolve(est._id, `oil:${fryer._id}`, `Huile changée par ${name}.${note ? ` ${note}` : ""}`);
  await audit(req, { action: "oil.change", entity: "equipment", entityId: String(fryer._id), meta: { note } });
  res.status(201).json({ id: String(change._id), fryerId: String(fryer._id), fryerName: fryer.name, by: name, note, at: change.at.toISOString(), alertsResolved: resolved });
});

export default router;
