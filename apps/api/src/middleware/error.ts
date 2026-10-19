import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import multer from "multer";
import mongoose from "mongoose";
import { HttpError } from "../utils/httpError";
import { logger } from "../config/logger";
import { isProd } from "../config/env";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: `Route inconnue : ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) {
      const key = i.path.join(".") || "_";
      if (!fields[key]) fields[key] = i.message;
    }
    return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Données invalides.", fields } });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "Fichier trop volumineux." : "Envoi de fichier invalide.";
    return res.status(413).json({ error: { code: err.code, message } });
  }

  if (err instanceof mongoose.Error.CastError) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ressource introuvable." } });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(err.errors)) fields[k] = v.message;
    return res.status(422).json({ error: { code: "VALIDATION_ERROR", message: "Données invalides.", fields } });
  }
  if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
    return res.status(409).json({ error: { code: "DUPLICATE", message: "Cet élément existe déjà." } });
  }

  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "INVALID_JSON", message: "Corps de requête JSON invalide." } });
  }
  if (e?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Requête trop volumineuse." } });
  }

  logger.error({ err, path: req.path, method: req.method }, "Erreur non gérée");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: isProd ? "Erreur interne du serveur." : (e?.message ?? "Erreur interne du serveur.") },
  });
}
