"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { InlineError } from "@/components/ui/state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Category,
  LotInput,
  categoryLabels,
  isTempOk,
  maxReceptionTemp,
  parseTemp,
} from "@/lib/tracabilite";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-ivory-300 bg-white px-3 text-base outline-none focus:border-gold-500";

export function LotForm({
  onSubmit,
  onCancel,
}: {
  /** Retourne un message d'erreur, ou null si la réception a été enregistrée. */
  onSubmit: (input: LotInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [product, setProduct] = useState("");
  const [supplier, setSupplier] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [category, setCategory] = useState<Category>("meat");
  const [quantity, setQuantity] = useState("");
  const [dlc, setDlc] = useState("");
  const [temp, setTemp] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = parseTemp(temp);
  const max = maxReceptionTemp[category];
  const tempBad = !isTempOk(category, t);
  const baseValid = product.trim() && lotNumber.trim() && dlc && (max === null || t !== null);
  const blocked = !baseValid || (tempBad && !note.trim());

  const submit = async () => {
    if (blocked || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({
      product: product.trim(),
      supplier: supplier.trim() || "Non précisé",
      lotNumber: lotNumber.trim(),
      category,
      quantity: quantity.trim() || "—",
      dlc,
      receptionTemp: t,
      note: note.trim() || undefined,
    });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-2xl font-semibold">Nouvelle réception</h2>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="block text-xs text-ink-500">
          Produit *
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="ex : Filet de poulet" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500">
          Fournisseur
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="ex : Boucherie Martin" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500">
          N° de lot *
          <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="ex : BM-24811" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500">
          Catégorie
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>
            {(Object.keys(categoryLabels) as Category[]).map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink-500">
          Quantité
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="ex : 6 kg" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500">
          DLC / DDM *
          <input type="date" value={dlc} onChange={(e) => setDlc(e.target.value)} className={inputClass} />
        </label>
        {max !== null && (
          <label className="block text-xs text-ink-500">
            Température à réception (°C) * · max {max} °C
            <input
              type="text"
              inputMode="decimal"
              value={temp}
              onChange={(e) => setTemp(e.target.value)}
              placeholder="ex : 3,2"
              className={inputClass}
            />
          </label>
        )}
      </div>

      {tempBad && (
        <>
          <p className="mt-3 text-sm font-medium text-status-critical">
            Température non conforme (maximum {max} °C)
          </p>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Décision (obligatoire) : livraison refusée, acceptée sous réserve, etc."
            className="mt-2 w-full rounded-xl border border-ivory-300 bg-white p-3 text-sm outline-none focus:border-gold-500"
          />
        </>
      )}

      <div className="mt-4">
        <InlineError message={error} />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button onClick={submit} disabled={blocked || busy} className="w-full sm:w-auto">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer la réception
        </Button>
        <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
          Annuler
        </Button>
      </div>
    </Card>
  );
}