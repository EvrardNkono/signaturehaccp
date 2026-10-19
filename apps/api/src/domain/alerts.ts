export const ALERT_SEVERITIES = ["critical", "warn", "info"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_KINDS = ["temperature", "sensor", "oil", "cleaning", "dlc"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_STATES = ["open", "in_progress", "resolved"] as const;
export type AlertState = (typeof ALERT_STATES)[number];

export type AlertEscalation = 0 | 1 | 2 | 3;

/**
 * Règles d'escalade (minutes) — identiques au front :
 *  - critical : N1 15 min, N2 60 min, N3 240 min
 *  - warn     : N1 60 min, N2 240 min, N3 1440 min
 *  - info     : jamais
 * Une alerte résolue est toujours N0.
 */
const THRESHOLDS: Record<"critical" | "warn", [number, number, number]> = {
  critical: [15, 60, 240],
  warn: [60, 240, 1440],
};

export function computeEscalation(
  a: { severity: AlertSeverity; state: AlertState; createdAt: Date | string },
  now: Date = new Date()
): AlertEscalation {
  if (a.state === "resolved" || a.severity === "info") return 0;
  const elapsedMin = (now.getTime() - new Date(a.createdAt).getTime()) / 60_000;
  const [t1, t2, t3] = THRESHOLDS[a.severity];
  if (elapsedMin >= t3) return 3;
  if (elapsedMin >= t2) return 2;
  if (elapsedMin >= t1) return 1;
  return 0;
}

export function escalationReason(
  a: { state: AlertState; createdAt: Date | string },
  escalation: AlertEscalation,
  now: Date = new Date()
): string | null {
  if (escalation === 0) return null;
  const elapsedMin = Math.floor((now.getTime() - new Date(a.createdAt).getTime()) / 60_000);
  const context = a.state === "in_progress" ? "en cours depuis" : "non prise en charge depuis";
  if (elapsedMin < 60) return `${context} ${elapsedMin} min`;
  const h = Math.floor(elapsedMin / 60);
  if (h < 24) return `${context} ${h} h`;
  return `${context} ${Math.floor(h / 24)} j`;
}

/** Une action corrective est exigée pour clore une alerte critique ou d'attention. */
export const requiresCorrectiveAction = (s: AlertSeverity) => s !== "info";
export const MIN_ACTION_LENGTH = 3;
