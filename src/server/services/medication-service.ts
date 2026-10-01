import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import type { AuthUser } from "@/lib/auth/authorize";

export interface SaveMedicationInput {
  name: string;
  brand?: string | null;
  form?: string | null;
  strength?: string | null;
  notes?: string | null;
  inventoryProductId?: string | null;
  active?: boolean;
}

/** Catalog lookup used by the doctor's autocomplete (quick typing, name match). */
export async function searchMedications(query: string, limit = 10) {
  const items = await db.medication.findMany({
    where: {
      active: true,
      ...(query.trim() ? { name: { contains: query.trim(), mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    take: limit,
  });
  return items;
}

export async function createMedication(actor: AuthUser, input: SaveMedicationInput): Promise<{ id: string }> {
  if (!input.name.trim()) throw new AppError("اسم الدواء مطلوب", "VALIDATION");
  const created = await db.medication.create({
    data: {
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      form: input.form?.trim() || null,
      strength: input.strength?.trim() || null,
      notes: input.notes?.trim() || null,
      inventoryProductId: input.inventoryProductId ?? null,
      createdById: actor.id,
      active: input.active ?? true,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "medication.create",
    entityType: "medication",
    entityId: created.id,
    after: { name: created.name },
  });
  return { id: created.id };
}

export async function updateMedication(actor: AuthUser, medicationId: string, input: SaveMedicationInput): Promise<void> {
  const existing = await db.medication.findUnique({ where: { id: medicationId } });
  assertFound(existing, "الدواء غير موجود");
  if (input.name && !input.name.trim()) throw new AppError("اسم الدواء مطلوب", "VALIDATION");
  const before = { name: existing.name };
  await db.medication.update({
    where: { id: medicationId },
    data: {
      name: input.name?.trim() ?? existing.name,
      brand: input.brand === undefined ? existing.brand : input.brand?.trim() || null,
      form: input.form === undefined ? existing.form : input.form?.trim() || null,
      strength: input.strength === undefined ? existing.strength : input.strength?.trim() || null,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
      inventoryProductId: input.inventoryProductId === undefined ? existing.inventoryProductId : input.inventoryProductId,
      active: input.active ?? existing.active,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "medication.update",
    entityType: "medication",
    entityId: medicationId,
    before,
    after: { name: input.name ?? existing.name },
  });
}

export async function disableMedication(actor: AuthUser, medicationId: string, disabled: boolean): Promise<void> {
  const existing = await db.medication.findUnique({ where: { id: medicationId } });
  assertFound(existing, "الدواء غير موجود");
  await db.medication.update({ where: { id: medicationId }, data: { active: !disabled } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: disabled ? "medication.disable" : "medication.enable",
    entityType: "medication",
    entityId: medicationId,
    before: { active: existing.active },
    after: { active: !disabled },
  });
}

export async function listMedications(actor: AuthUser, opts: { activeOnly?: boolean; query?: string; page?: number; pageSize?: number } = {}) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  if (opts.activeOnly) where.active = true;
  if (opts.query?.trim()) where.name = { contains: opts.query.trim(), mode: "insensitive" };
  const [total, items] = await Promise.all([
    db.medication.count({ where }),
    db.medication.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { id: true, name: true, stockUnit: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
