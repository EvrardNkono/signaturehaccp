import bcrypt from "bcryptjs";
import crypto from "crypto";

const ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

/** Mot de passe : 8 caractères minimum, avec au moins une lettre et un chiffre. */
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "8 caractères minimum.";
  if (p.length > 128) return "128 caractères maximum.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Doit contenir au moins une lettre et un chiffre.";
  return null;
}
