import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getAuth } from "../middleware/auth";
import { UserRole, roleLevel } from "../domain/permissions";
import { forbidden } from "../utils/httpError";
import { isIsoDay } from "../domain/traceability";

/** Réserve une route aux rôles d'un niveau minimum (ex. création de modèles de tâches : responsable et au-dessus). */
export const requireRoleAtLeast =
  (min: UserRole) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const { user } = getAuth(req);
    if (roleLevel[user.role] < roleLevel[min]) throw forbidden("Action réservée aux responsables.", "INSUFFICIENT_ROLE");
    next();
  };

export const isoDay = z.string().refine(isIsoDay, "Date attendue au format AAAA-MM-JJ.");

/** Nombre décimal reçu en nombre ou en texte ("2,8" accepté). */
export const decimal = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    return t === "" ? undefined : Number(t);
  }
  return v;
}, z.number({ invalid_type_error: "Nombre attendu.", required_error: "Valeur obligatoire." }).finite("Nombre attendu."));

export const text = (max: number, label = "Texte") => z.string().trim().min(1, `${label} obligatoire.`).max(max, `${max} caractères maximum.`);
export const optText = (max: number) => z.string().trim().max(max, `${max} caractères maximum.`).optional();

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Identifiant invalide.");
