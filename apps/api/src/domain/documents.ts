export const DOCUMENT_CATEGORIES = ["haccp", "formation", "contrat", "facture", "attestation", "tracabilite", "autre"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const categoriesWithExpiry: DocumentCategory[] = ["formation", "contrat", "attestation"];

export const EXPIRY_SOON_DAYS = 30;

export const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

export function daysUntilExpiry(expiresAt?: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  return Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
}

export function expiryStatus(expiresAt?: Date | null, now: Date = new Date()): ExpiryStatus {
  const d = daysUntilExpiry(expiresAt, now);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= EXPIRY_SOON_DAYS) return "soon";
  return "ok";
}
