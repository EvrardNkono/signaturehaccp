import { Schema } from "mongoose";

/** Plugin : expose `id` à la place de `_id`, retire `__v` et les champs privés. */
export function jsonPlugin(schema: Schema) {
  schema.set("toJSON", {
    virtuals: false,
    versionKey: false,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      delete ret.passwordResetTokenHash;
      delete ret.passwordResetExpires;
      delete ret.failedLoginCount;
      delete ret.lockedUntil;
      delete ret.storageKey; // fichiers : jamais exposés tels quels
      delete ret.fileUrl;
      delete ret.storageDriver;
      return ret;
    },
  });
}

export const iso = (d?: Date | null): string | undefined => (d ? d.toISOString() : undefined);
