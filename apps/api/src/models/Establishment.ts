import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";

export interface IThresholdSettings {
  coldroomMax: number;
  fridgeMax: number;
  freezerMax: number;
  warnMargin: number;
  polarWarn: number;
  polarLimit: number;
  oilMaxTemp: number;
  dlcSoonDays: number;
}

export interface INotificationPrefs {
  channels: { push: boolean; email: boolean };
  byLevel: { critical: boolean; warn: boolean; info: boolean };
  quietHours: { enabled: boolean; from: string; to: string };
  frequency: "immediate" | "daily" | "weekly";
  extraRecipients: string[];
}

export interface IEstablishment {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  name: string;
  city?: string;
  address?: string;
  zip?: string;
  phone?: string;
  email?: string;
  siret?: string;
  manager?: string;
  timezone: string;
  active: boolean;
  settings: IThresholdSettings;
  notificationPrefs: INotificationPrefs;
  createdAt: Date;
  updatedAt: Date;
}

export const defaultThresholdSettings: IThresholdSettings = {
  coldroomMax: 3,
  fridgeMax: 4,
  freezerMax: -18,
  warnMargin: 0.5,
  polarWarn: 22,
  polarLimit: 25,
  oilMaxTemp: 180,
  dlcSoonDays: 2,
};

export const defaultNotificationPrefs: INotificationPrefs = {
  channels: { push: true, email: true },
  byLevel: { critical: true, warn: true, info: false },
  quietHours: { enabled: false, from: "22:00", to: "07:00" },
  frequency: "immediate",
  extraRecipients: [],
};

const schema = new Schema<IEstablishment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    zip: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    siret: { type: String, trim: true },
    manager: { type: String, trim: true },
    timezone: { type: String, default: "Europe/Paris" },
    active: { type: Boolean, default: true },
    settings: {
      coldroomMax: { type: Number, default: defaultThresholdSettings.coldroomMax },
      fridgeMax: { type: Number, default: defaultThresholdSettings.fridgeMax },
      freezerMax: { type: Number, default: defaultThresholdSettings.freezerMax },
      warnMargin: { type: Number, default: defaultThresholdSettings.warnMargin },
      polarWarn: { type: Number, default: defaultThresholdSettings.polarWarn },
      polarLimit: { type: Number, default: defaultThresholdSettings.polarLimit },
      oilMaxTemp: { type: Number, default: defaultThresholdSettings.oilMaxTemp },
      dlcSoonDays: { type: Number, default: defaultThresholdSettings.dlcSoonDays },
    },
    notificationPrefs: {
      channels: {
        push: { type: Boolean, default: true },
        email: { type: Boolean, default: true },
      },
      byLevel: {
        critical: { type: Boolean, default: true },
        warn: { type: Boolean, default: true },
        info: { type: Boolean, default: false },
      },
      quietHours: {
        enabled: { type: Boolean, default: false },
        from: { type: String, default: "22:00" },
        to: { type: String, default: "07:00" },
      },
      frequency: { type: String, enum: ["immediate", "daily", "weekly"], default: "immediate" },
      extraRecipients: { type: [String], default: [] },
    },
  },
  { timestamps: true }
);
schema.plugin(jsonPlugin);

export const Establishment = model<IEstablishment>("Establishment", schema);
