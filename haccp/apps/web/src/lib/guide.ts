// Guide d'utilisation : contenu des étapes et types partagés (le serveur valide les mêmes identifiants).

import { BookOpen, Sparkles, type LucideIcon } from "lucide-react";
import { nav } from "@/components/layout/nav";

export const GUIDE_STEP_IDS = [
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
export type GuideStepId = (typeof GUIDE_STEP_IDS)[number];

export type GuideStatus = "active" | "dismissed" | "completed";

export type GuideState = {
  status: GuideStatus;
  seenSteps: string[];
  checklistHidden: boolean;
};

/** Réponse de GET/PUT /me/guide et POST /me/guide/reset. */
export type GuideApi = GuideState & { steps: string[]; lastStartedAt: string | null };

export type GuideStep = {
  id: GuideStepId;
  title: string;
  body: string;
  icon: LucideIcon;
  /** Module de la matrice de droits (= data-guide du lien dans le menu). Absent pour l'écran d'accueil. */
  module?: string;
  href?: string;
};

const content: Record<GuideStepId, { title: string; body: string }> = {
  welcome: {
    title: "Bienvenue sur Signature HACCP",
    body: "Prenez deux minutes pour découvrir les pages de l'application. Cette visite est facultative : passez d'une étape à l'autre, quittez-la quand vous voulez et relancez-la à tout moment avec le bouton « Guide » en haut de l'écran.",
  },
  dashboard: {
    title: "Tableau de bord",
    body: "Votre vue d'ensemble du jour : score de conformité, avancement des contrôles, état des équipements et alerte la plus urgente. C'est la première page à regarder en arrivant.",
  },
  equipements: {
    title: "Équipements",
    body: "Vos chambres froides, réfrigérateurs et congélateurs avec leur température actuelle et leur plage autorisée. Ouvrez un équipement pour voir sa courbe, ajoutez-en de nouveaux et réglez leurs seuils.",
  },
  releves: {
    title: "Relevés de température",
    body: "Saisissez un nouveau relevé pour chaque équipement et retrouvez l'historique du jour. Une valeur hors plage déclenche automatiquement une alerte.",
  },
  nettoyage: {
    title: "Nettoyage",
    body: "Les tâches de nettoyage du jour, regroupées par zone. Cochez-les au fil de la journée : le compteur en haut de la page indique combien sont déjà faites.",
  },
  huile: {
    title: "Huile de friture",
    body: "Enregistrez un nouveau contrôle de vos friteuses et consultez l'historique des contrôles pour savoir quand changer l'huile.",
  },
  tracabilite: {
    title: "Traçabilité et DLC",
    body: "Enregistrez la réception de vos lots et suivez leurs dates limites de consommation. En cas de rappel produit, vous retrouvez immédiatement les lots concernés.",
  },
  alertes: {
    title: "Alertes",
    body: "Toutes les alertes actives : température, DLC, nettoyage, capteurs. Prenez-en une en charge et notez l'action corrective : elle est conservée comme preuve en cas de contrôle.",
  },
  rapports: {
    title: "Rapports",
    body: "Le registre HACCP du jour, une synthèse de la période et des exports (CSV ou PDF) à présenter lors d'un contrôle sanitaire.",
  },
  utilisateurs: {
    title: "Utilisateurs",
    body: "Invitez votre équipe et attribuez un rôle à chacun. Le tableau « Droits par rôle » détaille ce que chaque rôle peut voir et modifier.",
  },
  parametres: {
    title: "Paramètres",
    body: "Les informations de votre établissement, les seuils de température par défaut et le fuseau horaire utilisé pour dater les relevés.",
  },
};

/** Étapes proposées à cet utilisateur : l'accueil, puis uniquement les pages auxquelles son rôle donne accès. */
export function buildSteps(can: (module: string) => boolean): GuideStep[] {
  const steps: GuideStep[] = [{ id: "welcome", ...content.welcome, icon: Sparkles }];
  for (const id of GUIDE_STEP_IDS) {
    if (id === "welcome") continue;
    const item = nav.find((n) => n.module === id);
    if (!item || !can(item.module)) continue;
    steps.push({ id, ...content[id], icon: item.icon ?? BookOpen, module: item.module, href: item.href });
  }
  return steps;
}
