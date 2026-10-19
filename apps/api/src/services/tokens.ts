import jwt from "jsonwebtoken";
import { CookieOptions, Response } from "express";
import { HydratedDocument } from "mongoose";
import { env } from "../config/env";
import { IUser, RefreshToken } from "../models";
import { randomToken, sha256 } from "../utils/password";
import { unauthorized } from "../utils/httpError";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

type AccessPayload = { sub: string; role: string; cid: string };

export function signAccessToken(user: HydratedDocument<IUser>): string {
  const payload: AccessPayload = { sub: String(user._id), role: user.role, cid: String(user.companyId) };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`, issuer: "signature-haccp" });
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "signature-haccp" }) as AccessPayload;
  } catch {
    throw unauthorized("Session expirée ou invalide.", "TOKEN_INVALID");
  }
}

type Meta = { userAgent?: string; ip?: string };

export async function issueRefreshToken(userId: unknown, meta: Meta = {}, family?: string): Promise<string> {
  const token = randomToken(48);
  await RefreshToken.create({
    userId,
    tokenHash: sha256(token),
    family: family ?? randomToken(12),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    userAgent: meta.userAgent?.slice(0, 250),
    ip: meta.ip,
  });
  return token;
}

/** Rotation : chaque refresh token n'est utilisable qu'une fois. La réutilisation d'un jeton révoqué révoque toute la famille. */
export async function rotateRefreshToken(token: string, meta: Meta = {}): Promise<{ userId: string; newToken: string }> {
  const hash = sha256(token);
  const stored = await RefreshToken.findOne({ tokenHash: hash });
  if (!stored) throw unauthorized("Session invalide.", "REFRESH_INVALID");

  if (stored.revokedAt) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw unauthorized("Session invalide.", "REFRESH_REUSED");
  }
  if (stored.expiresAt.getTime() < Date.now()) throw unauthorized("Session expirée.", "REFRESH_EXPIRED");

  stored.revokedAt = new Date();
  await stored.save();
  const newToken = await issueRefreshToken(stored.userId, meta, stored.family);
  return { userId: String(stored.userId), newToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const stored = await RefreshToken.findOne({ tokenHash: sha256(token) });
  if (stored) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
}

export async function revokeAllForUser(userId: unknown): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

function baseCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

export function setAuthCookies(res: Response, access: string, refresh: string) {
  res.cookie(ACCESS_COOKIE, access, { ...baseCookie(), path: "/", maxAge: env.ACCESS_TOKEN_TTL_MIN * 60_000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...baseCookie(), path: "/api/v1/auth", maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: "/api/v1/auth" });
}
