export type AlertSeverity = "critical" | "warn" | "info";
export type AlertKind = "temperature" | "sensor" | "oil" | "cleaning" | "dlc";
export type AlertState = "open" | "in_progress" | "resolved";
/** 0 = pas d'escalade ; 1 à 3 = niveaux d'escalade calculés par l'API. */
export type AlertEscalation = 0 | 1 | 2 | 3;

export type Alert = {
  id: string;
  severity: AlertSeverity;
  kind: AlertKind;
  state: AlertState;
  title: string;
  detail: string;
  equipment?: string;
  equipmentId?: string;
  zone?: string;
  value?: string;
  threshold?: string;
  correctiveAction?: string;
  createdAt: string; // ISO
  takenAt?: string;
  takenBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  escalation: AlertEscalation;
  escalationReason: string | null;
};

export type AlertsSummary = {
  open: number;
  critical: number;
  warn: number;
  info: number;
  escalated: number;
};

export const severityLabels: Record<AlertSeverity, string> = {
  critical: "Critique",
  warn: "Attention",
  info: "Info",
};

export const kindLabels: Record<AlertKind, string> = {
  temperature: "Température",
  sensor: "Capteur",
  oil: "Huile de friture",
  cleaning: "Nettoyage",
  dlc: "DLC",
};

export const stateLabels: Record<AlertState, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
};
