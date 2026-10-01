import "server-only";
import type { Role, UserStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { AppError, assertFound } from "@/lib/errors";
import { money } from "@/lib/money";
import { writeAudit } from "@/lib/audit";
import { GRANULAR_PERMISSIONS, PRESETS, assertPermission, entriesFromMap, effectiveMapFor, materializePreset, type GranularPermission } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

export interface CreateUserInput {
  username: string;
  name: string;
  englishName?: string | null;
  role: Role; // role preset (MAIN_DOCTOR=OWNER, FINANCE=ACCOUNTANT, DOCTOR, SECRETARY)
  password: string;
  monthlySalary?: number | null;
  jobTitle?: string | null;
  /** Explicit granted granular codes; defaults to the role preset materialized explicitly. */
  permissions?: string[];
}

const ALL_GRANULAR = Object.values(GRANULAR_PERMISSIONS) as string[];

export async function listUsers(actor: AuthUser): Promise<{ id: string; username: string; name: string; englishName: string | null; role: Role; status: UserStatus; createdAt: Date; employeeSalary: number | null; permissionOverrides: string[] }[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { employee: { select: { monthlySalary: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    englishName: u.englishName,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    employeeSalary: u.employee?.monthlySalary ? Number(u.employee.monthlySalary) : null,
    permissionOverrides: u.permissionOverrides,
  }));
}

export async function createUser(actor: AuthUser, input: CreateUserInput): Promise<{ id: string }> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  if (input.username.trim().length < 3) throw new AppError("اسم المستخدم قصير جدًا", "VALIDATION");
  if (input.password.length < 8) throw new AppError("كلمة المرور يجب ألا تقل عن 8 أحرف", "VALIDATION");
  const existing = await db.user.findUnique({ where: { username: input.username.trim() } });
  if (existing) throw new AppError("اسم المستخدم موجود مسبقًا", "CONFLICT");

  const passwordHash = await hashPassword(input.password);
  const explicit = materializePreset(input.role);
  if (input.permissions) {
    for (const code of input.permissions) {
      if (ALL_GRANULAR.includes(code)) explicit[code as GranularPermission] = true;
    }
  }
  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username: input.username.trim(),
        name: input.name.trim(),
        englishName: input.englishName?.trim() || null,
        role: input.role,
        passwordHash,
        mustChangePassword: true,
        permissionOverrides: entriesFromMap(explicit),
      },
    });
    if (input.monthlySalary !== null && input.monthlySalary !== undefined && input.monthlySalary > 0) {
      await tx.employee.create({
        data: {
          userId: created.id,
          name: input.name.trim(),
          englishName: input.englishName?.trim() || null,
          jobTitle: input.jobTitle ?? roleJobTitle(input.role),
          monthlySalary: input.monthlySalary,
          startDate: new Date(),
          active: true,
        },
      });
    }
    return created;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.create",
    entityType: "user",
    entityId: user.id,
    after: { username: user.username, name: user.name, role: user.role, preset: PRESETS[user.role], salary: input.monthlySalary ?? null },
  });
  return { id: user.id };
}

function roleJobTitle(role: Role): string {
  switch (role) {
    case "OWNER": return "الدكتور الرئيسي";
    case "MAIN_DOCTOR": return "طبيب رئيسي";
    case "ACCOUNTANT": return "محاسب مالي";
    case "DOCTOR": return "دكتور";
    case "SECRETARY": return "سكرتيرة";
  }
}

