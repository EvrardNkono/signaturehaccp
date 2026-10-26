import { once } from "node:events";
import type { Response } from "express";
import { HydratedDocument } from "mongoose";
import PDFDocument from "pdfkit";
import { IEstablishment, Reading } from "../models";
import { formatTemp } from "../domain/format";
import { csvCell } from "./reportService";

/** Filtre Mongo (établissement + période + équipement éventuel) construit par la route. */
export type ReadingExportFilter = Record<string, unknown>;

const statusLabel = { ok: "Conforme", warn: "À surveiller", critical: "Critique" } as const;
const sourceLabel = { manual: "Saisie manuelle", iot: "Capteur" } as const;

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dateTimeFormatter = (tz: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });

/** Température numérique (virgule décimale, Excel FR) : aucune neutralisation, c'est une valeur calculée par le serveur. */
const csvNumber = (v: number) => `"${String(Math.round(v * 100) / 100).replace(".", ",")}"`;

const CSV_HEADER = ["Date / heure", "Équipement", "Température (°C)", "Statut", "Source", "Responsable", "Action corrective"];
const CSV_BATCH = 500;

/** Écrit le CSV des relevés au fil de l'eau (un an de relevés capteurs peut peser plusieurs dizaines de Mo). Renvoie le nombre de lignes. */
export async function streamReadingsCsv(res: Response, filter: ReadingExportFilter, tz: string): Promise<number> {
  const fmt = dateTimeFormatter(tz);
  const write = async (chunk: string) => {
    if (!res.write(chunk)) await once(res, "drain");
  };

  // BOM UTF-8 pour Excel ; séparateur ";" (Excel FR).
  await write("\uFEFF" + CSV_HEADER.map(csvCell).join(";") + "\r\n");

  let rows = 0;
  let batch: string[] = [];
  for await (const r of Reading.find(filter).sort({ at: 1 }).lean().cursor()) {
    batch.push(
      [
        csvCell(fmt.format(r.at)),
        csvCell(r.equipmentName),
        csvNumber(r.value),
        csvCell(statusLabel[r.status]),
        csvCell(sourceLabel[r.source]),
        csvCell(r.by),
        csvCell(r.action),
      ].join(";")
    );
    rows++;
    if (batch.length >= CSV_BATCH) {
      await write(batch.join("\r\n") + "\r\n");
      batch = [];
    }
  }
  if (batch.length) await write(batch.join("\r\n") + "\r\n");
  return rows;
}

/** Au-delà, le PDF ne détaille que les relevés non conformes (le détail complet reste disponible en CSV). */
export const PDF_DETAIL_MAX = 2000;

/**
 * Génère le PDF des relevés d'une période : synthèse par équipement, puis détail.
 * Le document est relié à la réponse ; l'appelant doit appeler `doc.end()` une fois ses propres traitements terminés.
 */
export async function writeReadingsPdf(
  res: Response,
  est: HydratedDocument<IEstablishment>,
  opts: { from: string; to: string; filter: ReadingExportFilter; equipmentName?: string }
): Promise<{ doc: PDFKit.PDFDocument; total: number }> {
  const tz = est.timezone;
  const fmt = dateTimeFormatter(tz);

  const stats = await Reading.aggregate<{
    _id: unknown;
    name: string;
    count: number;
    min: number;
    max: number;
    avg: number;
    warn: number;
    critical: number;
  }>(
    [
      { $match: opts.filter },
      {
        $group: {
          _id: "$equipmentId",
          name: { $first: "$equipmentName" },
          count: { $sum: 1 },
          min: { $min: "$value" },
          max: { $max: "$value" },
          avg: { $avg: "$value" },
          warn: { $sum: { $cond: [{ $eq: ["$status", "warn"] }, 1, 0] } },
          critical: { $sum: { $cond: [{ $eq: ["$status", "critical"] }, 1, 0] } },
        },
      },
      { $sort: { name: 1 } },
    ],
    { allowDiskUse: true }
  );
  const total = stats.reduce((n, s) => n + s.count, 0);
  const nonOk = stats.reduce((n, s) => n + s.warn + s.critical, 0);

  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: `Relevés de température — ${est.name}`, Author: "Signature HACCP" },
  });
  doc.pipe(res);

  const gold = "#8a6a1f";
  const ink = "#1d1b17";
  const grey = "#6b665c";

  doc.fillColor(gold).font("Helvetica-Bold").fontSize(22).text("Signature HACCP");
  doc.moveDown(0.2).fillColor(ink).fontSize(15).text("Registre des relevés de température");
  doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor(grey);
  doc.text(`${est.name}${est.city ? ` · ${est.city}` : ""}${est.siret ? ` · SIRET ${est.siret}` : ""}`);
  doc.text(`Période du ${fmtDate(opts.from)} au ${fmtDate(opts.to)}${opts.equipmentName ? ` · ${opts.equipmentName}` : " · tous les équipements"}`);
  doc.text(`Édité le ${fmt.format(new Date())} (${tz})`);

  const section = (title: string) => {
    doc.moveDown(1).fillColor(gold).font("Helvetica-Bold").fontSize(12).text(title);
    doc.moveDown(0.2).fillColor(ink).font("Helvetica").fontSize(9.5);
  };
  const line = (txt: string) => {
    if (doc.y > 770) doc.addPage();
    doc.text(txt, { lineGap: 1.5 });
  };

  doc.moveDown(1).fillColor(ink).font("Helvetica-Bold").fontSize(12).text(`${total} relevé${total > 1 ? "s" : ""} sur la période`);
  doc.font("Helvetica").fontSize(10).text(`${nonOk} relevé${nonOk > 1 ? "s" : ""} non conforme${nonOk > 1 ? "s" : ""} (à surveiller ou critique).`);

  section("Synthèse par équipement");
  if (stats.length === 0) line("Aucun relevé sur cette période.");
  stats.forEach((s) =>
    line(
      `${s.name} — ${s.count} relevé${s.count > 1 ? "s" : ""} — min ${formatTemp(s.min)} · moy ${formatTemp(s.avg)} · max ${formatTemp(s.max)} — ${s.warn} à surveiller, ${s.critical} critique${s.critical > 1 ? "s" : ""}`
    )
  );

  const truncated = total > PDF_DETAIL_MAX;
  section(truncated ? "Détail des relevés non conformes" : "Détail des relevés");
  if (truncated) {
    line(
      `La période compte ${total} relevés : seuls les relevés à surveiller ou critiques sont détaillés ici. Le détail complet est disponible dans l'export CSV.`
    );
    doc.moveDown(0.3);
  }

  const detailFilter = truncated ? { ...opts.filter, status: { $in: ["warn", "critical"] } } : opts.filter;
  let shown = 0;
  for await (const r of Reading.find(detailFilter).sort({ at: 1 }).limit(PDF_DETAIL_MAX).lean().cursor()) {
    line(
      `${fmt.format(r.at)} — ${r.equipmentName} — ${formatTemp(r.value)} — ${statusLabel[r.status]} — ${r.by}${r.action ? ` — Action : ${r.action}` : ""}`
    );
    shown++;
  }
  if (shown === 0 && !truncated && total > 0) line("Aucun détail à afficher.");
  if (truncated && nonOk > PDF_DETAIL_MAX) line(`… ${nonOk - PDF_DETAIL_MAX} autres relevés non conformes : voir l'export CSV.`);

  return { doc, total };
}
