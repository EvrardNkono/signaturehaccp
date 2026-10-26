import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { ReadingStatus } from "../domain/equipment";
import { env } from "../config/env";

export interface IReading {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  equipmentId: Types.ObjectId;
  equipmentName: string;
  value: number;
  status: ReadingStatus;
  source: "manual" | "iot";
  by: string;
  byUserId?: Types.ObjectId | null;
  action?: string;
  at: Date;
}

const schema = new Schema<IReading>({
  establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
  equipmentId: { type: Schema.Types.ObjectId, ref: "Equipment", required: true },
  equipmentName: { type: String, required: true },
  value: { type: Number, required: true },
  status: { type: String, enum: ["ok", "warn", "critical"], required: true },
  source: { type: String, enum: ["manual", "iot"], default: "manual" },
  by: { type: String, required: true },
  byUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  action: { type: String, maxlength: 500 },
  at: { type: Date, default: Date.now },
});
schema.index({ equipmentId: 1, at: -1 });
schema.index({ establishmentId: 1, at: -1 });
// Purge automatique par MongoDB (index TTL), uniquement si READING_RETENTION_DAYS > 0 (jamais en dessous d'un an).
// Attention : modifier cette valeur sur une base existante impose de supprimer l'ancien index "at_1" (voir README).
if (env.READING_RETENTION_DAYS > 0) {
  schema.index({ at: 1 }, { expireAfterSeconds: env.READING_RETENTION_DAYS * 86_400 });
}
schema.plugin(jsonPlugin);

export const Reading = model<IReading>("Reading", schema);
