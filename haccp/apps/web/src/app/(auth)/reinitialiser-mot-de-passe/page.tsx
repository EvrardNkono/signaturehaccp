"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { api, errorMessage } from "@/lib/api";
import { PASSWORD_HINT, passwordProblem } from "@/lib/inscription";

// Page ciblée par les e-mails de réinitialisation et d'invitation : /reinitialiser-mot-de-passe?token=...
export default function ReinitialiserMotDePassePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setToken(q.get("token") ?? "");
    setInvitation(q.get("invitation") === "1");
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password) ?? (confirm !== password ? "Les mots de passe ne correspondent pas." : undefined);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      router.replace("/connexion?reset=1");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const title = invitation ? "Bienvenue" : "Nouveau mot de passe";

  return (
    <AuthLayout eyebrow={invitation ? "Activation du compte" : "Sécurité"} title={title}>
      {token === "" ? (
        <div className="mt-6 space-y-4 sm:mt-8">
          <InlineError message="Lien invalide : il manque le jeton de réinitialisation." />
          <Link href="/mot-de-passe-oublie" className="block text-center text-sm text-gold-600 hover:text-gold-500">
            Demander un nouveau lien
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
          <p className="text-sm text-ink-500">
            {invitation ? "Choisissez le mot de passe de votre compte." : "Choisissez un nouveau mot de passe."}
          </p>
          <label className="block">
            <span className="text-sm font-medium">Mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={`mt-2 ${authInputClass}`}
            />
            <span className="mt-1 block text-xs text-ink-400">{PASSWORD_HINT}</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Confirmer le mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className={`mt-2 ${authInputClass}`}
            />
          </label>
          <InlineError message={error} />
          <Button type="submit" disabled={busy || token === null} className="w-full">
            {busy ? <Loader2 size={16} className="animate-spin" /> : null} Enregistrer
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
