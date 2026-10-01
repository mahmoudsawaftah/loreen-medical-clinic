import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/money";
import { assertPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Expenses: category, amount, date, description, method, evidence attachment.
 * Expense entry/approval follows settings (TBD default: owner approval required;
 * accountants may create entries that stay PENDING until owner approves).
 */

export async function createExpenseCategory(actor: AuthUser, input: { name: string; kind: string }) {
  if (!input.name.trim()) throw new AppError("اسم التصنيف مطلوب", "VALIDATION");
  const c = await db.expenseCategory.create({ data: { name: input.name.trim(), kind: input.kind, createdById: actor.id } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "expense_category.create", entityType: "expense_category", entityId: c.id, after: { name: c.name, kind: c.kind } });
  return c;
}

export async function listExpenseCategories(actor: AuthUser) {
  return db.expenseCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function createExpense(
  actor: AuthUser,
  input: { categoryId: string; amount: number; date: string; description: string; method?: string | null; reference?: string | null; notes?: string | null },
): Promise<{ id: string }> {
  if (money(input.amount).lte(0)) throw new AppError("القيمة يجب أن تكون أكبر من صفر", "VALIDATION");
  if (!input.description.trim()) throw new AppError("وصف المصروف مطلوب", "VALIDATION");
  const category = await db.expenseCategory.findUnique({ where: { id: input.categoryId } });
  assertFound(category, "التصنيف غير موجود");

  const settings = await getSettings();
  assertPermission(actor, GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE);
  const isOwner = actor.role === "OWNER";
  const accountantCanCreate = actor.role === "ACCOUNTANT" && settings.accountantCanCreateExpenses;
  if (!isOwner && !accountantCanCreate) throw new AppError("لا تملك صلاحية إدخال مصروفات", "FORBIDDEN");

  const status = isOwner ? "APPROVED" : settings.expensesRequireApproval ? "PENDING" : "APPROVED";
  const expense = await db.expense.create({
    data: {
      categoryId: input.categoryId,
      amount: money(input.amount),
      date: new Date(input.date),
      description: input.description.trim(),
      method: input.method ? (input.method as never) : null,
      reference: input.reference || null,
      status,
      createdById: actor.id,
      ...(status === "APPROVED" ? { approvedById: actor.id, approvedAt: new Date() } : {}),
      notes: input.notes || null,
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "expense.create",
    entityType: "expense",
    entityId: expense.id,
    after: { amount: input.amount, category: category.name, date: input.date, description: input.description, status },
  });
  return { id: expense.id };
}

export async function approveExpense(actor: AuthUser, expenseId: string, action: "APPROVED" | "REJECTED", reason?: string | null) {
  const expense = await db.expense.findUnique({ where: { id: expenseId } });
  assertFound(expense, "المصروف غير موجود");
  if (expense.status === "VOID") throw new AppError("المصروف ملغى");
  const before = { status: expense.status };
  await db.expense.update({
    where: { id: expenseId },
    data: {
      status: action,
      approvedById: action === "APPROVED" ? actor.id : null,
      approvedAt: action === "APPROVED" ? new Date() : null,
      rejectedReason: action === "REJECTED" ? reason || null : null,
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: `expense.${action.toLowerCase()}`, entityType: "expense", entityId: expenseId, before, after: { status: action, reason: reason ?? null } });
}

export async function voidExpense(actor: AuthUser, expenseId: string, reason: string) {
  if (!reason.trim()) throw new AppError("سبب الإلغاء مطلوب", "VALIDATION");
  const expense = await db.expense.findUnique({ where: { id: expenseId } });
  assertFound(expense, "المصروف غير موجود");
  if (expense.status === "VOID") throw new AppError("ملغى مسبقًا");
  const before = { status: expense.status, amount: expense.amount.toNumber() };
  await db.expense.update({ where: { id: expenseId }, data: { status: "VOID", rejectedReason: reason.trim() } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "expense.void", entityType: "expense", entityId: expenseId, before, after: { status: "VOID", reason: reason.trim() } });
}

export async function listExpenses(actor: AuthUser, opts: { categoryId?: string | null; status?: string | null; dateFrom?: string | null; dateTo?: string | null; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.ExpenseWhereInput = {};
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.status) where.status = opts.status as never;
  if (opts.dateFrom || opts.dateTo) {
    where.date = {
      ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
      ...(opts.dateTo ? { lte: new Date(opts.dateTo + "T23:59:59.999Z") } : {}),
    };
  }
  const [total, items] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { category: true, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getExpense(actor: AuthUser, expenseId: string) {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: { category: true, createdBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
  });
  return mustFind(expense, "المصروف غير موجود");
}
