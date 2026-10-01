import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { money } from "@/lib/money";
import type { AuthUser } from "@/lib/auth/authorize";

export interface SaveServiceInput {
  name: string;
  englishName?: string | null;
  category?: string | null;
  defaultPrice?: number | null;
  durationMinutes?: number | null;
  notes?: string | null;
  /** [{ productId?, name, qty, unit? }] — informational recipe reference for the doctor. */
  defaultMaterials?: { productId?: string | null; name: string; qty: string | number; unit?: string | null }[];
  active?: boolean;
}

/** Converts recipe lines into a Prisma Json-compatible value (or JsonNull to clear). */
function materialsJson(input: SaveServiceInput["defaultMaterials"] | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (input === undefined) return undefined;
  if (!input || input.length === 0) return Prisma.JsonNull;
  return input as unknown as Prisma.InputJsonValue;
}

export async function createService(actor: AuthUser, input: SaveServiceInput): Promise<{ id: string }> {
  if (!input.name.trim()) throw new AppError("اسم الخدمة مطلوب", "VALIDATION");
  if (input.defaultPrice != null && input.defaultPrice < 0) throw new AppError("السعر لا يمكن أن يكون سالبًا", "VALIDATION");
  if (input.durationMinutes != null && input.durationMinutes <= 0) throw new AppError("المدة يجب أن تكون أكبر من صفر", "VALIDATION");
  const created = await db.service.create({
    data: {
      name: input.name.trim(),
      englishName: input.englishName?.trim() || null,
      category: input.category?.trim() || null,
      defaultPrice: input.defaultPrice != null ? money(input.defaultPrice) : null,
      durationMinutes: input.durationMinutes ?? null,
      notes: input.notes?.trim() || null,
      defaultMaterials: materialsJson(input.defaultMaterials),
      createdById: actor.id,
      active: input.active ?? true,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "service.create",
    entityType: "service",
    entityId: created.id,
    after: { name: created.name, defaultPrice: input.defaultPrice ?? null },
  });
  return { id: created.id };
}

export async function updateService(actor: AuthUser, serviceId: string, input: SaveServiceInput): Promise<void> {
  const existing = await db.service.findUnique({ where: { id: serviceId } });
  assertFound(existing, "الخدمة غير موجودة");
  if (input.name && !input.name.trim()) throw new AppError("اسم الخدمة مطلوب", "VALIDATION");
  const before = { name: existing.name, defaultPrice: existing.defaultPrice?.toNumber() ?? null };
  await db.service.update({
    where: { id: serviceId },
    data: {
      name: input.name?.trim() ?? existing.name,
      englishName: input.englishName === undefined ? existing.englishName : input.englishName?.trim() || null,
      category: input.category === undefined ? existing.category : input.category?.trim() || null,
      defaultPrice: input.defaultPrice === undefined ? existing.defaultPrice : input.defaultPrice != null ? money(input.defaultPrice) : null,
      durationMinutes: input.durationMinutes === undefined ? existing.durationMinutes : input.durationMinutes,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
      defaultMaterials: materialsJson(input.defaultMaterials),
      active: input.active ?? existing.active,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "service.update",
    entityType: "service",
    entityId: serviceId,
    before,
    after: { name: input.name ?? existing.name },
  });
}

/**
 * Disable instead of hard delete when the service is referenced by any past
 * treatment item (audit/invoice integrity). Unreferenced services may be deleted.
 */
export async function deleteService(actor: AuthUser, serviceId: string): Promise<void> {
  const existing = await db.service.findUnique({ where: { id: serviceId } });
  assertFound(existing, "الخدمة غير موجودة");
  const refs = await db.treatmentItem.count({ where: { serviceId } });
  if (refs > 0) {
    await db.service.update({ where: { id: serviceId }, data: { active: false } });
    await writeAudit({
      userId: actor.id,
      userRole: actor.role,
      action: "service.disable_on_delete",
      entityType: "service",
      entityId: serviceId,
      before: { active: existing.active },
      after: { active: false },
    });
    throw new AppError("الخدمة مستخدمة في جلسات سابقة — تم تعطيلها بدلًا من حذفها", "CONFLICT");
  }
  await db.service.delete({ where: { id: serviceId } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "service.delete",
    entityType: "service",
    entityId: serviceId,
    before: { name: existing.name },
    after: null,
  });
}

export async function setServiceActive(actor: AuthUser, serviceId: string, active: boolean): Promise<void> {
  const existing = await db.service.findUnique({ where: { id: serviceId } });
  assertFound(existing, "الخدمة غير موجودة");
  await db.service.update({ where: { id: serviceId }, data: { active } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: active ? "service.enable" : "service.disable",
    entityType: "service",
    entityId: serviceId,
    before: { active: existing.active },
    after: { active },
  });
}

export async function listServices(actor: AuthUser, opts: { activeOnly?: boolean; query?: string; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  if (opts.activeOnly) where.active = true;
  if (opts.query?.trim()) {
    where.OR = [
      { name: { contains: opts.query.trim(), mode: "insensitive" } },
      { englishName: { contains: opts.query.trim(), mode: "insensitive" } },
    ];
  }
  const [total, items] = await Promise.all([
    db.service.count({ where }),
    db.service.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { createdBy: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
