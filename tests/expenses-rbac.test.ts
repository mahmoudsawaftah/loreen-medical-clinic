import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

describe("expenses: lifecycle and role gates", () => {
  it("rejects expense creation by a secretary", async () => {
    const { createExpense } = await import("@/server/services/expense-service");
    await expect(
      createExpense(w.secretary, {
        categoryId: w.categoryId,
        amount: 50,
        date: new Date().toISOString().slice(0, 10),
        description: "استهلاك ماء",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accountant entries stay PENDING until owner approval; voiding then is rejected", async () => {
    const { createExpense, approveExpense, voidExpense, listExpenses } = await import("@/server/services/expense-service");
    const { id } = await createExpense(w.accountant, {
      categoryId: w.categoryId,
      amount: 75,
      date: new Date().toISOString().slice(0, 10),
      description: "قرطاسية",
    });

    const pending = await listExpenses(w.accountant, { status: "PENDING" });
    expect(pending.items.some((e) => e.id === id)).toBe(true);

    await approveExpense(w.owner, id, "APPROVED");
    const approved = await db.expense.findUnique({ where: { id } });
    expect(approved?.status).toBe("APPROVED");
    expect(approved?.approvedById).toBe(w.owner.id);
    expect(approved?.approvedAt).toBeTruthy();

    await voidExpense(w.owner, id, "إدخال خاطئ");
    const voided = await db.expense.findUnique({ where: { id } });
    expect(voided?.status).toBe("VOID");
    await expect(voidExpense(w.owner, id, "مرة أخرى")).rejects.toThrow("ملغى");

    const approvedList = await listExpenses(w.accountant, { status: "APPROVED" });
    expect(approvedList.items.some((e) => e.id === id)).toBe(false);
  });

  it("rejects an already-voided expense and unknown categories", async () => {
    const { createExpense, voidExpense, approveExpense } = await import("@/server/services/expense-service");
    const { id } = await createExpense(w.owner, {
      categoryId: w.categoryId,
      amount: 10,
      date: new Date().toISOString().slice(0, 10),
      description: "نثريات",
    });
    await voidExpense(w.owner, id, "خطأ");
    await expect(approveExpense(w.owner, id, "APPROVED")).rejects.toThrow("ملغى");

    await expect(
      createExpense(w.owner, {
        categoryId: "missing-category",
        amount: 10,
        date: new Date().toISOString().slice(0, 10),
        description: "تصنيف غير معروف",
      }),
    ).rejects.toThrow("التصنيف غير موجود");
  });
});

describe("RBAC: permission matrix rules", () => {
  it("owner-only permissions are denied to every other role", async () => {
    const { roleHasPermission } = await import("@/lib/permissions");
    const { PERMISSIONS } = await import("@/lib/permissions");
    for (const role of ["ACCOUNTANT", "DOCTOR", "SECRETARY"] as const) {
      expect(roleHasPermission(role, PERMISSIONS.BILLING_DISCOUNT)).toBe(false);
      expect(roleHasPermission(role, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
      expect(roleHasPermission(role, PERMISSIONS.USERS_MANAGE)).toBe(false);
    }
  });

  it("role responsibilities are granted per matrix and hard blocks hold", async () => {
    const { roleHasPermission } = await import("@/lib/permissions");
    const { PERMISSIONS } = await import("@/lib/permissions");
    expect(roleHasPermission("SECRETARY", PERMISSIONS.BILLING_COLLECT)).toBe(true);
    expect(roleHasPermission("SECRETARY", PERMISSIONS.CLOSING_MANAGE)).toBe(true);
    expect(roleHasPermission("DOCTOR", PERMISSIONS.TREATMENT_RECORD)).toBe(true);
    expect(roleHasPermission("DOCTOR", PERMISSIONS.TREATMENT_PRICE)).toBe(true);
    expect(roleHasPermission("DOCTOR", PERMISSIONS.REPORTS_FINANCIAL)).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", PERMISSIONS.PAYROLL_MANAGE)).toBe(true);
    expect(roleHasPermission("ACCOUNTANT", PERMISSIONS.BILLING_DISCOUNT)).toBe(false);
    expect(roleHasPermission("OWNER", PERMISSIONS.REPORTS_FINANCIAL)).toBe(true);
    // purchase approval is an owner decision regardless of who created the request
    expect(roleHasPermission("OWNER", PERMISSIONS.PURCHASE_APPROVE)).toBe(true);
    expect(roleHasPermission("SECRETARY", PERMISSIONS.PURCHASE_APPROVE)).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", PERMISSIONS.PURCHASE_APPROVE)).toBe(false);
  });
});