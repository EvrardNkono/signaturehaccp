import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { LOT_CATEGORIES, LOT_STATES, LotCategory, LotState } from "../domain/traceability";

export interface ILot {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  product: string;
  supplier: string;
  lotNumber: string;
  category: LotCategory;
  quantity: string;
  receivedAt: string; // YYYY-MM-DD
  dlc: string; // YYYY-MM-DD
  receptionTemp: number | null;
  note?: string;
  state: LotState;
  closedAt?: string; // YYYY-MM-DD
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ILot>(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
    product: { type: String, required: true, trim: true, maxlength: 160 },
    supplier: { type: String, required: true, trim: true, maxlength: 160 },
    lotNumber: { type: String, required: true, trim: true, maxlength: 80 },
    category: { type: String, enum: LOT_CATEGORIES, required: true },
    quantity: { type: String, required: true, trim: true, maxlength: 60 },
    receivedAt: { type: String, required: true },
    dlc: { type: String, required: true },
    receptionTemp: { type: Number, default: null },
    note: { type: String, maxlength: 500 },
    state: { type: String, enum: LOT_STATES, default: "stock" },
    closedAt: String,
    createdBy: String,
  },
  { timestamps: true }
);
schema.index({ establishmentId: 1, state: 1, dlc: 1 });
schema.index({ establishmentId: 1, lotNumber: 1 });
schema.plugin(jsonPlugin);

export const Lot = model<ILot>("Lot", schema);
