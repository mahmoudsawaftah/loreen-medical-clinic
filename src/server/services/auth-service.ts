import "server-only";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { ROLE_LABELS } from "@/lib/permissions";

export interface LoginResult {
  ok: boolean;
  error?: string;
  mustChangePassword?: boolean;
}

export async function login(username: string, password: string, ip?: string | null, userAgent?: string | null): Promise<LoginResult> {
  const user = await db.user.findUnique({ where: { username: username.trim() } });
  if (!user) {
    // uniform error, do not leak which field was wrong
    return { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" };
  if (user.status !== "ACTIVE") return { ok: false, error: "هذا الحساب موقوف، يرجى مراجعة الإدارة" };

  const settings = await getSettings();
  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    name: user.name,
    ttlMinutes: settings.sessionTtlMinutes,
  });
  await setSessionCookie(token);

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAudit({
    userId: user.id,
    userRole: user.role,
    action: "auth.login",
    entityType: "user",
    entityId: user.id,
    ip,
    userAgent,
  });

  return { ok: true, mustChangePassword: user.mustChangePassword };
}

export async function logout(userId: string | null, role: import("@prisma/client").Role | null): Promise<void> {
  if (userId) {
    await writeAudit({ userId, userRole: role, action: "auth.logout", entityType: "user", entityId: userId });
  }
  await clearSessionCookie();
}

export async function changePassword(
  userId: string,
  role: import("@prisma/client").Role,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) throw new AppError("كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف", "VALIDATION");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new AppError("كلمة المرور الحالية غير صحيحة", "VALIDATION");

  const newHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: userId }, data: { passwordHash: newHash, mustChangePassword: false } });
  await writeAudit({
    userId,
    userRole: role,
    action: "auth.change_password",
    entityType: "user",
    entityId: userId,
    after: { changed: true },
  });
}

export const ROLE_LABELS_EXPORT = ROLE_LABELS;
