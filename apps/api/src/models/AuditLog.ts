import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";

export interface IAuditLog {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  establishmentId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
  userName: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  at: Date;
}

const schema = new Schema<IAuditLog>({
  companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
  establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", default: null },
  userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  userName: { type: String, required: true },
  action: { type: String, required: true },
  entity: { type: String, required: true },
  entityId: String,
  meta: { type: Schema.Types.Mixed },
  ip: String,
  at: { type: Date, default: Date.now },
});
schema.index({ companyId: 1, at: -1 });
schema.index({ establishmentId: 1, at: -1 });
schema.plugin(jsonPlugin);

export const AuditLog = model<IAuditLog>("AuditLog", schema);
