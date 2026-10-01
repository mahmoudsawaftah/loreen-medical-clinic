import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, db, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("discounts: owner-only, math, immutability", () => {
  async function paidInvoice(amount = 100) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, amount);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    return { visitId, invoiceId };
  }

  it("rejects discounts from non-owner roles", async () => {
    const { applyDiscount } = await import("@/server/services/billing-service");
    const { invoiceId } = await paidInvoice(100);
    await expect(applyDiscount(w.secretary, invoiceId, { percent: 10 })).rejects.toThrow(AppError);
    await expect(applyDiscount(w.accountant, invoiceId, { percent: 10 })).rejects.toThrow(AppError);
  });

  it("applies percent discount and updates invoice + treatment final amounts", async () => {
    const { applyDiscount, getInvoice } = await import("@/server/services/billing-service");
    const { invoiceId } = await paidInvoice(100);
    await applyDiscount(w.owner, invoiceId, { percent: 10, reason: "عميلة قديمة" });
    const inv = await getInvoice(w.owner, invoiceId);
    expect(inv.discountAmount.toNumber()).toBe(10);
    expect(inv.finalAmount.toNumber()).toBe(90);
    const discount = await db.discount.findUnique({ where: { invoiceId } });
    expect(discount?.approvedById).toBe(w.owner.id);
  });

  it("rejects a second discount and discounts >= invoice value", async () => {
    const { applyDiscount } = await import("@/server/services/billing-service");
    const { invoiceId } = await paidInvoice(100);
    await applyDiscount(w.owner, invoiceId, { amount: 20 });
    await expect(applyDiscount(w.owner, invoiceId, { amount: 10 })).rejects.toThrow(AppError);
    const { invoiceId: other } = await paidInvoice(50);
    await expect(applyDiscount(w.owner, other, { amount: 50 })).rejects.toThrow(AppError);
  });

  it("lets the secretary change an unpaid price and notifies the clinic managers", async () => {
    const { adjustInvoiceAmount, getInvoice } = await import("@/server/services/billing-service");
    const { invoiceId } = await paidInvoice(100);
    const samehManager = await db.user.create({ data: { username: "dr.sameh-manager", name: "د. سامح", role: "OWNER", passwordHash: "x" } });

    await adjustInvoiceAmount(w.secretary, { invoiceId, amount: 125, reason: "تعديل السعر عند الاستقبال" });

    const invoice = await getInvoice(w.owner, invoiceId);
    expect(invoice.originalAmount.toNumber()).toBe(125);
    expect(invoice.finalAmount.toNumber()).toBe(125);
    const notifications = await db.notification.findMany({ where: { type: "PRICE_CHANGED", entityId: invoiceId } });
    expect(new Set(notifications.map((item) => item.recipientId))).toEqual(new Set([w.owner.id, samehManager.id]));
    expect(notifications.every((item) => item.body?.includes("125"))).toBe(true);
    await expect(adjustInvoiceAmount(w.doctor, { invoiceId, amount: 130 })).rejects.toThrow(AppError);
  });

  it("forbids discount after payment was collected", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment, applyDiscount } = await import("@/server/services/billing-service");
    const visitId = await createVisitToCompletion(w, 80);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 80 });
    await expect(applyDiscount(w.owner, invoiceId, { percent: 5 })).rejects.toThrow(AppError);
  });
});

describe("payments: partial/split gating, voiding", () => {
  async function unpaidInvoice(basePrice = 120) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, basePrice);
    return sendToCashier(w.doctor, visitId);
  }

  it("rejects partial payment when disabled by settings (TBD default off)", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { invoiceId } = await unpaidInvoice(120);
    await expect(collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 50 })).rejects.toThrow(AppError);
  });

  it("rejects overpayment", async () => {
    const { collectPayment } = await import("@/server/services/billing-service");
    const { invoiceId } = await unpaidInvoice(100);
    await expect(collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 200 })).rejects.toThrow(AppError);
  });

  it("owner voids a payment and the invoice falls back to UNPAID", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment, voidPayment, getInvoice } = await import("@/server/services/billing-service");
    const visitId = await createVisitToCompletion(w, 100);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    const { paymentId } = await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    await voidPayment(w.owner, paymentId, "خطأ إدخال");
    const inv = await getInvoice(w.owner, invoiceId);
    expect(inv.status).toBe("UNPAID");
    expect(inv.payments[0].status).toBe("VOID");
  });

  it("voids an invoice and nulls out the payment-side numbers through audit", async () => {
    const { voidInvoice } = await import("@/server/services/billing-service");
    const { invoiceId } = await unpaidInvoice(100);
    await voidInvoice(w.owner, invoiceId, "إلغاء الحجز");
    const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe("VOID");
    expect(inv?.voidReason).toBe("إلغاء الحجز");
  });
});
