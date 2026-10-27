import { Schema, model, Types } from "mongoose";
import { jsonPlugin } from "../utils/serialize";
import { USER_ROLES, UserRole } from "../domain/permissions";
import { GUIDE_STATUSES, GuideStatus } from "../domain/guide";

export interface IUser {
  _id: Types.ObjectId;
  companyId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  primaryEstablishmentId?: Types.ObjectId | null;
  authorizedEstablishmentIds: Types.ObjectId[];
  active: boolean;
  lastSeenAt?: Date | null;
  failedLoginCount: number;
  lockedUntil?: Date | null;
  passwordResetTokenHash?: string | null;
  passwordResetExpires?: Date | null;
  mustChangePassword: boolean;
  /** Guide d'utilisation : progression propre à chaque utilisateur. */
  guide: {
    status: GuideStatus;
    seenSteps: string[];
    checklistHidden: boolean;
    lastStartedAt?: Date | null;
    updatedAt?: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IUser>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, trim: true, maxlength: 80, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: USER_ROLES, required: true },
    primaryEstablishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", default: null },
    authorizedEstablishmentIds: { type: [Schema.Types.ObjectId], default: [] },
    active: { type: Boolean, default: true },
    lastSeenAt: { type: Date, default: null },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    passwordResetTokenHash: { type: String, default: null, index: true },
    passwordResetExpires: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    guide: {
      status: { type: String, enum: GUIDE_STATUSES, default: "active" },
      seenSteps: { type: [String], default: [] },
      checklistHidden: { type: Boolean, default: false },
      lastStartedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);
schema.plugin(jsonPlugin);

export const User = model<IUser>("User", schema);
