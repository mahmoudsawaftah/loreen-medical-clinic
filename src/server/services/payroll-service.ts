import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings, dailySalaryShare } from "@/lib/settings";
import { money } from "@/lib/money";
import { assertPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Payroll: monthly salary per employee, snapshotted per payroll period so
 * later salary changes never alter historical reports.
 * Daily allocation for dashboards follows settings.salaryAllocationMode
 * (TBD default: CALENDAR_DAYS).
 */

export async function listEmployees(actor: AuthUser) {
  return db.employee.findMany({
    orderBy: [ { active: "desc" }, { name: "asc" } ],
    include: {
      user: { select: { id: true, username: true, role: true, status: true, englishName: true } },
      salaryHistory: { orderBy: { effectiveFrom: "desc" }, take: 1 },
      _count: { select: { salaryHistory: true } },
    },
  });
}

/** Creates the employee and its opening salary-period row (the salary baseline). */
export async function createEmployee(actor: AuthUser, input: { name: string; englishName?: string | null; jobTitle: string; monthlySalary: number; startDate: string; notes?: string | null; userId?: string | null }) {
  if (money(input.monthlySalary).lt(0)) throw new AppError("الراتب لا يمكن أن يكون سالبًا", "VALIDATION");
  const start = new Date(input.startDate);
  const emp = await db.$transaction(async (tx) => {
    const created = await tx.employee.create({
      data: {
        userId: input.userId || null,
        name: input.name.trim(),
        englishName: input.englishName?.trim() || null,
        jobTitle: input.jobTitle.trim(),
        monthlySalary: money(input.monthlySalary),
        startDate: start,
        notes: input.notes || null,
      },
    });
    await tx.salaryHistory.create({
      data: {
        employeeId: created.id,
        monthlySalary: money(input.monthlySalary),
        effectiveFrom: start,
        createdBy: actor.id,
        reason: "راتب افتتاحي",
      },
    });
    return created;
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "employee.create", entityType: "employee", entityId: emp.id, after: { name: emp.name, salary: input.monthlySalary } });
  return emp;
}

/**
 * Applies a NEW salary as a new effective period: the previous open row is
 * closed (effectiveTo = new effectiveFrom) and never modified; the employee's
 * current salary is the latest open row.
 */
export async function changeSalary(actor: AuthUser, employeeId: string, input: { monthlySalary: number; effectiveFrom: string; reason: string }) {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT);
  if (money(input.monthlySalary).lt(0)) throw new AppError("الراتب لا يمكن أن يكون سالبًا", "VALIDATION");
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  assertFound(emp, "الموظف غير موجود");
  const effective = new Date(input.effectiveFrom);
  const open = await db.salaryHistory.findFirst({ where: { employeeId, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });

  await db.$transaction(async (tx) => {
    if (open) {
      await tx.salaryHistory.update({
        where: { id: open.id },
        data: { effectiveTo: effective },
      });
    }
    await tx.salaryHistory.create({
      data: {
        employeeId,
        monthlySalary: money(input.monthlySalary),
        effectiveFrom: effective,
        createdBy: actor.id,
        reason: input.reason.trim() || "تعديل راتب",
      },
    });
    await tx.employee.update({ where: { id: employeeId }, data: { monthlySalary: money(input.monthlySalary) } });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "employee.salary_change",
    entityType: "employee",
    entityId: employeeId,
    before: { monthlySalary: open ? open.monthlySalary.toNumber() : emp.monthlySalary.toNumber() },
    after: { monthlySalary: input.monthlySalary, effectiveFrom: input.effectiveFrom, reason: input.reason },
  });
}

/** Immutable salary timeline for an employee (newest first). */
export async function listSalaryHistory(actor: AuthUser, employeeId: string) {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL);
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  assertFound(emp, "الموظف غير موجود");
  return db.salaryHistory.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: "desc" },
    include: { employee: { select: { name: true } } },
  });
}

/** Ends employment: closes the open salary row and marks the employee inactive. */
export async function endEmployment(actor: AuthUser, employeeId: string, endDate: string) {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT);
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  assertFound(emp, "الموظف غير موجود");
  if (!emp.active) throw new AppError("الموظف ليس في الخدمة حاليًا", "VALIDATION");
  const end = new Date(endDate);
  const open = await db.salaryHistory.findFirst({ where: { employeeId, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });
  await db.$transaction(async (tx) => {
    if (open) {
      await tx.salaryHistory.update({ where: { id: open.id }, data: { effectiveTo: end } });
    }
    await tx.employee.update({ where: { id: employeeId }, data: { active: false, endDate: end } });
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "employee.end", entityType: "employee", entityId: employeeId, after: { endDate } });
}

export async function reactivateEmployee(actor: AuthUser, employeeId: string) {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT);
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  assertFound(emp, "الموظف غير موجود");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { active: true, endDate: null } });
    const open = await tx.salaryHistory.findFirst({ where: { employeeId, effectiveTo: null } });
    if (!open) {
      await tx.salaryHistory.create({
        data: { employeeId, monthlySalary: emp.monthlySalary, effectiveFrom: new Date(), createdBy: actor.id, reason: "إعادة تفعيل الخدمة" },
      });
    }
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "employee.reactivate", entityType: "employee", entityId: employeeId, after: { active: true } });
}

const PROTECTED_REF_MESSAGE = "لا يمكن حذف هذا الموظف لوجود سجل سابق مرتبط به. يمكنك تعطيله.";

/**
 * Permanent deletion is allowed only when the employee has NO protected
 * history: payroll participation, salary changes beyond the opening row,
 * the linked account's operational history, or any treatment/payment/
 * inventory/purchase/expense reference to the account.
 */
