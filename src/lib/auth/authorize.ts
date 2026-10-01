import "server-only";
import type { Role, User } from "@prisma/client";
import { cache } from "react";
import { db } from "../db";
import { getSessionToken, verifySessionToken } from "./session";
import { UnauthorizedError, ForbiddenError } from "../errors";
import { hasPermission, type Permission } from "../permissions";

export interface AuthUser {
  id: string;
  username: string;
  name: string;
  englishName: string | null;
  role: Role;
  mustChangePassword: boolean;
  permissionOverrides: string[];
  jobTitle: string | null;
}

/** Returns the current authenticated user (throws if not logged in). */
export async function getCurrentUser(): Promise<AuthUser> {
  const token = await getSessionToken();
  if (!token) throw new UnauthorizedError();
  const payload = await verifySessionToken(token);
  if (!payload) throw new UnauthorizedError("انتهت الجلسة، يرجى تسجيل الدخول مجددًا");
  const user = await db.user.findUnique({
    where: { id: payload.userId },
    include: { employee: { select: { jobTitle: true } } },
  });
  if (!user || user.status !== "ACTIVE") throw new UnauthorizedError("الحساب غير نشط أو غير موجود");
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    englishName: user.englishName,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    permissionOverrides: user.permissionOverrides,
    jobTitle: user.employee?.jobTitle ?? null,
  };
}

/** Null-safe variant for public pages. */
export const getOptionalUser = cache(async (): Promise<AuthUser | null> => {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
});

export async function requireUser(): Promise<AuthUser> {
  return getCurrentUser();
}

/** Throws ForbiddenError unless the user's role+overrides hold the permission. */
export async function requirePermission(permission: Permission): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!hasPermission(user, permission)) throw new ForbiddenError();
  return user;
}

export async function requireRole(roles: Role[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!roles.includes(user.role)) throw new ForbiddenError();
  return user;
}

/** Fetch full user record (server-side only, never expose password hash). */
export async function getUserRecord(userId: string): Promise<User> {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new UnauthorizedError();
  return u;
}
