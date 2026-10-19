"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { api, errorMessage } from "@/lib/api";
import { isValidEmail } from "@/lib/inscription";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError("Adresse e-mail invalide.");
    setBusy(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Assistance" title="Mot de passe oublié">
      {sent ? (
        <div className="mt-6 space-y-4 sm:mt-8" role="status">
          <p className="rounded-lg bg-status-ok/10 px-3 py-3 text-sm text-status-ok">
            Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d&apos;être envoyé. Le lien est
            valable 1 heure.
          </p>
          <Link href="/connexion" className="block text-center text-sm text-gold-600 hover:text-gold-500">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
          <p className="text-sm text-ink-500">
            Saisissez l&apos;adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de
            passe.
          </p>
          <label className="block">
            <span className="text-sm font-medium">Adresse e-mail</span>
            <div className="relative mt-2">
              <Mail size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="email"
                autoComplete="email"
                placeholder="vous@restaurant.fr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${authInputClass} pl-11`}
              />
            </div>
          </label>
          <InlineError message={error} />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Envoyer le lien
          </Button>
          <Link href="/connexion" className="block text-center text-sm text-gold-600 hover:text-gold-500">
            Retour à la connexion
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
