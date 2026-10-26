import PDFDocument from "pdfkit";
import { HydratedDocument } from "mongoose";
import { IEstablishment } from "../models";
import { collectDayData, buildSummary, DayData } from "./dashboardService";
import { presentAlert, presentEquipment } from "./presenters";
import { formatPolar, formatRange, formatTemp } from "../domain/format";
import { daysUntil, getDlcStatus } from "../domain/traceability";

const statusLabel = { ok: "Conforme", warn: "À surveiller", critical: "Non conforme", offline: "Hors ligne" } as const;
const readingLabel = { ok: "Conforme", warn: "À surveiller", critical: "Critique" } as const;
const oilLabel = { ok: "Conforme", warn: "À surveiller", change: "Huile à changer" } as const;
const dlcLabel = { expired: "Périmé", today: "Expire aujourd'hui", soon: "Expire bientôt", ok: "Valide" } as const;
const sevLabel = { critical: "Critique", warn: "Attention", info: "Info" } as const;
const stateLabel = { open: "Ouverte", in_progress: "En cours", resolved: "Résolue" } as const;

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmtDateTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(d);

/** Protège contre l'injection de formules dans Excel (cellules commençant par = + - @). */
export const csvCell = (v: string | number | undefined | null) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function buildReportData(est: HydratedDocument<IEstablishment>) {
  const d = await collectDayData(est);
  return { d, ...buildSummary(d) };
}