export async function updateUser(
  actor: AuthUser,
  userId: string,
  data: { name?: string; englishName?: string | null; role?: Role; status?: UserStatus; password?: string; monthlySalary?: number | null; activeEmployee?: boolean; applyPreset?: boolean },
): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  if (target.role === "OWNER" && data.role && data.role !== "OWNER") {
    throw new AppError("لا يمكن تغيير صلاحية حساب المالك الرئيسي", "VALIDATION");
  }
  const before = { name: target.name, role: target.role, status: target.status };
  const roleChanged = !!data.role && data.role !== target.role;
  const resetPermissions = roleChanged || data.applyPreset === true;

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.englishName !== undefined ? { englishName: data.englishName?.trim() || null } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.status !== undefined ? { status: data.status, deactivatedAt: data.status === "INACTIVE" ? new Date() : null } : {}),
        ...(data.password ? { passwordHash: await hashPassword(data.password), mustChangePassword: true } : {}),
        // Role presets are materialized into explicit Grant/Block entries on role change/reset.
        ...(resetPermissions ? { permissionOverrides: entriesFromMap(materializePreset(data.role ?? target.role)) } : {}),
      },
    });
    if (data.monthlySalary !== undefined) {
      const emp = await tx.employee.findUnique({ where: { userId } });
      if (emp) {
          await tx.employee.update({ where: { id: emp.id }, data: { monthlySalary: money(data.monthlySalary ?? 0), ...(data.englishName !== undefined ? { englishName: data.englishName?.trim() || null } : {}) } });
      } else if (data.monthlySalary !== null && data.monthlySalary > 0) {
        await tx.employee.create({
          data: { userId, name: data.name ?? target.name, englishName: data.englishName?.trim() || null, jobTitle: roleJobTitle(data.role ?? target.role), monthlySalary: data.monthlySalary, startDate: new Date(), active: true },
        });
      }
    }
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.update",
    entityType: "user",
    entityId: userId,
    before,
    after: { name: data.name, role: data.role, status: data.status, passwordChanged: !!data.password, salary: data.monthlySalary },
  });
  if (data.role && data.role !== target.role) {
    await writeAudit({
      userId: actor.id,
      userRole: actor.role,
      action: "user.role_change",
      entityType: "user",
      entityId: userId,
      before: { role: target.role, preset: PRESETS[target.role] },
      after: { role: data.role, preset: PRESETS[data.role] },
    });
  }
}

/**
 * Owner-level explicit Grant/Block editor.
 * The stored entries always form a COMPLETE map (every granular permission
 * resolved to GRANT: or DENY:). There is no inheritance and no third state.
 * The Owner may Grant or Block any individual permission for any non-owner
 * account — explicit entries always win over role defaults.
 */
export async function setUserPermissions(
  actor: AuthUser,
  userId: string,
  input: { granted: string[]; denied: string[] },
): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  if (target.role === "OWNER") throw new AppError("حساب المالك يحمل كل الصلاحيات دائمًا", "VALIDATION");

  const map = effectiveMapFor(target);
  for (const p of input.granted) if (ALL_GRANULAR.includes(p)) map[p as GranularPermission] = true;
  for (const p of input.denied) if (ALL_GRANULAR.includes(p)) map[p as GranularPermission] = false;
  const overrides = entriesFromMap(map);
  const before = target.permissionOverrides;
  await db.user.update({ where: { id: userId }, data: { permissionOverrides: overrides } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.permission_change",
    entityType: "user",
    entityId: userId,
    before: { overrides: before },
    after: { overrides, granted: input.granted, denied: input.denied, grantedCount: input.granted.length, deniedCount: input.denied.length },
  });
}

/** Re-applies the role preset explicitly: every permission rewritten as Grant/Block of the preset. */
export async function resetUserPermissions(actor: AuthUser, userId: string): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  if (target.role === "OWNER") throw new AppError("حساب المالك يحمل كل الصلاحيات دائمًا", "VALIDATION");
  const overrides = entriesFromMap(materializePreset(target.role));
  const before = target.permissionOverrides;
  await db.user.update({ where: { id: userId }, data: { permissionOverrides: overrides } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.permission_reset",
    entityType: "user",
    entityId: userId,
    before: { overrides: before },
    after: { overrides, role: target.role, preset: PRESETS[target.role] },
  });
}

export async function deactivateUser(actor: AuthUser, userId: string, reason: string): Promise<void> {
  if (userId === actor.id) throw new AppError("لا يمكنك إيقاف حسابك الخاص", "VALIDATION");
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  if (target.role === "OWNER") throw new AppError("لا يمكن تعطيل حساب المالك الرئيسي", "VALIDATION");
  await updateUser(actor, userId, { status: "INACTIVE" });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.deactivate",
    entityType: "user",
    entityId: userId,
    after: { reason: reason.trim() },
  });
}

