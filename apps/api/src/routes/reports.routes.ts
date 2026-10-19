import { Router } from "express";
import { getEst } from "../middleware/auth";
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

export default router;
