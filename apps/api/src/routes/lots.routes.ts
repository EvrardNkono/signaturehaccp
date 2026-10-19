import { Router } from "express";
import { z } from "zod";
import { Lot } from "../models";
import { getAuth, getEst, requireAccess } from "../middleware/auth";
import { LOT_CATEGORIES, LOT_STATES, daysUntil, getDlcStatus, isTempOk, maxReceptionTemp } from "../domain/traceability";
import { nowInTz } from "../domain/time";
import { notFound, unprocessable } from "../utils/httpError";
import { escapeRegex, oid } from "../utils/mongo";
import { pageMeta, paginationQuery } from "../utils/pagination";
import { presentLot } from "../services/presenters";
import { audit } from "../services/audit";
import { decimal, isoDay, optText, text } from "./helpers";

const router = Router({ mergeParams: true });

router.get("/", async (req, res) => {
  const est = getEst(req);
  const today = nowInTz(est.timezone).date;
  const soon = est.settings.dlcSoonDays;
  const q = paginationQuery
    .extend({
      state: z.enum(LOT_STATES).optional(),
      category: z.enum(LOT_CATEGORIES).optional(),
      dlcStatus: z.enum(["expired", "today", "soon", "ok"]).optional(),
      search: z.string().trim().max(80).optional(),
    })
    .parse(req.query);

  const filter: Record<string, unknown> = { establishmentId: est._id };
  if (q.state) filter.state = q.state;
  if (q.category) filter.category = q.category;
  if (q.search) {
    const rx = { $regex: escapeRegex(q.search), $options: "i" };
    filter.$or = [{ product: rx }, { supplier: rx }, { lotNumber: rx }];
  }
  // Le statut DLC se déduit de la date : on le traduit en intervalle sur le champ "dlc" (chaînes AAAA-MM-JJ triables).
  if (q.dlcStatus) {
    const add = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    filter.state = "stock";
    if (q.dlcStatus === "expired") filter.dlc = { $lt: today };
    if (q.dlcStatus === "today") filter.dlc = today;
    if (q.dlcStatus === "soon") filter.dlc = { $gt: today, $lte: add(soon) };
    if (q.dlcStatus === "ok") filter.dlc = { $gt: add(soon) };
  }

  const [total, rows] = await Promise.all([
    Lot.countDocuments(filter),
    Lot.find(filter).sort({ state: 1, dlc: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
  ]);

  const stock = await Lot.find({ establishmentId: est._id, state: "stock" }, { dlc: 1 });
  const counts = { expired: 0, today: 0, soon: 0, ok: 0 };
  stock.forEach((l) => (counts[getDlcStatus(daysUntil(l.dlc, today), soon)] += 1));

  res.json({
    data: rows.map((l) => presentLot(l, today, soon)),
    meta: pageMeta(total, q.page, q.limit),
    counts: { ...counts, stock: stock.length },
    receptionLimits: maxReceptionTemp,
  });
});

const lotSchema = z.object({
  product: text(160, "Produit"),
  supplier: text(160, "Fournisseur"),
  lotNumber: text(80, "Numéro de lot"),
  category: z.enum(LOT_CATEGORIES),
  quantity: text(60, "Quantité"),
  receivedAt: isoDay.optional(),
  dlc: isoDay,
  receptionTemp: decimal.pipe(z.number().min(-60).max(60)).nullish(),
  note: optText(500),
});

/**
 * Réception d'un lot. Si la température à réception dépasse la limite de la catégorie,
 * une décision écrite est obligatoire (livraison refusée, acceptée sous réserve...), comme dans le formulaire du front.
 */
router.post("/", requireAccess("tracabilite", "write"), async (req, res) => {
  const est = getEst(req);
  const { name } = getAuth(req);
  const today = nowInTz(est.timezone).date;
  const body = lotSchema.parse(req.body);

  if (!isTempOk(body.category, body.receptionTemp) && !body.note?.trim()) {
    throw unprocessable("Température non conforme : indiquez la décision prise (refus, acceptation sous réserve...).", "NOTE_REQUIRED", { field: "note" });
  }
  const receivedAt = body.receivedAt ?? today;
  if (body.dlc < receivedAt) throw unprocessable("La DLC ne peut pas précéder la date de réception.", "DLC_BEFORE_RECEPTION", { field: "dlc" });

  const lot = await Lot.create({ establishmentId: est._id, ...body, receivedAt, receptionTemp: body.receptionTemp ?? null, createdBy: name });
  await audit(req, { action: "lot.create", entity: "lot", entityId: String(lot._id), meta: { product: lot.product, lotNumber: lot.lotNumber } });
  res.status(201).json(presentLot(lot, today, est.settings.dlcSoonDays));
});

async function loadLot(req: Parameters<typeof getEst>[0]) {
  const est = getEst(req);
  const lot = await Lot.findOne({ _id: oid(req.params.id, "Lot"), establishmentId: est._id });
  if (!lot) throw notFound("Lot introuvable.");
  return { est, lot };
}

router.get("/:id", async (req, res) => {
  const { est, lot } = await loadLot(req);
  res.json(presentLot(lot, nowInTz(est.timezone).date, est.settings.dlcSoonDays));
});

router.patch("/:id", requireAccess("tracabilite", "write"), async (req, res) => {
  const { est, lot } = await loadLot(req);
  const body = lotSchema.partial().parse(req.body);
  const nextCategory = body.category ?? lot.category;
  const nextTemp = body.receptionTemp !== undefined ? body.receptionTemp : lot.receptionTemp;
  const nextNote = body.note !== undefined ? body.note : lot.note;
  if (!isTempOk(nextCategory, nextTemp) && !nextNote?.trim()) {
    throw unprocessable("Température non conforme : indiquez la décision prise.", "NOTE_REQUIRED", { field: "note" });
  }
  Object.assign(lot, body, { receptionTemp: nextTemp ?? null });
  await lot.save();
  await audit(req, { action: "lot.update", entity: "lot", entityId: String(lot._id), meta: { fields: Object.keys(body) } });
  res.json(presentLot(lot, nowInTz(est.timezone).date, est.settings.dlcSoonDays));
});

const closeSchema = z.object({ note: optText(500) });

async function close(req: Parameters<typeof getEst>[0], state: "used" | "discarded") {
  const { est, lot } = await loadLot(req);
  if (lot.state !== "stock") throw unprocessable("Ce lot est déjà clôturé.", "LOT_CLOSED");
  const { note } = closeSchema.parse(req.body ?? {});
  const today = nowInTz(est.timezone).date;
  lot.state = state;
  lot.closedAt = today;
  if (note) lot.note = note;
  await lot.save();
  await audit(req, { action: state === "used" ? "lot.use" : "lot.discard", entity: "lot", entityId: String(lot._id), meta: { note } });
  return presentLot(lot, today, est.settings.dlcSoonDays);
}

router.post("/:id/use", requireAccess("tracabilite", "write"), async (req, res) => res.json(await close(req, "used")));
router.post("/:id/discard", requireAccess("tracabilite", "write"), async (req, res) => res.json(await close(req, "discarded")));

export default router;
