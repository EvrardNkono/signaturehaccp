"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { PASSWORD_HINT, SignupErrors, SignupForm, emptySignup, validate } from "@/lib/inscription";

const inputClass = `mt-2 ${authInputClass}`;

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
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-status-critical">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

export default function InscriptionPage() {
  const router = useRouter();
  const { setSession } = useSession();
  const [form, setForm] = useState<SignupForm>(emptySignup);
  const [file, setFile] = useState<File | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const errors: SignupErrors = showErrors ? { ...validate(form, file), ...serverErrors } : serverErrors;

  const set = <K extends keyof SignupForm>(k: K, v: SignupForm[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
    setServerErrors((p) => ({ ...p, [k]: undefined }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form, file);
    if (Object.keys(found).length > 0) {
      setShowErrors(true);
      setFormError(`À corriger avant de continuer : ${Object.values(found).join(" · ")}`);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.set("company", form.company.trim());
      body.set("kbis", form.kbis.trim());
      body.set("manager", form.manager.trim());
      body.set("email", form.email.trim());
      body.set("password", form.password);
      body.set("confirm", form.confirm);
      body.set("accepted", String(form.accepted));
      if (file) body.set("kbisFile", file);

      const session = await api<Parameters<typeof setSession>[0]>("/auth/register", { method: "POST", body });
      setSession(session);
      router.replace("/dashboard");
    } catch (err) {
      console.error("Inscription refusée :", err);
      if (err instanceof ApiError) {
        if (err.code === "EMAIL_TAKEN") setServerErrors({ email: err.message });
        else if (err.code === "FILE_TYPE_INVALID" || err.code === "LIMIT_FILE_SIZE") setServerErrors({ kbisFile: err.message });
        else if (Object.keys(err.fields).length > 0) setServerErrors(err.fields as SignupErrors);
        const detail = Object.keys(err.fields).length > 0 ? Object.values(err.fields).join(" · ") : err.message;
        setFormError(`${detail} (code ${err.status})`);
      } else {
        setFormError(errorMessage(err));
      }
      setShowErrors(true);
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Essai gratuit 14 jours" title="Créer mon compte">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4 sm:mt-8">
        <Field label="Nom de l'établissement" error={errors.company}>
          <input
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="ex : Restaurant Signature"
            autoComplete="organization"
            className={inputClass}
          />
        </Field>

        <Field label="Numéro de Kbis ou SIRET" error={errors.kbis} hint="9 chiffres (Kbis/RCS) ou 14 chiffres (SIRET)">
          <input
            value={form.kbis}
            onChange={(e) => set("kbis", e.target.value)}
            placeholder="ex : 123 456 789"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>

        <Field
          label="Extrait Kbis (facultatif)"
          error={errors.kbisFile}
          hint={file ? undefined : "PDF, JPG ou PNG, 5 Mo maximum"}
        >
          <span className="mt-2 flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ivory-300 bg-white px-4 text-sm text-ink-500 transition hover:border-gold-400">
            <Upload size={16} strokeWidth={1.5} className="shrink-0 text-ink-400" />
            <span className="min-w-0 truncate">{file ? file.name : "Joindre le document"}</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </span>
        </Field>

        <Field label="Votre nom" error={errors.manager}>
          <input
            value={form.manager}
            onChange={(e) => set("manager", e.target.value)}
            placeholder="ex : Jules Martin"
            autoComplete="name"
            className={inputClass}
          />
        </Field>

        <Field label="Adresse e-mail" error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="vous@restaurant.fr"
            autoComplete="email"
            className={inputClass}
          />
        </Field>

        <Field label="Mot de passe" error={errors.password} hint={PASSWORD_HINT}>
          <input
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>

        <Field label="Confirmer le mot de passe" error={errors.confirm}>
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => set("confirm", e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-500">
            <input
              type="checkbox"
              checked={form.accepted}
              onChange={(e) => set("accepted", e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#B8923F]"
            />
            <span>J&apos;accepte les conditions générales d&apos;utilisation.</span>
          </label>
          {errors.accepted && <span className="mt-1 block text-xs text-status-critical">{errors.accepted}</span>}
        </div>

        <InlineError message={formError} />

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Créer mon compte
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 sm:mt-8">
        Déjà un compte ?{" "}
        <Link href="/connexion" className="text-gold-600 hover:text-gold-500">
          Se connecter
        </Link>
      </p>
    </AuthLayout>
  );
}
