import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { getSettings, updateSettings, type ClinicSettings } from "@/lib/settings";
import type { AuthUser } from "@/lib/auth/authorize";

export async function getSettingsForView(actor: AuthUser) {
  return getSettings();
}

export async function updateClinicSettings(actor: AuthUser, partial: Partial<ClinicSettings>): Promise<ClinicSettings> {
  const before = await getSettings();
  const beforeSafe = { timezone: before.timezone, currency: before.currency, inventoryDeductAt: before.inventoryDeductAt };
  const updated = await updateSettings(partial, actor.id);
  const afterSafe = { timezone: updated.timezone, currency: updated.currency, inventoryDeductAt: updated.inventoryDeductAt };
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "settings.update",
    entityType: "settings",
    after: { ...afterSafe, changedKeys: Object.keys(partial) },
    before: beforeSafe,
  });
  return updated;
}

export async function getServiceCatalog(actor: AuthUser) {
  return db.service.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function createService(actor: AuthUser, input: { name: string; category?: string | null; defaultPrice?: number | null }) {
  if (!input.name.trim()) throw new AppError("اسم الخدمة مطلوب", "VALIDATION");
  const s = await db.service.create({
    data: { name: input.name.trim(), category: input.category || null, defaultPrice: input.defaultPrice ?? null, createdById: actor.id },
  });
  await db.$executeRaw`SELECT 1`; // no-op to keep tx shape simple
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "service.create", entityType: "service", entityId: s.id, after: { name: s.name } });
  return s;
}