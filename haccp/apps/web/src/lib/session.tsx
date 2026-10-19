"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";

export type Role = "super_admin" | "admin" | "manager" | "operator" | "auditor";
export type Access = "none" | "read" | "write";

export type Establishment = {
  id: string;
  name: string;
  city?: string;
  address?: string;
  zip?: string;
  phone?: string;
  email?: string;
  siret?: string;
  manager?: string;
  timezone: string;
  active: boolean;
};

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  primaryEstablishmentId?: string;
  authorizedEstablishmentIds: string[];
  active: boolean;
  mustChangePassword: boolean;
};

type SessionPayload = {
  user: SessionUser;
  company: { id: string; name: string } | null;
  permissions: Record<string, Access>;
  establishments: Establishment[];
};

type AlertsSummary = { open: number; critical: number; warn: number; info: number };

type SessionContextValue = {
  status: "loading" | "authenticated" | "anonymous";
  user: SessionUser | null;
  company: { id: string; name: string } | null;
  permissions: Record<string, Access>;
  establishments: Establishment[];
  /** Établissement actif (celui dont on affiche les données). */
  est: Establishment | null;
  setEstablishmentId: (id: string) => void;
  /** Chemin d'API rattaché à l'établissement actif ; null tant qu'il n'est pas connu. */
  ep: (path: string) => string | null;
  can: (module: string, min?: Access) => boolean;
  displayName: string;
  alerts: AlertsSummary;
  refreshAlerts: () => void;
  /** Recharge la session (après connexion, inscription, modification d'établissement...). */
  reload: () => Promise<void>;
  /** Utilise directement la réponse de /auth/login ou /auth/register. */
  setSession: (payload: SessionPayload) => void;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);
const EST_KEY = "haccp.establishment";
const rank: Record<Access, number> = { none: 0, read: 1, write: 2 };
const noAlerts: AlertsSummary = { open: 0, critical: 0, warn: 0, info: 0 };

function readStoredEstablishment(): string | null {
  try {
    return window.localStorage.getItem(EST_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionContextValue["status"]>("loading");
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [estId, setEstId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<AlertsSummary>(noAlerts);

  const apply = useCallback((p: SessionPayload) => {
    setPayload(p);
    setStatus("authenticated");
    setEstId((current) => {
      const stored = current ?? readStoredEstablishment();
      if (stored && p.establishments.some((e) => e.id === stored)) return stored;
      return p.establishments[0]?.id ?? null;
    });
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await api<SessionPayload>("/auth/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPayload(null);
        setStatus("anonymous");
      } else {
        // serveur injoignable : on reste sur l'écran de chargement d'erreur côté pages
        setPayload(null);
        setStatus("anonymous");
      }
    }
  }, [apply]);

  useEffect(() => {
    reload();
  }, [reload]);

  const est = useMemo(
    () => payload?.establishments.find((e) => e.id === estId) ?? null,
    [payload, estId]
  );

  const setEstablishmentId = useCallback((id: string) => {
    setEstId(id);
    try {
      window.localStorage.setItem(EST_KEY, id);
    } catch {
      /* stockage indisponible : sans importance */
    }
  }, []);

  const ep = useCallback((path: string) => (est ? `/establishments/${est.id}${path}` : null), [est]);

  const can = useCallback(
    (module: string, min: Access = "read") => rank[payload?.permissions[module] ?? "none"] >= rank[min],
    [payload]
  );

  const refreshAlerts = useCallback(() => {
    if (!est || !payload || rank[payload.permissions.alertes ?? "none"] < 1) {
      setAlerts(noAlerts);
      return;
    }
    api<{ summary: AlertsSummary }>(`/establishments/${est.id}/alerts`, { query: { limit: 1 } })
      .then((r) => setAlerts(r.summary))
      .catch(() => undefined);
  }, [est, payload]);

  useEffect(() => {
    if (status !== "authenticated") return;
    refreshAlerts();
    const t = setInterval(refreshAlerts, 60_000);
    return () => clearInterval(t);
  }, [status, refreshAlerts]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* on déconnecte l'interface quoi qu'il arrive */
    }
    setPayload(null);
    setAlerts(noAlerts);
    setStatus("anonymous");
  }, []);

  const value: SessionContextValue = {
    status,
    user: payload?.user ?? null,
    company: payload?.company ?? null,
    permissions: payload?.permissions ?? {},
    establishments: payload?.establishments ?? [],
    est,
    setEstablishmentId,
    ep,
    can,
    displayName: payload ? payload.user.firstName : "",
    alerts,
    refreshAlerts,
    reload,
    setSession: apply,
    logout,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession doit être utilisé dans <SessionProvider>.");
  return ctx;
}

export const roleLabelsFr: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Responsable HACCP",
  operator: "Opérateur",
  auditor: "Contrôleur",
};

export function fullName(u: { firstName: string; lastName?: string }): string {
  return `${u.firstName} ${u.lastName ?? ""}`.trim();
}
