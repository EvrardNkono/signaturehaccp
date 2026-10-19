import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { EQUIPMENT_TYPES, EquipmentType, PAIRING_STATES, PairingState, DELETE_REASONS, DeleteReason } from "../domain/equipment";

export interface ISensor {
  battery: number;
  signal: number;
  online: boolean;
  pairing: PairingState;
  deviceKeyHash?: string | null;
  lastSeenAt?: Date | null;
}

export interface IEquipment {
  _id: Types.ObjectId;
  establishmentId: Types.ObjectId;
  name: string;
  type: EquipmentType;
  zone: string;
  min: number;
  max: number;
  warnMargin: number;
  temp: number | null;
  lastReadingAt?: Date | null;
  recentValues: number[];
  sensor: ISensor | null;
  archived: boolean;
  archivedAt?: Date | null;
  deleteReason?: DeleteReason;
  deleteNote?: string;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sensorSchema = new Schema<ISensor>(
  {
    battery: { type: Number, min: 0, max: 100, default: 100 },
    signal: { type: Number, min: 0, max: 4, default: 0 },
    online: { type: Boolean, default: false },
    pairing: { type: String, enum: PAIRING_STATES, default: "none" },
    deviceKeyHash: { type: String, default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { _id: false }
);

const schema = new Schema<IEquipment>(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    type: { type: String, enum: EQUIPMENT_TYPES, required: true },
    zone: { type: String, required: true, trim: true, maxlength: 80 },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    warnMargin: { type: Number, required: true, min: 0 },
    temp: { type: Number, default: null },
    lastReadingAt: { type: Date, default: null },
    recentValues: { type: [Number], default: [] },
    sensor: { type: sensorSchema, default: null },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    deleteReason: { type: String, enum: DELETE_REASONS },
    deleteNote: { type: String, maxlength: 500 },
    deletedBy: String,
  },
  { timestamps: true }
);
// L'index sur la clé d'appareil permet de retrouver l'équipement lors d'un relevé IoT.
schema.index({ "sensor.deviceKeyHash": 1 }, { sparse: true });
schema.plugin(jsonPlugin);

export const Equipment = model<IEquipment>("Equipment", schema);
