"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/state";
import type { Establishment } from "@/lib/session";
import {
  AppUser,
  Role,
  UserInput,
  allRoles,
  canAssignRole,
  isValidEmail,
  roleChip,
  roleDescriptions,
  roleLabels,
} from "@/lib/utilisateurs";

const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-ivory-300 bg-white px-3 text-base outline-none focus:border-gold-500";

export function UserForm({
  initial,
  actorRole,
  isSelf,
  establishments,
  takenEmails,
  onSubmit,
  onCancel,
}: {
  initial?: AppUser;
  actorRole: Role;
  /** Modification de son propre compte : le rôle ne peut pas être changé. */
  isSelf: boolean;
  establishments: Establishment[];
  takenEmails: string[];
  /** Retourne un message d'erreur, ou null si l'enregistrement a réussi. */
  onSubmit: (input: UserInput) => Promise<string | null>;
  onCancel: () => void;
}) {
  const assignable = allRoles.filter((r) => canAssignRole(actorRole, r) || r === initial?.role);
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role | null>(initial?.role ?? null);
  const [primary, setPrimary] = useState<string>(initial?.primaryEstablishmentId ?? establishments[0]?.id ?? "");
  const [authorized, setAuthorized] = useState<string[]>(
    initial?.authorizedEstablishmentIds ?? (establishments.length === 1 ? [establishments[0].id] : [])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrim = email.trim().toLowerCase();
  const emailBad = emailTrim !== "" && !isValidEmail(emailTrim);
  const emailTaken = takenEmails.includes(emailTrim);
  const needsPrimary = role === "operator";
  const needsList = role !== null && role !== "operator" && role !== "super_admin";
  const scopeMissing = (needsPrimary && !primary) || (needsList && authorized.length === 0);
  const blocked = !firstName.trim() || !isValidEmail(emailTrim) || emailTaken || role === null || scopeMissing;

  const toggleEst = (id: string) =>
    setAuthorized((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (blocked || role === null || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: emailTrim,
      role,
      primaryEstablishmentId: needsPrimary ? primary : null,
      authorizedEstablishmentIds: needsList ? authorized : [],
    });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Card className="p-5 md:p-6">
      <h2 className="text-2xl font-semibold">{initial ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block text-xs text-ink-500">
          Prénom *
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="ex : Camille" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500">
          Nom
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="ex : Roux" className={inputClass} />
        </label>
        <label className="block text-xs text-ink-500 md:col-span-2">
          Adresse e-mail *
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex : camille@restaurant.fr"
            className={inputClass}
          />
        </label>
      </div>
      {emailBad && <p className="mt-2 text-xs text-status-critical">Adresse e-mail invalide.</p>}
      {emailTaken && <p className="mt-2 text-xs text-status-critical">Cette adresse est déjà utilisée.</p>}
      {!initial && (
        <p className="mt-2 text-xs text-ink-400">
          Un e-mail d&apos;invitation est envoyé : la personne choisit elle-même son mot de passe.
        </p>
      )}

      <p className="mt-5 text-xs text-ink-500">Rôle *</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {assignable.map((r) => {
          const on = role === r;
          const locked = isSelf && r !== initial?.role;
          return (
            <button
              key={r}
              type="button"
              disabled={locked}
              onClick={() => setRole(r)}
              aria-pressed={on}
              className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                on ? "border-gold-500 bg-gold-400/10" : "border-ivory-300 bg-white hover:border-gold-400"
              }`}
            >
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${roleChip[r]}`}>
                {roleLabels[r]}
              </span>
              <span className="mt-1 block text-xs text-ink-500">{roleDescriptions[r]}</span>
            </button>
          );
        })}
      </div>
      {role === null && <p className="mt-2 text-xs text-ink-400">Choisissez un rôle.</p>}
      {isSelf && <p className="mt-2 text-xs text-ink-400">Vous ne pouvez pas modifier votre propre rôle.</p>}

      {needsPrimary && (
        <label className="mt-5 block text-xs text-ink-500">
          Établissement *
          <select value={primary} onChange={(e) => setPrimary(e.target.value)} className={inputClass}>
            {establishments.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsList && (
        <fieldset className="mt-5">
          <legend className="text-xs text-ink-500">Établissements accessibles * (au moins un)</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {establishments.map((e) => (
              <label key={e.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-ivory-300 bg-white px-3 text-sm">
                <input
                  type="checkbox"
                  checked={authorized.includes(e.id)}
                  onChange={() => toggleEst(e.id)}
                  className="h-5 w-5 accent-[#B8923F]"
                />
                {e.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4">
        <InlineError message={error} />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <Button onClick={submit} disabled={blocked || busy} className="w-full sm:w-auto">
          {busy ? <Loader2 size={16} className="animate-spin" /> : null} {initial ? "Enregistrer" : "Créer l'utilisateur"}
        </Button>
        <Button variant="secondary" onClick={onCancel} className="w-full sm:w-auto">
          Annuler
        </Button>
      </div>
    </Card>
  );
}
