import {
  LayoutDashboard,
  Thermometer,
  ClipboardList,
  SprayCan,
  Droplet,
  Package,
  Bell,
  FileText,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

/** `module` = clé de la matrice de droits renvoyée par l'API (/auth/me → permissions). */
export type NavItem = { href: string; label: string; icon: LucideIcon; module: string };

export const nav: NavItem[] = [
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, module: "dashboard" },
  { href: "/equipements", label: "Équipements", icon: Thermometer, module: "equipements" },
  { href: "/releves", label: "Relevés", icon: ClipboardList, module: "releves" },
  { href: "/nettoyage", label: "Nettoyage", icon: SprayCan, module: "nettoyage" },
  { href: "/huile", label: "Huile de friture", icon: Droplet, module: "huile" },
  { href: "/tracabilite", label: "Traçabilité", icon: Package, module: "tracabilite" },
  { href: "/alertes", label: "Alertes", icon: Bell, module: "alertes" },
  { href: "/rapports", label: "Rapports", icon: FileText, module: "rapports" },
  { href: "/utilisateurs", label: "Utilisateurs", icon: Users, module: "utilisateurs" },
  { href: "/parametres", label: "Paramètres", icon: Settings, module: "parametres" },
];

export const mobileTabs = ["/dashboard", "/equipements", "/releves", "/alertes"];
