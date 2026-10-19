import type { Role } from "@/lib/session";

export type { Role };

export type Module =
  | "dashboard"
  | "equipements"
  | "releves"
  | "nettoyage"
  | "huile"
  | "tracabilite"
  | "alertes"
  | "rapports"
  | "utilisateurs"
  | "parametres";
export type Access = "none" | "read" | "write";

/** Utilisateur tel que renvoyé par l'API (GET /users). */
export type AppUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  primaryEstablishmentId?: string;
  authorizedEstablishmentIds: string[];
  active: boolean;
  lastSeen?: string; // ISO
  mustChangePassword: boolean;
};

export type UserInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  primaryEstablishmentId: string | null;
  authorizedEstablishmentIds: string[];
};

// Du plus puissant au moins puissant.
export const allRoles: Role[] = ["super_admin", "admin", "manager", "operator", "auditor"];

export const roleLabels: Record<Role, string> = {
  super_admin: "Super administrateur",
  admin: "Administrateur",
  manager: "Responsable HACCP",
  operator: "Opérateur",
  auditor: "Contrôleur",
};

export const roleDescriptions: Record<Role, string> = {
  super_admin: "Tous les établissements, tous les droits",
  admin: "Accès complet, gère les utilisateurs",
  manager: "Gère le plan HACCP et valide les actions",
  operator: "Saisit les relevés et les contrôles du quotidien",
  auditor: "Consulte les registres, sans modification",
};

export const roleChip: Record<Role, string> = {
  super_admin: "bg-ink-900 text-gold-300",
  admin: "bg-ink-900 text-gold-300",
  manager: "bg-gold-400/15 text-gold-600",
  operator: "bg-ivory-200 text-ink-500",
  auditor: "bg-ink-400/10 text-ink-500",
};

export const moduleLabels: Record<Module, string> = {
  dashboard: "Tableau de bord",
  equipements: "Équipements",
  releves: "Relevés",
  nettoyage: "Nettoyage",
  huile: "Huile de friture",
  tracabilite: "Traçabilité",
  alertes: "Alertes",
  rapports: "Rapports",
  utilisateurs: "Utilisateurs",
  parametres: "Paramètres",
};

export const modules = Object.keys(moduleLabels) as Module[];

export const accessLabels: Record<Access, string> = {
  none: "—",
  read: "Lecture",
  write: "Écriture",
};

// Reflet de la matrice appliquée par l'API (src/domain/permissions.ts). Affichage uniquement :
// les droits réels sont toujours vérifiés côté serveur.
const full: Record<Module, Access> = {
  dashboard: "write", equipements: "write", releves: "write", nettoyage: "write", huile: "write",
  tracabilite: "write", alertes: "write", rapports: "write", utilisateurs: "write", parametres: "write",
};

export const permissions: Record<Role, Record<Module, Access>> = {
  super_admin: full,
  admin: full,
  manager: { ...full, utilisateurs: "read", parametres: "read" },
  operator: {
    dashboard: "read", equipements: "read", releves: "write", nettoyage: "write", huile: "write",
    tracabilite: "write", alertes: "write", rapports: "none", utilisateurs: "none", parametres: "none",
  },
  auditor: {
    dashboard: "read", equipements: "read", releves: "read", nettoyage: "read", huile: "read",
    tracabilite: "read", alertes: "read", rapports: "read", utilisateurs: "none", parametres: "none",
  },
};

const level: Record<Role, number> = { super_admin: 5, admin: 4, manager: 3, operator: 2, auditor: 1 };

/** Un utilisateur ne peut attribuer qu'un rôle strictement inférieur au sien (le super admin peut tout attribuer). */
export function canAssignRole(actor: Role, target: Role): boolean {
  return actor === "super_admin" || level[actor] > level[target];
}

/** Peut-on modifier ce compte ? (soi-même : oui, hors rôle ; sinon rôle strictement inférieur) */
export function canManageUser(actor: Role, actorId: string, target: { id: string; role: Role }): boolean {
  return actor === "super_admin" || target.id === actorId || level[target.role] < level[actor];
}

export function fullNameOf(u: { firstName: string; lastName?: string }): string {
  return `${u.firstName} ${u.lastName ?? ""}`.trim();
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
