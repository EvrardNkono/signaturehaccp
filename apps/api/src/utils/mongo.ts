import mongoose from "mongoose";
import { notFound } from "./httpError";

export const isObjectId = (v: unknown): v is string => typeof v === "string" && mongoose.isValidObjectId(v);

/** Valide un identifiant de route : un id invalide est traité comme "introuvable" (pas d'erreur 500). */
export function oid(v: unknown, label = "Ressource"): string {
  if (!isObjectId(v)) throw notFound(`${label} introuvable.`);
  return v;
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
