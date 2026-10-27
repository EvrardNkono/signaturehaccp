"use client";

import { useState } from "react";
import { Mail, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBox, Loading } from "@/components/ui/state";
import { UserForm } from "@/components/utilisateurs/user-form";
import { useApi } from "@/hooks/use-api";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { lastSeen } from "@/lib/time";
import {
  AppUser,
  UserInput,
  accessLabels,
  allRoles,
  canManageUser,
  fullNameOf,
  initials,
  moduleLabels,
  modules,
  permissions,
  roleChip,
  roleLabels,
} from "@/lib/utilisateurs";

const accessTone = {
  none: "text-ink-400",
  read: "text-status-warn",
  write: "text-status-ok",
} as const;

export default function UtilisateursPage() {
  const { user: me, est, establishments, can } = useSession();
  const { data, error, loading, reload } = useApi<{ data: AppUser[] }>("/users");
  const users = data?.data ?? [];
  const canWrite = can("utilisateurs", "write");
  // null : formulaire fermé, "new" : création, sinon l'id de l'utilisateur modifié
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const adminCount = users.filter((u) => u.active && (u.role === "admin" || u.role === "super_admin")).length;
  const editedUser = editing && editing !== "new" ? users.find((u) => u.id === editing) : undefined;

  const save = async (input: UserInput): Promise<string | null> => {
    try {
      if (editing === "new") {
        await api("/users", { method: "POST", body: input });
        setMessage({ kind: "ok", text: `Invitation envoyée à ${input.email}.` });
      } else if (editedUser) {
        await api(`/users/${editedUser.id}`, { method: "PATCH", body: input });
        setMessage({ kind: "ok", text: "Utilisateur mis à jour." });
      }
      setEditing(null);
      reload();
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  };

  const toggleActive = async (u: AppUser) => {
    setMessage(null);
    setPendingId(u.id);
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
      reload();
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setPendingId(null);
    }
  };

  const resendInvite = async (u: AppUser) => {
    setMessage(null);
    setPendingId(u.id);
    try {
      await api(`/users/${u.id}/resend-invite`, { method: "POST" });
      setMessage({ kind: "ok", text: `Invitation renvoyée à ${u.email}.` });
    } catch (err) {
      setMessage({ kind: "error", text: errorMessage(err) });
    } finally {
      setPendingId(null);
    }
  };

  const activeCount = users.filter((u) => u.active).length;
  const tz = est?.timezone;

  if (loading && !data) {
    return (
      <>
        <Topbar title="Utilisateurs" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <Loading />
        </main>
      </>
    );
  }
  if (error || !data) {
    return (
      <>
        <Topbar title="Utilisateurs" />
        <main className="mx-auto w-full max-w-[1400px] p-4 md:p-8 xl:p-10">
          <ErrorBox message={error ?? "Données indisponibles."} onRetry={reload} />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Utilisateurs" subtitle={`${activeCount} utilisateur(s) actif(s)`} />
      <main className="mx-auto w-full max-w-[1400px] space-y-6 p-4 md:space-y-8 md:p-8 xl:p-10">
        <div className="animate-fade-up">
          <p className="eyebrow">Équipe</p>
          <h1 className="mt-1 font-display text-4xl font-semibold md:text-5xl">Utilisateurs</h1>
          <div className="ornament mt-4 max-w-xs" />
        </div>

        <section className="grid grid-cols-3 gap-3 md:gap-6">
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">Utilisateurs</p>
            <p className="mt-1 font-display text-3xl font-semibold md:text-4xl">{users.length}</p>
          </Card>
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">Actifs</p>
            <p className="mt-1 font-display text-3xl font-semibold text-status-ok md:text-4xl">{activeCount}</p>
          </Card>
          <Card className="p-4 md:p-5">
            <p className="text-xs text-ink-500">Administrateurs</p>
            <p className="mt-1 font-display text-3xl font-semibold md:text-4xl">{adminCount}</p>
          </Card>
        </section>

        {message && (
          <p
            role={message.kind === "error" ? "alert" : "status"}
            className={`rounded-2xl border bg-white p-4 text-sm font-medium shadow-card ${
              message.kind === "error" ? "border-status-critical/25 text-status-critical" : "border-status-ok/25 text-status-ok"
            }`}
          >
            {message.text}
          </p>
        )}

        {editing && me ? (
          <UserForm
            key={editing}
            initial={editedUser}
            actorRole={me.role}
            isSelf={editedUser?.id === me.id}
            establishments={establishments}
            takenEmails={users.filter((u) => u.id !== editing).map((u) => u.email.toLowerCase())}
            onSubmit={save}
            onCancel={() => setEditing(null)}
          />
        ) : (
          canWrite && (
            <Button data-tour="usr-add" onClick={() => { setMessage(null); setEditing("new"); }}>
              <Plus size={16} strokeWidth={1.75} /> Ajouter un utilisateur
            </Button>
          )
        )}

        <section data-tour="usr-list" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {users.map((u) => (
            <Card key={u.id} className={`p-5 ${u.active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-gradient font-display text-lg font-semibold text-ink-950">
                  {initials(fullNameOf(u))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{fullNameOf(u)}</p>
                    {!u.active && (
                      <span className="rounded-full bg-ivory-200 px-2.5 py-0.5 text-[11px] font-medium text-ink-500">
                        Désactivé
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-500">{u.email}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${roleChip[u.role]}`}>
                      {roleLabels[u.role]}
                    </span>
                    {u.mustChangePassword && (
                      <span className="rounded-full bg-status-warn/10 px-2.5 py-0.5 text-[11px] font-medium text-status-warn">
                        Invitation en attente
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-ink-400">Dernière connexion : {lastSeen(u.lastSeen, tz)}</p>
                  {canWrite && me && canManageUser(me.role, me.id, u) && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-ivory-200 pt-3">
                      <Button
                        variant="secondary"
                        onClick={() => { setMessage(null); setEditing(u.id); }}
                        className="!min-h-9 !px-3 !text-xs"
                      >
                        <Pencil size={12} strokeWidth={1.75} /> Modifier
                      </Button>
                      {u.id !== me.id && (
                        <Button
                          variant="secondary"
                          disabled={pendingId === u.id}
                          onClick={() => toggleActive(u)}
                          className="!min-h-9 !px-3 !text-xs"
                        >
                          {u.active ? (
                            <>
                              <UserX size={12} strokeWidth={1.75} /> Désactiver
                            </>
                          ) : (
                            <>
                              <UserCheck size={12} strokeWidth={1.75} /> Réactiver
                            </>
                          )}
                        </Button>
                      )}
                      {u.mustChangePassword && u.active && (
                        <Button
                          variant="secondary"
                          disabled={pendingId === u.id}
                          onClick={() => resendInvite(u)}
                          className="!min-h-9 !px-3 !text-xs"
                        >
                          <Mail size={12} strokeWidth={1.75} /> Renvoyer l&apos;invitation
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </section>

        <section data-tour="usr-roles">
          <h2 className="mb-3 text-2xl font-semibold">Droits par rôle</h2>
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ivory-200 text-xs text-ink-500">
                  <th className="px-4 py-3 font-medium">Page</th>
                  {allRoles.map((r) => (
                    <th key={r} className="px-4 py-3 font-medium">
                      {roleLabels[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-200">
                {modules.map((m) => (
                  <tr key={m}>
                    <td className="px-4 py-3 font-medium">{moduleLabels[m]}</td>
                    {allRoles.map((r) => {
                      const a = permissions[r][m];
                      return (
                        <td key={r} className={`px-4 py-3 text-xs ${accessTone[a]}`}>
                          {accessLabels[a]}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-ink-400">
            Chaque utilisateur a un seul rôle. Les droits sont vérifiés côté serveur à chaque requête.
          </p>
        </section>
      </main>
    </>
  );
}