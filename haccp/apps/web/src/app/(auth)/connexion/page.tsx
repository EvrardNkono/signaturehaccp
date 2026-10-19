"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2 } from "lucide-react";
import { AuthLayout, authInputClass } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isValidEmail } from "@/lib/inscription";

/** N'accepte qu'un chemin interne (évite les redirections ouvertes). */
function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

export default function ConnexionPage() {
  const router = useRouter();
  const { status, setSession } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace(safeNext());
  }, [status, router]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "1") {
      setNotice("Mot de passe enregistré. Vous pouvez vous connecter.");
    }
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError("Adresse e-mail invalide.");
    if (!password) return setError("Mot de passe obligatoire.");
    setBusy(true);
    setError(null);
    try {
      const session = await api<Parameters<typeof setSession>[0]>("/auth/login", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      setSession(session);
      router.replace(safeNext());
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Espace professionnel" title="Connexion">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
        {notice && (
          <p role="status" className="rounded-lg bg-status-ok/10 px-3 py-2 text-sm text-status-ok">
            {notice}
          </p>
        )}

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

        <label className="block">
          <span className="flex items-center justify-between text-sm font-medium">
            Mot de passe
            <Link href="/mot-de-passe-oublie" className="text-xs font-normal text-gold-600 hover:text-gold-500">
              Mot de passe oublié ?
            </Link>
          </span>
          <div className="relative mt-2">
            <Lock size={16} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${authInputClass} pl-11`}
            />
          </div>
        </label>

        <InlineError message={error} />

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} Se connecter
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500 sm:mt-8">
        Pas encore de compte ?{" "}
        <Link href="/inscription" className="text-gold-600 hover:text-gold-500">
          Essai gratuit 14 jours
        </Link>
      </p>
    </AuthLayout>
  );
}
