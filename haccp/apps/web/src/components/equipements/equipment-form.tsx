"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Equipment, EquipmentType, typeLabels } from "@/lib/equipment";

// Valeurs indicatives affichées en filigrane : les vrais défauts viennent des réglages de l'établissement.
const hints: Record<EquipmentType, { min: number; max: number }> = {
  fridge: { min: 0, max: 4 },
  coldroom: { min: 0, max: 3 },
  freezer: { min: -30, max: -18 },
  fryer: { min: 150, max: 180 },
};

const field =
  "mt-2 min-h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30";

export function EquipmentForm({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (e: Equipment) => void;
}) {
  const { ep } = useSession();
  const [name, setName] = useState("");
  const [type, setType] = useState<EquipmentType>("fridge");
  const [zone, setZone] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [sensor, setSensor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function reset() {
    setName("");
    setZone("");
    setMin("");
    setMax("");
    setSensor(false);
    setType("fridge");
    setError(null);
    setFieldErrors({});
  }

  async function submit() {
    const path = ep("/equipments");
    if (!path) return;
    if (!name.trim()) return setFieldErrors({ name: "Le nom est obligatoire." });
    if (!zone.trim()) return setFieldErrors({ zone: "La zone est obligatoire." });
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      // min / max vides = seuils par défaut de l'établissement (Paramètres)
      const created = await api<Equipment>(path, {
        method: "POST",
        body: {
          name: name.trim(),
          type,
          zone: zone.trim(),
          ...(min.trim() !== "" ? { min } : {}),
          ...(max.trim() !== "" ? { max } : {}),
          hasSensor: sensor,
        },
      });
      reset();
      onSaved(created);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFieldErrors(err.fields);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-ivory-50 shadow-lux transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-ivory-300 px-6 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div>
            <p className="eyebrow">Nouveau</p>
            <h2 className="text-3xl font-semibold">Ajouter un équipement</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-200">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <label className="block">
            <span className="text-sm font-medium">Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Chambre froide n°3" className={field} />
            {fieldErrors.name && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.name}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as EquipmentType)} className={field}>
              {(Object.keys(typeLabels) as EquipmentType[]).map((t) => (
                <option key={t} value={t}>{typeLabels[t]}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium">Zone</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Ex. Cuisine" className={field} />
            {fieldErrors.zone && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.zone}</span>}
          </label>

          <div>
            <p className="text-sm font-medium">Seuils de température (°C)</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs text-ink-500">Minimum</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={min}
                  onChange={(e) => setMin(e.target.value)}
                  placeholder={String(hints[type].min)}
                  className={field}
                />
                {fieldErrors.min && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.min}</span>}
              </label>
              <label className="block">
                <span className="text-xs text-ink-500">Maximum</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={max}
                  onChange={(e) => setMax(e.target.value)}
                  placeholder={String(hints[type].max)}
                  className={field}
                />
                {fieldErrors.max && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.max}</span>}
              </label>
            </div>
            <p className="mt-2 text-xs text-ink-500">
              Laissez vide pour appliquer les seuils par défaut de l&apos;établissement (Paramètres).
            </p>
          </div>

          <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-ivory-300 bg-white px-4">
            <span className="text-sm">Associer un capteur connecté</span>
            <input type="checkbox" checked={sensor} onChange={(e) => setSensor(e.target.checked)} className="h-5 w-5 accent-[#B8923F]" />
          </label>

          <InlineError message={error} />
        </div>

        <div className="flex gap-3 border-t border-ivory-300 px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" onClick={onClose} className="flex-1">Annuler</Button>
          <Button onClick={submit} disabled={busy} className="flex-1">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer
          </Button>
        </div>
      </aside>
    </>
  );
}
