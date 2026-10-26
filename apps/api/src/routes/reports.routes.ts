import { Request, Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Equipment } from "../models";
import { getEst } from "../middleware/auth";
import { dayBounds } from "../domain/time";
import { notFound, unprocessable } from "../utils/httpError";
import { oid } from "../utils/mongo";
import { logger } from "../config/logger";
import { streamReadingsCsv, writeReadingsPdf } from "../services/readingExportService";
import { isoDay, objectId } from "./helpers";
import { audit } from "../services/audit";
import { buildCsv, buildPdf, buildReportData } from "../services/reportService";
import { presentAlert, presentEquipment } from "../services/presenters";

const router = Router({ mergeParams: true });

const stamp = (d: Date) => d.toISOString().slice(0, 10);
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "etablissement";

/** Synthèse de conformité du jour (même calcul que le tableau de bord). */
router.get("/summary", async (req, res) => {
  const est = getEst(req);
  const { d, items, score } = await buildReportData(est);
  res.json({
    date: d.today,
    score,
    summary: items,
    equipments: d.equipments.map(presentEquipment),
    alerts: d.alerts.map((a) => presentAlert(a, d.now)),
  });
});

router.get("/export.csv", async (req, res) => {
  const est = getEst(req);
  const { d } = await buildReportData(est);
  await audit(req, { action: "report.export_csv", entity: "report" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="registre-${slug(est.name)}-${stamp(d.now)}.csv"`);
  res.send(buildCsv(est, d));
});

router.get("/export.pdf", async (req, res) => {
  const est = getEst(req);
  const { d, ...summary } = await buildReportData(est);
  await audit(req, { action: "report.export_pdf", entity: "report" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="rapport-${slug(est.name)}-${stamp(d.now)}.pdf"`);
  const pdf = buildPdf(est, d, summary);
  pdf.pipe(res);
});

/** Durée maximale d'un export de relevés : un an (366 jours, année bissextile comprise). */
const MAX_EXPORT_DAYS = 366;

const periodQuery = z.object({ from: isoDay, to: isoDay, equipmentId: objectId.optional() });

/** Valide la période demandée (jours locaux de l'établissement) et construit le filtre des relevés à exporter. */
async function readingsExportScope(req: Request) {
  const est = getEst(req);
  const q = periodQuery.parse(req.query);

  if (q.from > q.to) throw unprocessable("La date de début doit précéder la date de fin.", "PERIOD_INVALID", { field: "from" });
  const days = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_EXPORT_DAYS) throw unprocessable("La période ne peut pas dépasser 12 mois.", "PERIOD_TOO_LONG", { field: "to" });

  let equipmentName: string | undefined;
  const filter: Record<string, unknown> = {
    establishmentId: est._id,
    at: { $gte: dayBounds(est.timezone, q.from).start, $lt: dayBounds(est.timezone, q.to).end },
  };
  if (q.equipmentId) {
    const equipment = await Equipment.findOne({ _id: oid(q.equipmentId, "Équipement"), establishmentId: est._id });
    if (!equipment) throw notFound("Équipement introuvable.");
    filter.equipmentId = new Types.ObjectId(q.equipmentId);
    equipmentName = equipment.name;
  }
  return { est, q, filter, equipmentName };
}

/** Relevés de température d'une période (jusqu'à 12 mois), au format CSV. Exemple : ?from=2026-01-01&to=2026-03-31 */
router.get("/readings.csv", async (req, res) => {
  const { est, q, filter } = await readingsExportScope(req);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="releves-${slug(est.name)}-${q.from}_${q.to}.csv"`);
  try {
    const rows = await streamReadingsCsv(res, filter, est.timezone);
    await audit(req, { action: "report.export_readings_csv", entity: "report", meta: { from: q.from, to: q.to, equipmentId: q.equipmentId, rows } });
    res.end();
  } catch (err) {
    if (!res.headersSent) throw err;
    logger.error({ err }, "Échec de l'export CSV des relevés");
    res.destroy();
  }
});

/** Relevés de température d'une période (jusqu'à 12 mois), au format PDF : synthèse par équipement puis détail. */
router.get("/readings.pdf", async (req, res) => {
  const { est, q, filter, equipmentName } = await readingsExportScope(req);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="releves-${slug(est.name)}-${q.from}_${q.to}.pdf"`);
  try {
    const { doc, total } = await writeReadingsPdf(res, est, { from: q.from, to: q.to, filter, equipmentName });
    await audit(req, { action: "report.export_readings_pdf", entity: "report", meta: { from: q.from, to: q.to, equipmentId: q.equipmentId, rows: total } });
    doc.end();
  } catch (err) {
    if (!res.headersSent) throw err;
    logger.error({ err }, "Échec de l'export PDF des relevés");
    res.destroy();
  }
});

export default router;
