import { Request } from "express";
import { Types } from "mongoose";
import { AuditLog } from "../models";
import { logger } from "../config/logger";

type AuditInput = {
  action: string;
  entity: string;
  entityId?: string;
  establishmentId?: unknown;
  meta?: Record<string, unknown>;
};

/** Journal des actions sensibles (valeur de preuve). Ne bloque jamais la requête en cas d'erreur d'écriture. */
export async function audit(req: Request, input: AuditInput): Promise<void> {
  const auth = req.auth;
  if (!auth) return;
  try {
    await AuditLog.create({
      companyId: new Types.ObjectId(auth.companyId),
      establishmentId: input.establishmentId ? new Types.ObjectId(String(input.establishmentId)) : (req.est?._id ?? null),
      userId: new Types.ObjectId(auth.userId),
      userName: auth.name,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      meta: input.meta,
      ip: req.ip,
    });
  } catch (err) {
    logger.error({ err }, "Échec d'écriture du journal d'audit");
  }
}
