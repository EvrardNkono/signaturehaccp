import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";

export interface ICompany {
  _id: Types.ObjectId;
  name: string;
  kbis: string;
  onboarding: { completedSteps: string[] };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    kbis: { type: String, required: true, trim: true },
    onboarding: { completedSteps: { type: [String], default: [] } },
  },
  { timestamps: true }
);
schema.plugin(jsonPlugin);

export const Company = model<ICompany>("Company", schema);
