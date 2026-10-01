import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Customer acquisition sources (V2).
 * Structured list of acquisition channels + referral links between patients.
 * Customers keep both the legacy free-text `source` and the structured
 * `sourceId` — the marketing report aggregates on the structured one.
 */

export async function createCustomerSource(actor: AuthUser, input: { name: string; sortOrder?: number }) {
  const name = input.name.trim();
  if (!name) throw new AppError("اسم المصدر مطلوب", "VALIDATION");
  const existing = await db.customerSource.findUnique({ where: { name } });
  if (existing) throw new AppError("يوجد مصدر بنفس الاسم", "CONFLICT");
  const source = await db.customerSource.create({
    data: { name, sortOrder: input.sortOrder ?? 0, createdById: actor.id },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "customer_source.create", entityType: "customer_source", entityId: source.id, after: { name } });
  return source;
}

export async function listCustomerSources(actor: AuthUser, opts: { activeOnly?: boolean } = {}) {
  return db.customerSource.findMany({
    where: opts.activeOnly ? { active: true } : {},
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { customers: true } } },
  });
}

export async function updateCustomerSource(actor: AuthUser, sourceId: string, input: { name?: string; active?: boolean; sortOrder?: number }) {
  const source = await db.customerSource.findUnique({ where: { id: sourceId } });
  assertFound(source, "المصدر غير موجود");
  if (input.name !== undefined && input.name.trim() !== source.name) {
    const existing = await db.customerSource.findUnique({ where: { name: input.name.trim() } });
    if (existing) throw new AppError("يوجد مصدر بنفس الاسم", "CONFLICT");
  }
  const updated = await db.customerSource.update({
    where: { id: sourceId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "customer_source.update", entityType: "customer_source", entityId: sourceId, before: { name: source.name, active: source.active }, after: { name: updated.name, active: updated.active } });
  return updated;
}

/** Validates + links the structured source fields on a customer record. */
export async function resolveSourceFields(input: { sourceId?: string | null; sourceNote?: string | null; referrerCustomerId?: string | null }) {
  let sourceId: string | null = null;
  if (input.sourceId) {
    const source = await db.customerSource.findUnique({ where: { id: input.sourceId } });
    const src = mustFind(source, "مصدر التعريف غير موجود");
    if (!src.active) throw new AppError("مصدر التعريف غير نشط", "VALIDATION");
    sourceId = src.id;
  }
  if (input.referrerCustomerId) {
    const referrer = await db.customer.findUnique({ where: { id: input.referrerCustomerId } });
    assertFound(referrer, "المريضة المحوِّلة غير موجودة");
  }
  return {
    sourceId,
    sourceNote: input.sourceNote?.trim() || null,
    referrerCustomerId: input.referrerCustomerId || null,
  };
}

/** Marketing report: patients & billed revenue per acquisition source. */
export async function marketingReport(actor: AuthUser, opts: { from?: string | null; to?: string | null }) {
  const where = {
    createdAt: {
      ...(opts.from ? { gte: new Date(opts.from) } : {}),
      ...(opts.to ? { lte: new Date(opts.to + "T23:59:59.999Z") } : {}),
    },
  };
  const sources = await db.customerSource.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      customers: {
        where: opts.from || opts.to ? where : {},
        include: {
          invoices: { where: { status: { not: "VOID" } }, select: { finalAmount: true } },
        },
      },
    },
  });
  const bySource = sources.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    newCustomers: s.customers.length,
    billedAmount: s.customers.reduce((acc, c) => acc + c.invoices.reduce((a, i) => a + i.finalAmount.toNumber(), 0), 0),
  }));
  const referred = await db.customer.findMany({
    where: { referrerCustomerId: { not: null }, ...(opts.from || opts.to ? where : {}) },
    select: { id: true, fullName: true, referrer: { select: { id: true, fullName: true } } },
  });
  const totalNew = bySource.reduce((a, s) => a + s.newCustomers, 0);
  return { bySource, totalNew, referred, hasStructuredData: sources.length > 0 };
}