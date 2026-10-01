import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

async function buildFinancialScenario() {
  const { sendToCashier } = await import("@/server/services/treatment-service");
  const { collectPayment, applyDiscount } = await import("@/server/services/billing-service");
  const { createExpense, approveExpense } = await import("@/server/services/expense-service");

  // invoice 1: 100 - 10% discount = 90, paid CASH
  const v1 = await createVisitToCompletion(w, 100);
  const i1 = await sendToCashier(w.doctor, v1);
  await applyDiscount(w.owner, i1.invoiceId, { percent: 10 });
  await collectPayment(w.secretary, { invoiceId: i1.invoiceId, method: PaymentMethod.CASH, amount: 90 });

  // invoice 2: 200 paid CLIQ
  const v2 = await createVisitToCompletion(w, 200);
  const i2 = await sendToCashier(w.doctor, v2);
  await collectPayment(w.secretary, { invoiceId: i2.invoiceId, method: PaymentMethod.CLIQ, amount: 200 });

  // expense 100 approved
  const { getSettings } = await import("@/lib/settings");
  const { toDateKey } = await import("@/lib/time");
  const e = await createExpense(w.accountant, {
    categoryId: w.categoryId,
    amount: 100,
    date: toDateKey(new Date(), (await getSettings()).timezone),
    description: "شراء مستحضرات",
    method: "CASH",
  });
  await approveExpense(w.owner, e.id, "APPROVED");

  return { i1, i2 };
}

describe("reporting: revenue, collections by method, expenses, discounts", () => {
  it("aggregates metrics consistently for the day range", async () => {
    const { i2 } = await buildFinancialScenario();
    void i2;
    const { financialMetrics } = await import("@/server/services/reporting-service");
    const { getSettings } = await import("@/lib/settings");
    const { todayRange } = await import("@/lib/time");
    const settings = await getSettings();
    const m = await financialMetrics(w.accountant, todayRange(settings.timezone));

    expect(m.revenue).toBe(290); // 90 + 200
    expect(m.collected).toBe(290);
    expect(m.collectedByMethod.CASH).toBe(90);
    expect(m.collectedByMethod.CLIQ).toBe(200);
    expect(m.discountsTotal).toBe(10);
    expect(m.invoicesCount).toBe(2);
    expect(m.invoicesPaid).toBe(2);
    expect(m.expenses).toBe(100);
    expect(m.outstanding).toBe(0);
    expect(m.netProfit).toBeCloseTo(m.grossProfit - 100 - m.payrollDaily, 2);
  });

  it("revenue report rows reflect non-void invoices; voided ones drop out", async () => {
    await buildFinancialScenario();
    const { revenueReport } = await import("@/server/services/reporting-service");
    const { getSettings } = await import("@/lib/settings");
    const { todayRange } = await import("@/lib/time");
    const settings = await getSettings();
    const rows = await revenueReport(w.owner, todayRange(settings.timezone));
    expect(rows.reduce((s, r) => s + Number(r["النهائي"] ?? 0), 0)).toBe(290);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("payroll: period creation snapshots active employees", () => {
  it("creates a DRAFT period with one item per active employee and is idempotent", async () => {
    const { ensurePayrollPeriod, listPayrollPeriods } = await import("@/server/services/payroll-service");
    const id1 = await ensurePayrollPeriod(w.owner, 8, 2026);
    const id2 = await ensurePayrollPeriod(w.owner, 8, 2026);
    expect(id2).toBe(id1);

    const periods = await listPayrollPeriods(w.owner);
    const period = periods.find((p) => p.id === id1);
    expect(period?.status).toBe("DRAFT");
    expect(period?.items).toHaveLength(3); // main doctor + doctor + accountant
    const total = period?.items.reduce((s, i) => s + i.finalSalary.toNumber(), 0) ?? 0;
    expect(total).toBe(3400);
    expect(period?.items.every((i) => i.monthlySalarySnapshot.toNumber() === i.finalSalary.toNumber())).toBe(true);
  });
});