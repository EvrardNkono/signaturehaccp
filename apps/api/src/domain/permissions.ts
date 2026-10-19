// Droits par rôle — reprend src/lib/users.ts du front, étendu aux modules "documents" et "parametres".

export const USER_ROLES = ["super_admin", "admin", "manager", "operator", "auditor"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MODULES = [
  "dashboard",
  "equipements",
  "releves",
  "nettoyage",
  "huile",
  "tracabilite",
  "alertes",
  "rapports",
  "utilisateurs",
  "documents",
  "parametres",
] as const;
export type Module = (typeof MODULES)[number];

export type Access = "none" | "read" | "write";

export const permissions: Record<UserRole, Record<Module, Access>> = {
  super_admin: {
    dashboard: "write", equipements: "write", releves: "write", nettoyage: "write", huile: "write",
    tracabilite: "write", alertes: "write", rapports: "write", utilisateurs: "write", documents: "write", parametres: "write",
  },
  admin: {
    dashboard: "write", equipements: "write", releves: "write", nettoyage: "write", huile: "write",
    tracabilite: "write", alertes: "write", rapports: "write", utilisateurs: "write", documents: "write", parametres: "write",
  },
  manager: {
    dashboard: "write", equipements: "write", releves: "write", nettoyage: "write", huile: "write",
    tracabilite: "write", alertes: "write", rapports: "write", utilisateurs: "read", documents: "write", parametres: "read",
  },
  operator: {
    dashboard: "read", equipements: "read", releves: "write", nettoyage: "write", huile: "write",
    tracabilite: "write", alertes: "write", rapports: "none", utilisateurs: "none", documents: "read", parametres: "none",
  },
  auditor: {
    dashboard: "read", equipements: "read", releves: "read", nettoyage: "read", huile: "read",
    tracabilite: "read", alertes: "read", rapports: "read", utilisateurs: "none", documents: "read", parametres: "none",
  },
};

const rank: Record<Access, number> = { none: 0, read: 1, write: 2 };

export function hasAccess(role: UserRole, module: Module, min: Access = "read"): boolean {
  return rank[permissions[role][module]] >= rank[min];
}

/** Niveau hiérarchique : plus grand = plus de pouvoir. */
export const roleLevel: Record<UserRole, number> = {
  super_admin: 5,
  admin: 4,
  manager: 3,
  operator: 2,
  auditor: 1,
};

export const canAddEstablishment = (role: UserRole) => role === "super_admin" || role === "admin";
export const canSeeAllEstablishments = (role: UserRole) => role === "super_admin";

export type AccessUser = {
  role: UserRole;
  primaryEstablishmentId?: string | null;
  authorizedEstablishmentIds?: string[];
};

/** null = tous les établissements de l'entreprise ; sinon liste explicite. */
export function allowedEstablishmentIds(u: AccessUser): string[] | null {
  if (canSeeAllEstablishments(u.role)) return null;
  if (u.role === "operator" && u.primaryEstablishmentId) return [u.primaryEstablishmentId];
  return u.authorizedEstablishmentIds ?? [];
}

/** Un utilisateur ne peut attribuer qu'un rôle strictement inférieur au sien (le super_admin peut tout attribuer). */
export function canAssignRole(actor: UserRole, target: UserRole): boolean {
  if (actor === "super_admin") return true;
  return roleLevel[actor] > roleLevel[target];
}
