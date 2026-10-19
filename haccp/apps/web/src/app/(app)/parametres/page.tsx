"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox, InlineError, Loading } from "@/components/ui/state";
import { useApi } from "@/hooks/use-api";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Errors, Settings, SettingsPayload, defaultSettings, fromApi, timezones, toApi, validate } from "@/lib/parametres";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-ivory-300 bg-white px-3 text-base outline-none focus:border-gold-500";

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs text-ink-500">
      {label}
      {children}
      {error ? (
        <span className="mt-1 block text-status-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

export default function ParametresPage() {
  const { ep, can, reload: reloadSession } = useSession();
  const canWrite = can("parametres", "write");
  const q = useApi<SettingsPayload>(ep("/settings"));
  const [saved, setSaved] = useState<Settings>(defaultSettings);
  const [form, setForm] = useState<Settings>(defaultSettings);
  const [showErrors, setShowErrors] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Errors>({});

  useEffect(() => {
    if (q.data) {
      const s = fromApi(q.data);
      setSaved(s);
      setForm(s);
    }
  }, [q.data]);

  const errors: Errors = { ...(showErrors ? validate(form) : {}), ...serverFields };
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const set = (k: keyof Settings, v: string) => {
    setJustSaved(false);
    setServerFields((p) => ({ ...p, [k]: undefined }));
    setForm((p) => ({ ...p, [k]: v }));
  };

  const save = async () => {
    const path = ep("/settings");
    if (!path || !canWrite) return;
    if (Object.keys(validate(form)).length > 0) {
      setShowErrors(true);
      return;
    }
    setBusy(true);
    setServerError(null);
    setServerFields({});
    try {
      const res = await api<SettingsPayload>(path, { method: "PUT", body: toApi(form) });
      const s = fromApi(res);
      setSaved(s);
      setForm(s);
      setShowErrors(false);
      setJustSaved(true);
      reloadSession(); // met à jour le nom et le fuseau de l'établissement dans l'interface
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        // les clés de l'API sont de la forme "thresholds.polarWarn" ou "profile.siret"
        const mapped: Errors = {};
        Object.entries(err.fields).forEach(([k, v]) => {
          mapped[k.split(".").pop() as keyof Settings] = v;
        });
        setServerFields(mapped);
        setShowErrors(true);
      } else {
        setServerError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm(saved);
    setShowErrors(false);
    setJustSaved(false);
    setServerFields({});
    setServerError(null);
  };

  if (q.loading && !q.data) {
    return (
      <>
        <Topbar title="Paramètres" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (q.error || !q.data) {
    return (
      <>
        <Topbar title="Paramètres" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox message={q.error ?? "Paramètres indisponibles."} onRetry={q.reload} />
        </main>
      </>
    );
  }

  const text = (k: keyof Settings, placeholder = "", mode?: "decimal" | "numeric" | "tel") => (
    <input
      value={form[k]}
      onChange={(e) => set(k, e.target.value)}
      placeholder={placeholder}
      inputMode={mode}
      disabled={!canWrite}
      className={`${inputClass} disabled:bg-ivory-100 disabled:text-ink-500`}
    />
  );

  return (
    <>
      <Topbar title="Paramètres" subtitle={form.name || "Établissement"} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Configuration</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Paramètres</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        {/* Établissement */}
        <Card className="p-5 md:p-6">
          <h2 className="text-2xl font-semibold">Établissement</h2>
          <p className="mt-1 text-sm text-ink-500">Ces informations apparaissent sur les rapports imprimés.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Nom de l'établissement *" error={errors.name}>
              {text("name", "ex : Restaurant Signature")}
            </Field>
            <Field label="Responsable HACCP">{text("manager", "ex : Jules")}</Field>
            <Field label="Adresse">{text("address", "ex : 12 rue de la Paix")}</Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Code postal">{text("zip", "75002", "numeric")}</Field>
              <div className="col-span-2">
                <Field label="Ville">{text("city", "Paris")}</Field>
              </div>
            </div>
            <Field label="Téléphone">{text("phone", "ex : 01 23 45 67 89", "tel")}</Field>
            <Field label="E-mail" error={errors.email}>
              {text("email", "contact@restaurant.fr")}
            </Field>
            <Field label="SIRET" error={errors.siret} hint="14 chiffres, facultatif">
              {text("siret", "123 456 789 00012", "numeric")}
            </Field>
          </div>
        </Card>

        {/* Seuils */}
        <Card className="p-5 md:p-6">
          <h2 className="text-2xl font-semibold">Seuils par défaut</h2>
          <p className="mt-1 text-sm text-ink-500">
            Valeurs de référence courantes, à adapter à votre plan de maîtrise sanitaire.
          </p>

          <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-ink-400">Températures (°C)</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Chambre froide : maximum" error={errors.coldroomMax}>
              {text("coldroomMax", "3", "decimal")}
            </Field>
            <Field label="Réfrigérateur : maximum" error={errors.fridgeMax}>
              {text("fridgeMax", "4", "decimal")}
            </Field>
            <Field label="Congélateur : maximum" error={errors.freezerMax}>
              {text("freezerMax", "-18", "decimal")}
            </Field>
            <Field
              label="Marge « à surveiller »"
              error={errors.warnMargin}
              hint="Écart avant la limite"
            >
              {text("warnMargin", "0.5", "decimal")}
            </Field>
          </div>

          <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-ink-400">Huile de friture</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Polaires : seuil d'alerte (%)" error={errors.polarWarn}>
              {text("polarWarn", "22", "decimal")}
            </Field>
            <Field label="Polaires : huile à changer (%)" error={errors.polarLimit}>
              {text("polarLimit", "25", "decimal")}
            </Field>
            <Field label="Température maximale (°C)" error={errors.oilMaxTemp}>
              {text("oilMaxTemp", "180", "decimal")}
            </Field>
          </div>

          <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-ink-400">Traçabilité</p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="DLC « bientôt » (jours)" error={errors.dlcSoonDays} hint="Alerte avant péremption">
              {text("dlcSoonDays", "2", "numeric")}
            </Field>
          </div>
        </Card>

        {/* Régional */}
        <Card className="p-5 md:p-6">
          <h2 className="text-2xl font-semibold">Fuseau horaire</h2>
          <p className="mt-1 text-sm text-ink-500">Sert à horodater les relevés et à calculer les retards.</p>
          <div className="mt-4 max-w-sm">
            <Field label="Fuseau horaire">
              <select
                value={form.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                disabled={!canWrite}
                className={`${inputClass} disabled:bg-ivory-100 disabled:text-ink-500`}
              >
                {timezones.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        {/* Actions */}
        {!canWrite && (
          <p className="rounded-2xl border border-ivory-300 bg-white p-4 text-sm text-ink-500 shadow-card">
            Lecture seule : seuls les administrateurs peuvent modifier les paramètres.
          </p>
        )}
        <InlineError message={serverError} />
        {canWrite && (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Button onClick={save} disabled={!dirty || busy} className="w-full sm:w-auto">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer les paramètres
          </Button>
          <Button variant="secondary" onClick={reset} disabled={!dirty} className="w-full sm:w-auto">
            Annuler les modifications
          </Button>
          {justSaved && (
            <span className="flex items-center gap-1 text-sm font-medium text-status-ok">
              <Check size={16} strokeWidth={2} /> Paramètres enregistrés
            </span>
          )}
          {showErrors && Object.keys(errors).length > 0 && (
            <span className="text-sm font-medium text-status-critical">
              Corrigez les champs en rouge pour enregistrer.
            </span>
          )}
        </div>
        )}
      </main>
    </>
  );
}