export async function reactivateUser(actor: AuthUser, userId: string): Promise<void> {
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  await updateUser(actor, userId, { status: "ACTIVE" });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.activate",
    entityType: "user",
    entityId: userId,
    after: { status: "ACTIVE" },
  });
}

/** Owner resets credentials/password; the user must choose a new one on next login. */
export async function resetPassword(actor: AuthUser, userId: string, newPassword: string): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  if (newPassword.length < 8) throw new AppError("كلمة المرور يجب ألا تقل عن 8 أحرف", "VALIDATION");
  const target = await db.user.findUnique({ where: { id: userId } });
  assertFound(target, "المستخدم غير موجود");
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: true } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.reset_password",
    entityType: "user",
    entityId: userId,
    after: { mustChangePassword: true },
  });
}

const PROTECTED_REF_MESSAGE = "لا يمكن حذف الحساب لوجود عمليات سابقة مرتبطة به. يمكنك تعطيل الحساب للحفاظ على السجل.";

/** Permanent deletion is allowed only when the account has NO protected historical references. */
export async function deleteUser(actor: AuthUser, userId: string): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.USERS_MANAGE);
  if (userId === actor.id) throw new AppError("لا يمكنك حذف حسابك الخاص", "VALIDATION");
  const target = await db.user.findUnique({ where: { id: userId }, include: { employee: true } });
  assertFound(target, "المستخدم غير موجود");
  if (target.role === "OWNER") throw new AppError("لا يمكن حذف حساب المالك الرئيسي", "VALIDATION");

  const refs = await Promise.all([
    db.treatment.count({ where: { doctorId: userId } }),
    db.visit.count({ where: { OR: [{ doctorId: userId }, { checkedInById: userId }, { closedById: userId }] } }),
    db.payment.count({ where: { collectedById: userId } }),
    db.discount.count({ where: { approvedById: userId } }),
    db.invoiceLine.count({ where: { createdById: userId } }),
    db.purchase.count({ where: { createdById: userId } }),
    db.expense.count({ where: { OR: [{ createdById: userId }, { approvedById: userId }] } }),
    db.stockMovement.count({ where: { userId } }),
    db.purchaseRequest.count({ where: { OR: [{ requesterId: userId }, { approvedById: userId }] } }),
    db.inventoryCount.count({ where: { OR: [{ createdById: userId }, { performedById: userId }, { reviewedById: userId }, { postedById: userId }] } }),
    db.dayClosing.count({ where: { OR: [{ closedById: userId }, { reopenedById: userId }] } }),
    db.followUpTask.count({ where: { OR: [{ assignedToId: userId }, { doctorId: userId }, { completedById: userId }] } }),
    db.communicationLog.count({ where: { sentById: userId } }),
    db.auditLog.count({ where: { userId } }),
    db.attachment.count({ where: { uploadedById: userId } }),
    db.customer.count({ where: { createdById: userId } }),
    db.patientUpdateLog.count({ where: { userId } }),
    db.customerMedicalProfile.count({ where: { updatedByDoctorId: userId } }),
    db.customerMedicalEvent.count({ where: { createdById: userId } }),
    db.service.count({ where: { createdById: userId } }),
    db.product.count({ where: { createdById: userId } }),
    db.supplier.count({ where: { createdById: userId } }),
    db.expenseCategory.count({ where: { createdById: userId } }),
    db.setting.count({ where: { updatedById: userId } }),
    db.campaign.count({ where: { OR: [{ createdById: userId }, { cancelledById: userId }] } }),
    db.payrollItem.count({ where: { employee: { userId } } }),
  ]);
  const hasRefs = refs.some((n) => n > 0);
  if (hasRefs) throw new AppError(PROTECTED_REF_MESSAGE, "CONFLICT");

  await db.$transaction(async (tx) => {
    if (target.employee) await tx.employee.delete({ where: { id: target.employee.id } });
    await tx.user.delete({ where: { id: userId } });
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "user.delete",
    entityType: "user",
    entityId: userId,
    after: { username: target.username, name: target.name, role: target.role },
  });
}
