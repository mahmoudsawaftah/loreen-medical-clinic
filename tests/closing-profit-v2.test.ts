import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, db, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";
import { getSettings, setSetting } from "@/lib/settings";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
  await setSetting("partialPaymentEnabled", true);
  await setSetting("splitPaymentEnabled", true);
});

describe("day closing V2: totals, owner-only reopen with reason", () => {
  async function paidCash(amount = 100) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const visitId = await createVisitToCompletion(w, amount);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount });
    return invoiceId;
  }

  it("closeDay persists the full totals (expected/actual/variance)", async () => {
    const { closeDay, approveDay, getClosingForDate } = await import("@/server/services/closing-service");
    await paidCash(100);
    await closeDay(w.secretary, new Date(), { actualCash: 95, actualCliq: 0, actualVisa: 0, varianceExplanation: "نقص نقدي" });
    await approveDay(w.owner, new Date());
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("APPROVED");
    expect(closing?.totalExpected.toNumber()).toBe(100);
    expect(closing?.totalActual.toNumber()).toBe(95);
    expect(closing?.totalVariance.toNumber()).toBe(-5);
    expect(closing?.expectedCash.toNumber()).toBe(100);
    expect(closing?.varianceCash.toNumber()).toBe(-5);
  });

  it("rejects reopening by non-owner roles with a clear error", async () => {
    const { closeDay, approveDay, reopenDay } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 0, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    let code: string | undefined;
    try {
      await reopenDay(w.accountant, new Date(), "تصحيح");
    } catch (err) {
      code = (err as AppError).code;
    }
    expect(code).toBe("FORBIDDEN");
  });

  it("owner reopens with a mandatory reason and audits the action", async () => {
    const { closeDay, approveDay, reopenDay } = await import("@/server/services/closing-service");
    const settings = await getSettings();
    const { normalizeToDay } = await import("@/lib/time");
    const day = normalizeToDay(new Date(), settings.timezone);
    await closeDay(w.secretary, new Date(), { actualCash: 0, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    await expect(reopenDay(w.owner, new Date(), "")).rejects.toThrow(AppError);
    await reopenDay(w.owner, new Date(), "تعديل بعد الإغلاق");
    const closing = await db.dayClosing.findUnique({ where: { closeDate: day } });
    expect(closing?.status).toBe("REOPENED");
    expect(closing?.reopenedById).toBe(w.owner.id);
    const audit = await db.auditLog.findFirst({ where: { action: "closing.reopen" } });
    expect(audit?.entityType).toBe("day_closing");
    expect(audit?.afterJson).toContain("تعديل بعد الإغلاق");
  });

  it("closing history includes totals per day", async () => {
    const { closeDay, listClosings } = await import("@/server/services/closing-service");
    await paidCash(120);
    await closeDay(w.secretary, new Date(), { actualCash: 120, actualCliq: 0, actualVisa: 0 });
    const list = await listClosings(w.owner, {});
    expect(list.items[0].totalExpected.toNumber()).toBe(120);
    expect(list.items[0].totalActual.toNumber()).toBe(120);
    expect(list.items[0].totalVariance.toNumber()).toBe(0);
  });
});

describe("profit split & control center (V2)", () => {
  async function visitWithInvoice(basePrice = 100) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, basePrice);
    await sendToCashier(w.doctor, visitId);
    return visitId;
  }

  it("splits profit into service and material components that reconcile with revenue", async () => {
    const { profitBreakdown } = await import("@/server/services/reporting-service");
    await visitWithInvoice(100);
    const start = new Date(Date.now() - 60_000);
    const end = new Date(Date.now() + 60_000);
    const pb = await profitBreakdown(w.owner, { start, end });
    expect(pb.materialIncome).toBe(20); // 2 units × unitCost 10
    expect(pb.serviceIncome).toBe(80); // remainder of the 100 invoice
    expect(pb.serviceIncome + pb.materialIncome).toBe(100); // === revenue
    expect(pb.materialCost).toBe(20); // consumption only
    expect(pb.materialProfit).toBe(0);
    expect(pb.grossProfit).toBe(80); // revenue − materialCost
    expect(pb.materialMarginPct).toBe(0);
  });

  it("discounts scale the split proportionally and keep the gross formula", async () => {
    const { profitBreakdown } = await import("@/server/services/reporting-service");
    const { applyDiscount } = await import("@/server/services/billing-service");
    const visitId = await visitWithInvoice(100);
    const invoice = await db.invoice.findUnique({ where: { visitId } });
    await applyDiscount(w.owner, invoice!.id, { percent: 10, reason: "ولاء" });
    const pb = await profitBreakdown(w.owner, { start: new Date(Date.now() - 60_000), end: new Date(Date.now() + 60_000) });
    expect(pb.serviceIncome + pb.materialIncome).toBe(90); // scaled to final amount
    expect(pb.materialProfit).toBe(18 - 20); // 90-20 remainder scaled material income
    expect(pb.grossProfit).toBe(70); // 90 − 20
  });

  it("control center aggregates today's collections, month revenue and inventory alerts", async () => {
    const { controlCenter } = await import("@/server/services/reporting-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, 100);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 40 });
    const cc = await controlCenter(w.owner);
    expect(cc.today.collected).toBe(40);
    expect(cc.today.collectedByMethod.CASH).toBe(40);
    expect(cc.month.revenue).toBe(100);
    expect(cc.month.collected).toBe(40);
    expect(cc.month.outstanding).toBe(60);
    expect(cc.inventory.lowStock).toBe(0); // 8 on hand vs min 2
    expect(cc.counts.visitsInMonth).toBe(1);
    expect(cc.today.visits).toBe(1);
  });

  it("control center reflects closing status and last-closing variance", async () => {
    const { controlCenter } = await import("@/server/services/reporting-service");
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { closeDay, approveDay } = await import("@/server/services/closing-service");
    const visitId = await createVisitToCompletion(w, 100);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    await closeDay(w.secretary, new Date(), { actualCash: 100, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    const cc = await controlCenter(w.owner);
    expect(cc.today.closingStatus).toBe("APPROVED");
    expect(cc.lastClosing?.status).toBe("APPROVED");
    expect(cc.lastClosing?.totalVariance).toBe(0);
  });

  it("control center net profit formula: gross − expenses − payroll", async () => {
    const { controlCenter } = await import("@/server/services/reporting-service");
    const { createExpenseCategory, createExpense, approveExpense } = await import("@/server/services/expense-service");
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, 100);
    await sendToCashier(w.doctor, visitId);
    const cat = await createExpenseCategory(w.owner, { name: "كهرباء", kind: "UTILITIES" });
    const exp = await createExpense(w.accountant, { categoryId: cat.id, amount: 10, date: new Date().toISOString(), description: "فاتورة كهرباء", method: PaymentMethod.CASH });
    await approveExpense(w.owner, exp.id, "APPROVED");
    const cc = await controlCenter(w.owner);
    expect(cc.month.expenses).toBe(10);
    expect(cc.month.grossProfit).toBe(80); // 100 revenue − 20 material cost
    expect(cc.month.netProfit).toBe(cc.month.grossProfit - 10 - cc.month.payrollAlloc);
  });
});