export async function deleteEmployee(actor: AuthUser, employeeId: string): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT);
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: { user: true } });
  assertFound(emp, "الموظف غير موجود");

  const checks: Promise<number>[] = [
    db.payrollItem.count({ where: { employeeId } }),
    db.salaryHistory.count({ where: { employeeId, NOT: { reason: "راتب افتتاحي" } } }),
  ];
  if (emp.user) {
    checks.push(
      db.treatment.count({ where: { doctorId: emp.user.id } }),
      db.visit.count({ where: { OR: [{ doctorId: emp.user.id }, { checkedInById: emp.user.id }, { closedById: emp.user.id }] } }),
      db.payment.count({ where: { collectedById: emp.user.id } }),
      db.discount.count({ where: { approvedById: emp.user.id } }),
      db.invoiceLine.count({ where: { createdById: emp.user.id } }),
      db.purchase.count({ where: { createdById: emp.user.id } }),
      db.expense.count({ where: { OR: [{ createdById: emp.user.id }, { approvedById: emp.user.id }] } }),
      db.stockMovement.count({ where: { userId: emp.user.id } }),
      db.purchaseRequest.count({ where: { OR: [{ requesterId: emp.user.id }, { approvedById: emp.user.id }] } }),
      db.inventoryCount.count({ where: { OR: [{ createdById: emp.user.id }, { performedById: emp.user.id }, { reviewedById: emp.user.id }, { postedById: emp.user.id }] } }),
      db.dayClosing.count({ where: { OR: [{ closedById: emp.user.id }, { reopenedById: emp.user.id }] } }),
      db.followUpTask.count({ where: { OR: [{ assignedToId: emp.user.id }, { doctorId: emp.user.id }, { completedById: emp.user.id }] } }),
      db.communicationLog.count({ where: { sentById: emp.user.id } }),
      db.auditLog.count({ where: { userId: emp.user.id } }),
      db.attachment.count({ where: { uploadedById: emp.user.id } }),
      db.customer.count({ where: { createdById: emp.user.id } }),
      db.patientUpdateLog.count({ where: { userId: emp.user.id } }),
      db.customerMedicalProfile.count({ where: { updatedByDoctorId: emp.user.id } }),
      db.customerMedicalEvent.count({ where: { createdById: emp.user.id } }),
      db.service.count({ where: { createdById: emp.user.id } }),
      db.product.count({ where: { createdById: emp.user.id } }),
      db.supplier.count({ where: { createdById: emp.user.id } }),
      db.expenseCategory.count({ where: { createdById: emp.user.id } }),
      db.setting.count({ where: { updatedById: emp.user.id } }),
      db.campaign.count({ where: { OR: [{ createdById: emp.user.id }, { cancelledById: emp.user.id }] } }),
    );
  }
  const refs = await Promise.all(checks);
  if (refs.some((n) => n > 0)) throw new AppError(PROTECTED_REF_MESSAGE, "CONFLICT");

  await db.employee.delete({ where: { id: employeeId } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "employee.delete", entityType: "employee", entityId: employeeId, after: { name: emp.name, jobTitle: emp.jobTitle } });
}

export async function updateEmployee(actor: AuthUser, employeeId: string, input: Partial<{ name: string; englishName: string | null; jobTitle: string; active: boolean; notes: string | null }>) {
  const emp = await db.employee.findUnique({ where: { id: employeeId } });
  assertFound(emp, "الموظف غير موجود");
  const before = { name: emp.name, active: emp.active };
  await db.employee.update({
    where: { id: employeeId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.englishName !== undefined ? { englishName: input.englishName?.trim() || null } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle.trim() } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "employee.update", entityType: "employee", entityId: employeeId, before, after: input });
}

/** Create/finalize a payroll period with salary snapshots. */
export async function ensurePayrollPeriod(actor: AuthUser, month: number, year: number): Promise<string> {
  const existing = await db.payrollPeriod.findUnique({ where: { month_year: { month, year } } });
  if (existing) return existing.id;
  const employees = await db.employee.findMany({ where: { active: true } });
  const period = await db.payrollPeriod.create({
    data: {
      month,
      year,
      items: {
        create: employees.map((e) => {
          const snapshot = e.monthlySalary;
          return {
            employeeId: e.id,
            monthlySalarySnapshot: snapshot,
            adjustments: money(0),
            finalSalary: snapshot,
          };
        }),
      },
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "payroll.period_created", entityType: "payroll_period", entityId: period.id, after: { month, year, employees: employees.length } });
  return period.id;
}

export async function listPayrollPeriods(actor: AuthUser) {
  return db.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { items: { include: { employee: true } }, _count: { select: { items: true } } },
  });
}

/** Payroll cost for a given period (sum of snapshots) — historical stable. */
export async function payrollCostForPeriod(actor: AuthUser, month: number, year: number): Promise<number> {
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL);
  const period = await db.payrollPeriod.findUnique({
    where: { month_year: { month, year } },
    include: { items: true },
  });
  if (!period) return 0;
  return period.items.reduce((a, i) => a.plus(i.finalSalary), money(0)).toNumber();
}

/** Daily payroll cost allocation per settings mode, for a date. */
export async function dailyPayrollCost(actor: AuthUser, year: number, month: number): Promise<{ totalMonthly: number; dailyShare: number; mode: string }> {
  const settings = await getSettings();
  const period = await db.payrollPeriod.findUnique({
    where: { month_year: { month, year } },
    include: { items: true },
  });
  if (!period) return { totalMonthly: 0, dailyShare: 0, mode: settings.salaryAllocationMode };
  const total = period.items.reduce((a, i) => a.plus(i.finalSalary), money(0)).toNumber();
  const daily = dailySalaryShare(total, year, month, settings.salaryAllocationMode);
  return { totalMonthly: total, dailyShare: daily, mode: settings.salaryAllocationMode };
}
