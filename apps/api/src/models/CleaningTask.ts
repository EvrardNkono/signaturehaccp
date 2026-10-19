import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";

export const CLEANING_FREQUENCIES = ["daily", "after_service", "weekly"] as const;
export type CleaningFrequency = (typeof CLEANING_FREQUENCIES)[number];

export interface ICleaningTask {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  title: string;
  zone: string;
  frequency: CleaningFrequency;
  method: string;
  dueTime: string;
  active: boolean;
}

const taskSchema = new Schema<ICleaningTask>(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    zone: { type: String, required: true, trim: true, maxlength: 80 },
    frequency: { type: String, enum: CLEANING_FREQUENCIES, required: true },
    method: { type: String, default: "", maxlength: 400 },
    dueTime: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
taskSchema.plugin(jsonPlugin);
export const CleaningTask = model<ICleaningTask>("CleaningTask", taskSchema);

export interface ICleaningCompletion {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  taskId: Types.ObjectId;
  /** "YYYY-MM-DD" (quotidienne / après service) ou "YYYY-Www" (hebdomadaire) */
  periodKey: string;
  doneBy: string;
  doneByUserId?: Types.ObjectId | null;
  doneAt: Date;
}

const completionSchema = new Schema<ICleaningCompletion>({
  establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true, index: true },
  taskId: { type: Schema.Types.ObjectId, ref: "CleaningTask", required: true },
  periodKey: { type: String, required: true },
  doneBy: { type: String, required: true },
  doneByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  doneAt: { type: Date, default: Date.now },
});
completionSchema.index({ taskId: 1, periodKey: 1 }, { unique: true });
completionSchema.plugin(jsonPlugin);
export const CleaningCompletion = model<ICleaningCompletion>("CleaningCompletion", completionSchema);
