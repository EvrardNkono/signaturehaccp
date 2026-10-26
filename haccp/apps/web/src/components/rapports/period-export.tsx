"use client";

import { useState } from "react";
import { Download, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InlineError } from "@/components/ui/state";
import { downloadFile, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { todayIn } from "@/lib/time";

const field =
  "mt-2 min-h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30";

/** Durée maximale d'un export, identique à celle de l'API (366 jours). */
const MAX_DAYS = 366;

const presets = [
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
  { label: "3 mois", days: 90 },
  { label: "12 mois", days: 365 },
];

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const spanDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

/** Export des relevés de température sur une période choisie (jusqu'à 12 mois), en PDF ou en CSV. */
export function PeriodExport({
  equipments,
  tz,
}: {
  equipments: { id: string; name: string }[];
  tz?: string;
}) {
  const { ep } = useSession();
  const today = todayIn(tz);
  const [from, setFrom] = useState(() => addDays(today, -29));
  const [to, setTo] = useState(today);
  const [equipmentId, setEquipmentId] = useState("");
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = from && to ? spanDays(from, to) : 0;
  const activePreset = presets.find((p) => to === today && from === addDays(today, -(p.days - 1)))?.days;

  const applyPreset = (n: number) => {
    setTo(today);
    setFrom(addDays(today, -(n - 1)));
    setError(null);
  };

  const validate = (): string | null => {
    if (!from || !to) return "Choisissez une date de début et une date de fin.";
    if (from > to) return "La date de début doit précéder la date de fin.";
    if (days > MAX_DAYS) return "La période ne peut pas dépasser 12 mois.";
    return null;
  };

  const run = async (kind: "csv" | "pdf") => {
    const invalid = validate();
    if (invalid) return setError(invalid);
    const base = ep(`/reports/readings.${kind}`);
    if (!base) return;
    const qs = new URLSearchParams({ from, to, ...(equipmentId ? { equipmentId } : {}) });
    setBusy(kind);
    setError(null);
    try {
      await downloadFile(`${base}?${qs.toString()}`, `releves-${from}_${to}.${kind}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-5 p-5 md:p-6 print:hidden">
      <div>
        <p className="eyebrow">Archives</p>
        <h2 className="mt-1 text-2xl font-semibold">Export des relevés par période</h2>
        <div className="ornament mt-3 max-w-[8rem]" />
        <p className="mt-3 text-sm text-ink-500">
          Les relevés de température sont conservés au moins 12 mois. Choisissez la période à exporter, jusqu&apos;à
          12 mois d&apos;un seul tenant.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => applyPreset(p.days)}
            aria-pressed={activePreset === p.days}
            className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
              activePreset === p.days ? "bg-ink-900 text-white" : "bg-ivory-200 text-ink-500 hover:text-ink-900"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Du</span>
          <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Au</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Équipement</span>
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)} className={field}>
            <option value="">Tous les équipements</option>
            {equipments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {days > 0 && (
        <p className={`text-xs ${days > MAX_DAYS ? "text-status-critical" : "text-ink-500"}`}>
          {days} jour{days > 1 ? "s" : ""} sélectionné{days > 1 ? "s" : ""}
          {days > MAX_DAYS ? " — maximum 12 mois par export." : "."}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="secondary" onClick={() => run("pdf")} disabled={busy !== null} className="w-full sm:w-auto">
          {busy === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} strokeWidth={1.75} />}{" "}
          Télécharger le PDF
        </Button>
        <Button onClick={() => run("csv")} disabled={busy !== null} className="w-full sm:w-auto">
          {busy === "csv" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={1.75} />}{" "}
          Exporter en CSV
        </Button>
      </div>
      <InlineError message={error} />
    </Card>
  );
}
