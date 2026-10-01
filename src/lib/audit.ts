import "server-only";
import { db } from "./db";
import type { Role } from "@prisma/client";

/**
 * Audit trail for every sensitive mutation.
 * Records: actor, role, action, entity, entity ID, before/after payload, timestamp.
 * Audit rows are append-only — no normal product flow can edit them.
 */

export interface AuditInput {
  userId: string | null;
  userRole: Role | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

function safeJson(v: unknown): string | null {
  if (v === undefined) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId,
      userRole: input.userRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: safeJson(input.before),
      afterJson: safeJson(input.after),
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
