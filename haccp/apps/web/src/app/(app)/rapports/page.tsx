"use client";

import { useState, type ReactNode } from "react";
import { Download, FileDown, Loader2, Printer } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PeriodExport } from "@/components/rapports/period-export";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { downloadFile, errorMessage } from "@/lib/api";
import { useSession, fullName } from "@/lib/session";
import { dateTime, hhmm, longDate as formatLongDate, todayIn } from "@/lib/time";
import { Equipment, Status, formatRange, formatTemp, getStatus, typeLabels } from "@/lib/equipment";
import { Reading, statusLabels as readingLabels } from "@/lib/releves";
import { CleaningTask, frequencyLabels } from "@/lib/nettoyage";
import { OilControl, aspectLabels, formatPolar, slotLabels, statusLabels as oilLabels } from "@/lib/huile";
import {
  Lot,
  categoryLabels,
  dayLabel,
  formatDate,
  statusLabels as dlcLabels,
} from "@/lib/tracabilite";
import { Alert, kindLabels, severityLabels, stateLabels } from "@/lib/alerts";
import type { SummaryItem } from "@/lib/rapports";

type ReportSummary = {
  date: string;
  score: number;
  summary: SummaryItem[];
  equipments: Equipment[];
  alerts: Alert[];
};

type SectionKey = "temperatures" | "releves" | "nettoyage" | "huile" | "tracabilite" | "alertes";

const sectionLabels: Record<SectionKey, string> = {
  temperatures: "Températures",
  releves: "Relevés du jour",
  nettoyage: "Nettoyage",
  huile: "Huile de friture",
  tracabilite: "Traçabilité",
  alertes: "Alertes",
};

const equipLabel: Record<Status, string> = {
  ok: "Conforme",
  warn: "À surveiller",
  critical: "Non conforme",
  offline: "Hors ligne",
};

const textTone: Record<string, string> = {
  good: "text-status-ok",
  warn: "text-status-warn",
  bad: "text-status-critical",
  mute: "text-ink-400",
};

