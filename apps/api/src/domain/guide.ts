// Guide d'utilisation (visite guidée) — identifiants des étapes et états possibles.
// Les identifiants des pages reprennent les clés de modules de la matrice de droits ; "welcome" est l'écran d'accueil.

export const GUIDE_STEPS = [
  "welcome",
  "dashboard",
  "equipements",
  "releves",
  "nettoyage",
  "huile",
  "tracabilite",
  "alertes",
  "rapports",
  "utilisateurs",
  "parametres",
] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

/**
 * - active    : le guide n'a pas été refusé ni terminé (il se lance seul à la première connexion)
 * - dismissed : l'utilisateur l'a fermé ou passé ; il ne se relance plus seul mais reste accessible
 * - completed : toutes les étapes visibles ont été vues
 */
export const GUIDE_STATUSES = ["active", "dismissed", "completed"] as const;
export type GuideStatus = (typeof GUIDE_STATUSES)[number];
