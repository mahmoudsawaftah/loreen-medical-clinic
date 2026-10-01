import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import type { AuthUser } from "@/lib/auth/authorize";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Wraps a service call into a safe action result and audits failures. */
export async function runAction<T>(handler: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await handler();
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) {
      return { ok: false, error: e.message };
    }
    if (e && typeof e === "object" && "digest" in e) throw e; // next redirect/navigation
    console.error("action failed", e);
    return { ok: false, error: "حدث خطأ غير متوقع" };
  }
}

export async function clientMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  return {
    ip: xff ? xff.split(",")[0].trim() : null,
    userAgent: h.get("user-agent"),
  };
}

export async function auditFromRequest(actor: AuthUser, action: string, entityType: string, entityId?: string, after?: unknown, before?: unknown): Promise<void> {
  const meta = await clientMeta();
  await writeAudit({ userId: actor.id, userRole: actor.role, action, entityType, entityId, before, after, ip: meta.ip, userAgent: meta.userAgent });
}

export async function requireOwnerOrRedirect(): Promise<AuthUser> {
  const { requirePermission } = await import("@/lib/auth/authorize");
  const { PERMISSIONS } = await import("@/lib/permissions");
  return requirePermission(PERMISSIONS.USERS_MANAGE as never);
}

export { redirect };