const equipTone: Record<Status, string> = { ok: "good", warn: "warn", critical: "bad", offline: "mute" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-3 text-2xl font-semibold">{title}</h2>
      <Card className="print-card overflow-x-auto p-0">{children}</Card>
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead>
        <tr className="border-b border-ivory-200 text-xs text-ink-500">
          {head.map((h) => (
            <th key={h} className="px-4 py-3 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-ivory-200">{children}</tbody>
    </table>
  );
}

const td = "px-4 py-3 align-top";

export default function RapportsPage() {
  const { est, ep, user } = useSession();
  const tz = est?.timezone;
  const sumQ = useApi<ReportSummary>(ep("/reports/summary"));
  const rdQ = useApi<{ data: Reading[] }>(ep("/readings"), { limit: 200 });
  const clQ = useApi<{ data: CleaningTask[] }>(ep("/cleaning"));
  const oilQ = useApi<{ data: OilControl[] }>(ep("/oil/controls"), { limit: 200 });
  const lotQ = useApi<{ data: Lot[] }>(ep("/lots"), { limit: 200 });
  const [enabled, setEnabled] = useState<Record<SectionKey, boolean>>({
    temperatures: true,
    releves: true,
    nettoyage: true,
    huile: true,
    tracabilite: true,
    alertes: true,
  });
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const all = [sumQ, rdQ, clQ, oilQ, lotQ];
  const loading = all.some((q) => q.loading && !q.data);
  const error = all.find((q) => q.error)?.error ?? null;
  const reloadAll = () => all.forEach((q) => q.reload());

  if (loading || error || !sumQ.data || !rdQ.data || !clQ.data || !oilQ.data || !lotQ.data) {
    return (
      <>
        <Topbar title="Rapports" subtitle="Registre HACCP du jour" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          {error ? <ErrorBox message={error} onRetry={reloadAll} /> : <Loading />}
        </main>
      </>
    );
  }

  const today = todayIn(tz);
  const longDate = formatLongDate(tz) + " " + today.slice(0, 4);
  const { summary: items, score, equipments, alerts } = sumQ.data;
  const readings = rdQ.data.data;
  const tasks = clQ.data.data;
  const controls = oilQ.data.data;
  const lots = lotQ.data.data;

  const toggle = (k: SectionKey) => setEnabled((p) => ({ ...p, [k]: !p[k] }));

  const exportFile = async (kind: "csv" | "pdf") => {
    const path = ep(`/reports/export.${kind}`);
    if (!path) return;
    setExporting(kind);
    setExportError(null);
    try {
      await downloadFile(path, `registre-haccp-${today}.${kind}`);
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Topbar title="Rapports" subtitle="Registre HACCP du jour" />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        {/* En-tête visible uniquement à l'impression */}
        <div className="hidden border-b border-ink-900 pb-4 print:block">
          <p className="text-xs uppercase tracking-[0.3em]">Signature HACCP</p>
          <p className="font-display text-3xl font-semibold">Registre d'autocontrôle</p>
          <p className="mt-1 text-sm">
            {est?.name} · {longDate} · Édité par {user ? fullName(user) : ""}
          </p>
        </div>

        <div className="animate-fade-up print:hidden">
          <p className="eyebrow">Contrôle sanitaire</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Rapports</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        {/* Actions */}
        <Card className="space-y-4 p-5 md:p-6 print:hidden">
          <p className="text-sm text-ink-500">
            Registre du <span className="font-medium text-ink-900">{longDate}</span>. Choisissez les sections à inclure.
          </p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(sectionLabels) as SectionKey[]).map((k) => (
              <button
                key={k}
                onClick={() => toggle(k)}
                aria-pressed={enabled[k]}
                className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
                  enabled[k] ? "bg-ink-900 text-white" : "bg-ivory-200 text-ink-500 hover:text-ink-900"
                }`}
              >
                {sectionLabels[k]}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => window.print()} className="w-full sm:w-auto">
              <Printer size={16} strokeWidth={1.75} /> Imprimer / Enregistrer en PDF
            </Button>
            <Button variant="secondary" onClick={() => exportFile("pdf")} disabled={exporting !== null} className="w-full sm:w-auto">
              {exporting === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} strokeWidth={1.75} />} Télécharger le PDF
            </Button>
            <Button variant="secondary" onClick={() => exportFile("csv")} disabled={exporting !== null} className="w-full sm:w-auto">
              {exporting === "csv" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={1.75} />} Exporter en CSV
            </Button>
          </div>
          <InlineError message={exportError} />
        </Card>

        <PeriodExport equipments={equipments} tz={tz} />

        {/* Synthèse */}
        <section className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-5">
          <Card tone="dark" className="print-card lg:col-span-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-gold-400">Conformité du jour</p>
            <p className="mt-4 font-display text-6xl font-semibold">
              {score}
              <span className="text-2xl text-ink-400"> %</span>
            </p>
            <p className="mt-2 text-xs text-ink-400">Moyenne des six indicateurs ci-contre.</p>
          </Card>
          <Card className="print-card lg:col-span-3">
            <h2 className="text-2xl font-semibold">Synthèse</h2>
            <ul className="mt-4 space-y-3">
              {items.map((i) => (
                <li key={i.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{i.label}</span>
                  <span className="shrink-0 font-display text-lg">
                    {i.done}
                    <span className="text-ink-400"> / {i.total}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {enabled.temperatures && (
          <Section title="Températures des équipements">
            <Table head={["Équipement", "Type", "Plage", "Température", "Statut"]}>
              {equipments.map((e) => {
                const s = getStatus(e);
                return (
                  <tr key={e.id}>
                    <td className={`${td} font-medium`}>
                      {e.name}
                      <span className="block text-xs font-normal text-ink-400">{e.zone}</span>
                    </td>
                    <td className={td}>{typeLabels[e.type]}</td>
                    <td className={td}>{formatRange(e)}</td>
                    <td className={`${td} font-medium ${textTone[equipTone[s]]}`}>{formatTemp(e.temp)}</td>
                    <td className={`${td} ${textTone[equipTone[s]]}`}>{equipLabel[s]}</td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        )}

        {enabled.releves && (
          <Section title="Relevés du jour">
            <Table head={["Heure", "Équipement", "Valeur", "Statut", "Par", "Action corrective"]}>
              {readings.map((r) => (
                <tr key={r.id}>
                  <td className={td}>{hhmm(r.at, tz)}</td>
                  <td className={`${td} font-medium`}>{r.equipmentName}</td>
                  <td className={td}>{formatTemp(r.value)}</td>
                  <td
                    className={`${td} ${r.status === "ok" ? "text-status-ok" : r.status === "warn" ? "text-status-warn" : "text-status-critical"}`}
                  >
                    {readingLabels[r.status]}
                  </td>
                  <td className={td}>{r.by}</td>
                  <td className={`${td} text-xs`}>{r.action ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {enabled.nettoyage && (
          <Section title="Plan de nettoyage">
            <Table head={["Tâche", "Zone", "Fréquence", "Statut", "Validé par"]}>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className={`${td} font-medium`}>
                    {t.title}
                    <span className="block text-xs font-normal text-ink-400">{t.method}</span>
                  </td>
                  <td className={td}>{t.zone}</td>
                  <td className={td}>{frequencyLabels[t.frequency]}</td>
                  <td className={`${td} ${t.done ? "text-status-ok" : "text-status-warn"}`}>
                    {t.done ? "Fait" : `À faire avant ${t.dueTime}`}
                  </td>
                  <td className={td}>{t.done ? `${t.doneBy} à ${hhmm(t.doneAt, tz)}` : "—"}</td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {enabled.huile && (
          <Section title="Huile de friture">
            <Table head={["Quand", "Friteuse", "Polaires", "Température", "Aspect", "Statut", "Action corrective"]}>
              {controls.map((c) => (
                <tr key={c.id}>
                  <td className={td}>
                    Aujourd&apos;hui
                    <span className="block text-xs text-ink-400">
                      {slotLabels[c.slot]} · {hhmm(c.at, tz)}
                    </span>
                  </td>
                  <td className={`${td} font-medium`}>{c.fryerName}</td>
                  <td className={td}>{formatPolar(c.polar)}</td>
                  <td className={td}>{c.temp} °C</td>
                  <td className={td}>{aspectLabels[c.aspect]}</td>
                  <td
                    className={`${td} ${c.status === "ok" ? "text-status-ok" : c.status === "warn" ? "text-status-warn" : "text-status-critical"}`}
                  >
                    {oilLabels[c.status]}
                  </td>
                  <td className={`${td} text-xs`}>{c.action ?? "—"}</td>
                </tr>
              ))}
            </Table>
            <p className="border-t border-ivory-200 px-4 py-3 text-xs text-ink-400">
              {controls.length} contrôle(s) enregistré(s) aujourd&apos;hui.
            </p>
          </Section>
        )}

        {enabled.tracabilite && (
          <Section title="Traçabilité et DLC">
            <Table head={["Produit", "Lot", "Fournisseur", "Quantité", "DLC", "Statut"]}>
              {lots.map((l) => {
                const days = l.daysLeft;
                const s = l.dlcStatus ?? "ok";
                const closed = l.state !== "stock";
                return (
                  <tr key={l.id}>
                    <td className={`${td} font-medium`}>
                      {l.product}
                      <span className="block text-xs font-normal text-ink-400">{categoryLabels[l.category]}</span>
                    </td>
                    <td className={td}>{l.lotNumber}</td>
                    <td className={td}>{l.supplier}</td>
                    <td className={td}>{l.quantity}</td>
                    <td className={td}>
                      {formatDate(l.dlc)}
                      {!closed && <span className="block text-xs text-ink-400">{dayLabel(days)}</span>}
                    </td>
                    <td
                      className={`${td} ${
                        closed ? "text-ink-400" : s === "ok" ? "text-status-ok" : s === "soon" ? "text-status-warn" : "text-status-critical"
                      }`}
                    >
                      {closed ? (l.state === "used" ? "Utilisé" : "Jeté") : dlcLabels[s]}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Section>
        )}

        {enabled.alertes && (
          <Section title="Alertes et actions correctives (30 derniers jours)">
            <Table head={["Gravité", "Alerte", "Équipement", "Statut", "Créée", "Action corrective"]}>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td
                    className={`${td} ${a.severity === "critical" ? "text-status-critical" : a.severity === "warn" ? "text-status-warn" : "text-ink-500"}`}
                  >
                    {severityLabels[a.severity]}
                  </td>
                  <td className={`${td} font-medium`}>
                    {a.title}
                    <span className="block text-xs font-normal text-ink-400">{kindLabels[a.kind]}</span>
                  </td>
                  <td className={td}>{a.equipment ?? "—"}</td>
                  <td className={td}>{stateLabels[a.state]}</td>
                  <td className={td}>{dateTime(a.createdAt, tz)}</td>
                  <td className={`${td} text-xs`}>{a.correctiveAction ?? "—"}</td>
                </tr>
              ))}
            </Table>
          </Section>
        )}

        {/* Signature, visible uniquement à l'impression */}
        <div className="hidden grid-cols-2 gap-8 pt-8 text-sm print:grid">
          <div>
            <p>Responsable :</p>
            <div className="mt-10 border-b border-ink-900" />
          </div>
          <div>
            <p>Date et signature :</p>
            <div className="mt-10 border-b border-ink-900" />
          </div>
        </div>
      </main>
    </>
  );
}