export function buildCsv(est: HydratedDocument<IEstablishment>, d: DayData): string {
  const tz = est.timezone;
  const rows: (string | number | undefined)[][] = [
    ["Domaine", "Élément", "Détail", "Valeur", "Statut", "Date / heure", "Responsable", "Action corrective"],
  ];

  d.equipments.forEach((e) => {
    const p = presentEquipment(e);
    rows.push(["Équipement", e.name, `Plage ${formatRange(e.min, e.max)}`, formatTemp(e.temp), statusLabel[p.status], e.lastReadingAt ? fmtDateTime(e.lastReadingAt, tz) : "", "", ""]);
  });
  d.readings.forEach((r) =>
    rows.push(["Relevé", r.equipmentName, r.source === "iot" ? "Capteur" : "Saisie manuelle", formatTemp(r.value), readingLabel[r.status], fmtDateTime(r.at, tz), r.by, r.action])
  );
  d.cleaning.tasks.forEach((t) =>
    rows.push(["Nettoyage", t.title, `${t.zone} · ${t.method}`, "", t.done ? "Fait" : "À faire", t.doneAt ? fmtDateTime(new Date(t.doneAt), tz) : `Avant ${t.dueTime}`, t.doneBy, ""])
  );
  d.oil.forEach((c) =>
    rows.push(["Huile", c.fryerName, `Température ${c.temp} °C`, formatPolar(c.polar), oilLabel[c.status], fmtDateTime(c.at, tz), c.by, c.action])
  );
  d.lots.forEach((l) =>
    rows.push(["Traçabilité", l.product, `Lot ${l.lotNumber} · ${l.supplier}`, l.quantity, dlcLabel[getDlcStatus(daysUntil(l.dlc, d.today), est.settings.dlcSoonDays)], `DLC ${fmtDate(l.dlc)}`, "", l.note])
  );
  d.alerts.forEach((a) => {
    const p = presentAlert(a, d.now);
    rows.push(["Alerte", a.title, a.equipmentName ?? "", a.value ?? "", `${sevLabel[p.severity]} · ${stateLabel[p.state]}`, fmtDateTime(a.createdAt, tz), a.resolvedBy ?? a.takenBy ?? "", a.correctiveAction]);
  });

  // BOM UTF-8 pour que Excel lise correctement les accents ; séparateur ";" (Excel FR).
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

export function buildPdf(est: HydratedDocument<IEstablishment>, d: DayData, summary: ReturnType<typeof buildSummary>): PDFKit.PDFDocument {
  const tz = est.timezone;
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Rapport de conformité — ${est.name}`, Author: "Signature HACCP" } });

  const gold = "#8a6a1f";
  const ink = "#1d1b17";
  const grey = "#6b665c";

  doc.fillColor(gold).font("Helvetica-Bold").fontSize(22).text("Signature HACCP");
  doc.moveDown(0.2).fillColor(ink).fontSize(15).text("Rapport de conformité");
  doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor(grey);
  doc.text(`${est.name}${est.city ? ` · ${est.city}` : ""}${est.siret ? ` · SIRET ${est.siret}` : ""}`);
  doc.text(`Édité le ${fmtDateTime(d.now, tz)} (${tz}) · Journée du ${fmtDate(d.today)}`);

  doc.moveDown(1).fillColor(ink).font("Helvetica-Bold").fontSize(12).text(`Score de conformité : ${summary.score} %`);
  doc.moveDown(0.4).font("Helvetica").fontSize(10);
  summary.items.forEach((i) => doc.text(`•  ${i.label} : ${i.done} / ${i.total}`));

  const section = (title: string) => {
    doc.moveDown(1).fillColor(gold).font("Helvetica-Bold").fontSize(12).text(title);
    doc.moveDown(0.2).fillColor(ink).font("Helvetica").fontSize(9.5);
  };
  const line = (txt: string) => {
    if (doc.y > 770) doc.addPage();
    doc.text(txt, { lineGap: 1.5 });
  };

  section("Équipements");
  if (d.equipments.length === 0) line("Aucun équipement.");
  d.equipments.forEach((e) => {
    const p = presentEquipment(e);
    line(`${e.name} (${e.zone}) — ${formatTemp(e.temp)} — plage ${formatRange(e.min, e.max)} — ${statusLabel[p.status]}`);
  });

  section("Relevés de température du jour");
  if (d.readings.length === 0) line("Aucun relevé aujourd'hui.");
  d.readings.slice(0, 60).forEach((r) =>
    line(`${fmtDateTime(r.at, tz)} — ${r.equipmentName} — ${formatTemp(r.value)} — ${readingLabel[r.status]} — ${r.by}${r.action ? ` — Action : ${r.action}` : ""}`)
  );

  section("Plan de nettoyage");
  d.cleaning.tasks.forEach((t) => line(`${t.done ? "[x]" : "[ ]"} ${t.title} (${t.zone}) — avant ${t.dueTime}${t.done ? ` — fait par ${t.doneBy}` : ""}`));

  section("Huile de friture");
  if (d.oil.length === 0) line("Aucun contrôle aujourd'hui.");
  d.oil.forEach((c) => line(`${fmtDateTime(c.at, tz)} — ${c.fryerName} — ${formatPolar(c.polar)} composés polaires, ${c.temp} °C — ${oilLabel[c.status]} — ${c.by}${c.action ? ` — Action : ${c.action}` : ""}`));

  section("Traçabilité — lots en stock");
  if (d.lots.length === 0) line("Aucun lot en stock.");
  d.lots.slice(0, 80).forEach((l) => line(`${l.product} — lot ${l.lotNumber} — ${l.supplier} — DLC ${fmtDate(l.dlc)} (${dlcLabel[getDlcStatus(daysUntil(l.dlc, d.today), est.settings.dlcSoonDays)]})`));

  section("Alertes (30 derniers jours)");
  if (d.alerts.length === 0) line("Aucune alerte.");
  d.alerts.slice(0, 80).forEach((a) => {
    const p = presentAlert(a, d.now);
    line(`${fmtDateTime(a.createdAt, tz)} — ${sevLabel[p.severity]} / ${stateLabel[p.state]} — ${a.title}${a.equipmentName ? ` (${a.equipmentName})` : ""}${a.correctiveAction ? ` — Action : ${a.correctiveAction}` : ""}`);
  });

  doc.end();
  return doc;
}
