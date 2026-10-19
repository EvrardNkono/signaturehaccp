"use client";

import { useState } from "react";
import { Droplet, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import {
  Aspect,
  Fryer,
  OilInput,
  OilLimits,
  Slot,
  aspectLabels,
  formatPolar,
  getOilStatus,
  parseNumber,
  slotLabels,
  statusLabels,
  tone,
} from "@/lib/huile";
import { hhmm, timeAgo } from "@/lib/time";

const inputClass =
  "min-h-11 w-full rounded-xl border border-ivory-300 bg-white px-3 text-base outline-none focus:border-gold-500";

export function FryerForm({
  fryer,
  limits,
  tz,
  canWrite,
  onSubmit,
  onOilChanged,
}: {
  fryer: Fryer;
  limits: OilLimits;
  tz: string;
  canWrite: boolean;
  /** Retourne un message d'erreur, ou null si l'enregistrement a réussi. */
  onSubmit: (input: OilInput) => Promise<string | null>;
  onOilChanged: (fryerId: string) => Promise<string | null>;
}) {
  const [temp, setTemp] = useState("");
  const [polar, setPolar] = useState("");
  const [aspect, setAspect] = useState<Aspect>("normal");
  const [action, setAction] = useState("");
  const [slotChoice, setSlotChoice] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const last = fryer.lastControl;
  const takenSlots = fryer.slotsDone;
  const slot: Slot = slotChoice ?? (takenSlots.includes("morning") ? "evening" : "morning");

  const t = parseNumber(temp);
  const p = parseNumber(polar);
  const valid = t !== null && p !== null && p >= 0 && p <= 100;
  const live = valid ? getOilStatus(p, t, aspect, limits) : null;
  const needsAction = live === "change";
  const blocked = !valid || (needsAction && action.trim().length < 3);

  const submit = async () => {
    if (!valid || blocked || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({
      fryerId: fryer.id,
      slot,
      temp: t,
      polar: p,
      aspect,
      action: action.trim() || undefined,
    });
    setBusy(false);
    if (err) return setError(err);
    setTemp("");
    setPolar("");
    setAspect("normal");
    setAction("");
    setSlotChoice(null);
  };

  const changed = async () => {
    setBusy(true);
    setError(null);
    const err = await onOilChanged(fryer.id);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Card className="overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-0.5 ${tone[live ?? last?.status ?? "ok"].bar}`} />

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ivory-200 text-ink-500">
          <Droplet size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium">{fryer.name}</p>
          <p className="text-xs text-ink-500">
            {fryer.zone} · Changer l&apos;huile à {limits.polarLimit} % de composés polaires
          </p>
        </div>
      </div>

      {last && (
        <p className="mt-3 text-xs text-ink-400">
          Dernier contrôle :{" "}
          <span className={`font-medium ${tone[last.status].text}`}>{formatPolar(last.polar)}</span> ·{" "}
          {timeAgo(last.at)} ({hhmm(last.at, tz)})
        </p>
      )}
      {fryer.lastChangeAt && (
        <p className="mt-1 text-xs text-ink-400">Dernier changement d&apos;huile : {timeAgo(fryer.lastChangeAt)}</p>
      )}

      {canWrite ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="block text-xs text-ink-500">
              Température (°C)
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex : 175"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-ink-500">
              Composés polaires (%)
              <input
                type="text"
                inputMode="decimal"
                placeholder="ex : 18"
                value={polar}
                onChange={(e) => setPolar(e.target.value)}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-xs text-ink-500">
              Aspect de l&apos;huile
              <select value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} className={`mt-1 ${inputClass}`}>
                {(Object.keys(aspectLabels) as Aspect[]).map((a) => (
                  <option key={a} value={a}>
                    {aspectLabels[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink-500">
              Contrôle
              <select value={slot} onChange={(e) => setSlotChoice(e.target.value as Slot)} className={`mt-1 ${inputClass}`}>
                {(Object.keys(slotLabels) as Slot[]).map((s) => (
                  <option key={s} value={s}>
                    {slotLabels[s]}
                    {takenSlots.includes(s) ? " (déjà fait)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {live && <p className={`mt-3 text-sm font-medium ${tone[live].text}`}>{statusLabels[live]}</p>}

          {(live === "warn" || live === "change") && (
            <textarea
              rows={2}
              placeholder={
                live === "change"
                  ? "Action corrective (obligatoire) : huile changée, date, personne"
                  : "Action corrective (facultatif)"
              }
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="mt-3 w-full rounded-xl border border-ivory-300 bg-white p-3 text-sm outline-none focus:border-gold-500"
            />
          )}

          <div className="mt-3">
            <InlineError message={error} />
          </div>

          <Button className="mt-4 w-full" onClick={submit} disabled={blocked || busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer le contrôle
          </Button>
          <Button variant="secondary" className="mt-2 w-full !min-h-10 !text-xs" onClick={changed} disabled={busy}>
            J&apos;ai changé l&apos;huile
          </Button>
        </>
      ) : (
        <p className="mt-4 text-xs text-ink-400">Lecture seule : votre rôle ne permet pas de saisir un contrôle.</p>
      )}
    </Card>
  );
}
