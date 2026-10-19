import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { ALERT_KINDS, ALERT_SEVERITIES, ALERT_STATES, AlertKind, AlertSeverity, AlertState } from "../domain/alerts";

export interface IAlert {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  severity: AlertSeverity;
  kind: AlertKind;
  state: AlertState;
  title: string;
  detail: string;
  equipmentId?: Types.ObjectId | null;
  equipmentName?: string;
  zone?: string;
  value?: string;
  threshold?: string;
  correctiveAction?: string;
  dedupeKey?: string;
  source: "auto" | "manual";
  takenAt?: Date | null;
  takenBy?: string;
  takenByUserId?: Types.ObjectId | null;
  resolvedAt?: Date | null;
  resolvedBy?: string;
  resolvedByUserId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IAlert>(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true },
    kind: { type: String, enum: ALERT_KINDS, required: true },
    state: { type: String, enum: ALERT_STATES, default: "open" },
    title: { type: String, required: true, maxlength: 200 },
    detail: { type: String, required: true, maxlength: 600 },
    equipmentId: { type: Schema.Types.ObjectId, ref: "Equipment", default: null },
    equipmentName: String,
    zone: String,
    value: String,
    threshold: String,
    correctiveAction: { type: String, maxlength: 1000 },
    dedupeKey: String,
    source: { type: String, enum: ["auto", "manual"], default: "auto" },
    takenAt: { type: Date, default: null },
    takenBy: String,
    takenByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolvedBy: String,
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);
schema.index({ establishmentId: 1, state: 1, createdAt: -1 });
schema.index({ establishmentId: 1, dedupeKey: 1 });
schema.index({ equipmentId: 1 });
schema.plugin(jsonPlugin);

export const Alert = model<IAlert>("Alert", schema);
