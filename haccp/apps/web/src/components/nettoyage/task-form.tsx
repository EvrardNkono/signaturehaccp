"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { CleaningTask, Frequency, frequencyLabels } from "@/lib/nettoyage";

const field =
  "mt-2 min-h-12 w-full rounded-xl border border-ivory-300 bg-white px-4 text-sm outline-none transition placeholder:text-ink-400 focus:border-gold-400 focus:ring-2 focus:ring-gold-400/30";

const frequencyHints: Record<Frequency, string> = {
  daily: "Une fois par jour",
  after_service: "À chaque fin de service",
  weekly: "Une fois par semaine",
};

const frequencies = Object.keys(frequencyLabels) as Frequency[];

const TITLE_MAX = 160;
const METHOD_MAX = 400;

/**
 * Panneau latéral de création / modification d'une tâche de nettoyage.
 * Sans `task` : création (POST /cleaning). Avec `task` : modification (PATCH /cleaning/:id).
 */
export function TaskForm({
  open,
  task,
  zones,
  onClose,
  onSaved,
}: {
  open: boolean;
  task?: CleaningTask | null;
  zones: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { ep } = useSession();
  const editing = !!task;

  const [title, setTitle] = useState("");
  const [zone, setZone] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [method, setMethod] = useState("");
  const [dueTime, setDueTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Réinitialise le formulaire à chaque ouverture (vide en création, pré-rempli en modification).
  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setZone(task?.zone ?? "");
    setFrequency(task?.frequency ?? "daily");
    setMethod(task?.method ?? "");
    setDueTime(task?.dueTime ?? "10:00");
    setError(null);
    setFieldErrors({});
  }, [open, task]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit() {
    const path = editing ? ep(`/cleaning/${task!.id}`) : ep("/cleaning");
    if (!path) return;
    if (!title.trim()) return setFieldErrors({ title: "L'intitulé est obligatoire." });
    if (!zone.trim()) return setFieldErrors({ zone: "La zone est obligatoire." });
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return setFieldErrors({ dueTime: "Heure invalide." });

    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(path, {
        method: editing ? "PATCH" : "POST",
        body: { title: title.trim(), zone: zone.trim(), frequency, method: method.trim(), dueTime },
      });
      onSaved();
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
        aria-hidden={!open}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-ivory-50 shadow-lux transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between border-b border-ivory-300 px-6 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div>
            <p className="eyebrow">{editing ? "Modification" : "Nouvelle tâche"}</p>
            <h2 className="text-3xl font-semibold">
              {editing ? "Modifier la tâche" : "Ajouter une tâche"}
            </h2>
            <div className="ornament mt-3 w-24" />
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-500 hover:bg-ivory-200"
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <label className="block">
            <span className="text-sm font-medium">Intitulé</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Ex. Laver le sol de la cuisine"
              className={field}
            />
            {fieldErrors.title && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.title}</span>}
          </label>

          <label className="block">
            <span className="text-sm font-medium">Zone</span>
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              list="cleaning-zones"
              maxLength={80}
              placeholder="Ex. Cuisine"
              className={field}
            />
            <datalist id="cleaning-zones">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {fieldErrors.zone && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.zone}</span>}
          </label>

          <div>
            <p className="text-sm font-medium">Fréquence</p>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label="Fréquence">
              {frequencies.map((f) => {
                const active = frequency === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setFrequency(f)}
                    className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left transition ${
                      active
                        ? "border-ink-900 bg-ink-900 text-ivory-100"
                        : "border-ivory-300 bg-white text-ink-700 hover:border-gold-400"
                    }`}
                  >
                    <span className="text-sm font-medium">{frequencyLabels[f]}</span>
                    <span className={`text-xs ${active ? "text-gold-300" : "text-ink-400"}`}>
                      {frequencyHints[f]}
                    </span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.frequency && (
              <span className="mt-1 block text-xs text-status-critical">{fieldErrors.frequency}</span>
            )}
          </div>

          <label className="block">
            <span className="text-sm font-medium">Heure limite</span>
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className={field}
            />
            {fieldErrors.dueTime ? (
              <span className="mt-1 block text-xs text-status-critical">{fieldErrors.dueTime}</span>
            ) : (
              <span className="mt-2 block text-xs text-ink-500">
                Passé cette heure, la tâche non validée apparaît « en retard ».
              </span>
            )}
          </label>

          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-sm font-medium">
                Méthode <span className="font-normal text-ink-400">(facultatif)</span>
              </span>
              <span className="text-xs text-ink-400">
                {method.length} / {METHOD_MAX}
              </span>
            </span>
            <textarea
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              maxLength={METHOD_MAX}
              rows={4}
              placeholder="Ex. Détergent dégraissant, rinçage à l'eau claire, puis désinfectant (5 min de contact)."
              className={`${field} resize-none py-3 leading-relaxed`}
            />
            {fieldErrors.method && <span className="mt-1 block text-xs text-status-critical">{fieldErrors.method}</span>}
          </label>

          <InlineError message={error} />
        </div>

        <div className="flex gap-3 border-t border-ivory-300 px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy} className="flex-1">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null}
            {editing ? "Mettre à jour" : "Enregistrer"}
          </Button>
        </div>
      </aside>
    </>
  );
}
