import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { OIL_ASPECTS, OIL_SLOTS, OilAspect, OilSlot, OilStatus } from "../domain/oil";

export interface IOilControl {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  fryerId: Types.ObjectId;
  fryerName: string;
  slot: OilSlot;
  /** "YYYY-MM-DD" dans le fuseau de l'établissement */
  dayKey: string;
  temp: number;
  polar: number;
  aspect: OilAspect;
  status: OilStatus;
  by: string;
  byUserId?: Types.ObjectId | null;
  action?: string;
  at: Date;
}

const controlSchema = new Schema<IOilControl>({
  establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
  fryerId: { type: Schema.Types.ObjectId, ref: "Equipment", required: true },
  fryerName: { type: String, required: true },
  slot: { type: String, enum: OIL_SLOTS, required: true },
  dayKey: { type: String, required: true },
  temp: { type: Number, required: true },
  polar: { type: Number, required: true, min: 0, max: 100 },
  aspect: { type: String, enum: OIL_ASPECTS, required: true },
  status: { type: String, enum: ["ok", "warn", "change"], required: true },
  by: { type: String, required: true },
  byUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  action: { type: String, maxlength: 500 },
  at: { type: Date, default: Date.now },
});
controlSchema.index({ establishmentId: 1, dayKey: -1 });
controlSchema.index({ fryerId: 1, at: -1 });
controlSchema.plugin(jsonPlugin);
export const OilControl = model<IOilControl>("OilControl", controlSchema);

export interface IOilChange {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  fryerId: Types.ObjectId;
  fryerName: string;
  by: string;
  byUserId?: Types.ObjectId | null;
  note?: string;
  at: Date;
}

const changeSchema = new Schema<IOilChange>({
  establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
  fryerId: { type: Schema.Types.ObjectId, ref: "Equipment", required: true },
  fryerName: { type: String, required: true },
  by: { type: String, required: true },
  byUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  note: { type: String, maxlength: 400 },
  at: { type: Date, default: Date.now },
});
changeSchema.index({ fryerId: 1, at: -1 });
changeSchema.plugin(jsonPlugin);
export const OilChange = model<IOilChange>("OilChange", changeSchema);
