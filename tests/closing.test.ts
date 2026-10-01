import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("end-of-day settlement: submit → review → approve", () => {
  async function makePaidInvoice(amount = 120) {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const visitId = await createVisitToCompletion(w, amount);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount });
    return invoiceId;
  }

  it("submits with zero variance, then owner approves — day approved with audit trail", async () => {
    await makePaidInvoice(120);
    await makePaidInvoice(120);

    const { closeDay, getClosingForDate, approveDay } = await import("@/server/services/closing-service");
    const today = new Date();
    await closeDay(w.secretary, today, { actualCash: 240, actualCliq: 0, actualVisa: 0 });

    const submitted = await getClosingForDate(w.secretary, today);
    expect(submitted.closing?.status).toBe("SUBMITTED");
    expect(submitted.closing?.submittedById).toBe(w.secretary.id);
    expect(submitted.closing?.expectedCash.toNumber()).toBe(240);
    expect(submitted.closing?.varianceCash.toNumber()).toBe(0);

    await approveDay(w.owner, today);
    const approved = await getClosingForDate(w.owner, today);
    expect(approved.closing?.status).toBe("APPROVED");
    expect(approved.closing?.approvedById).toBe(w.owner.id);
    expect(approved.closing?.approvedAt).toBeTruthy();
  });

  it("requires an explanation when a variance exists", async () => {
    await makePaidInvoice(120);
    const { closeDay } = await import("@/server/services/closing-service");
    const today = new Date();
    await expect(closeDay(w.secretary, today, { actualCash: 118, actualCliq: 0, actualVisa: 0 })).rejects.toThrow("توضيح سبب الفرق");

    await closeDay(w.secretary, today, { actualCash: 118, actualCliq: 0, actualVisa: 0, varianceExplanation: "نقص نقدي عند العد" });
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { closing } = await getClosingForDate(w.secretary, today);
    expect(closing?.status).toBe("SUBMITTED");
    expect(closing?.varianceCash.toNumber()).toBe(-2);
    expect(closing?.varianceExplanation).toBe("نقص نقدي عند العد");
  });

  it("forbids submitting the same day twice while it awaits review", async () => {
    await makePaidInvoice(120);
    const { closeDay } = await import("@/server/services/closing-service");
    const today = new Date();
    await closeDay(w.secretary, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 });
    await expect(closeDay(w.owner, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 })).rejects.toThrow("لا يمكن تقديم تسليم نهاية اليوم");
  });

  it("reviewer returns the settlement for correction; secretary resubmits; owner approves", async () => {
    await makePaidInvoice(120);
    const { closeDay, returnDayForReview, getClosingForDate, approveDay } = await import("@/server/services/closing-service");
    const today = new Date();
    await closeDay(w.secretary, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 });

    await expect(returnDayForReview(w.owner, today, "")).rejects.toThrow("سبب الإعادة للمراجعة مطلوب");
    await returnDayForReview(w.owner, today, "أعد العد وأكد رقم الكاش");
    const returned = await getClosingForDate(w.owner, today);
    expect(returned.closing?.status).toBe("REVIEW_REQUIRED");
    expect(returned.closing?.reviewNote).toBe("أعد العد وأكد رقم الكاش");
    expect(returned.closing?.reviewedById).toBe(w.owner.id);

    await closeDay(w.secretary, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 });
    const resubmitted = await getClosingForDate(w.secretary, today);
    expect(resubmitted.closing?.status).toBe("SUBMITTED");

    await approveDay(w.owner, today);
    const approved = await getClosingForDate(w.owner, today);
    expect(approved.closing?.status).toBe("APPROVED");
  });

  it("cannot approve a day that was never submitted", async () => {
    const { approveDay } = await import("@/server/services/closing-service");
    await expect(approveDay(w.owner, new Date())).rejects.toThrow("لا يوجد تسليم نهاية يوم لهذا التاريخ");
  });

  it("owner reopens an approved day; non-owners cannot reopen; day can be submitted again", async () => {
    await makePaidInvoice(120);
    const { closeDay, approveDay, reopenDay, getClosingForDate } = await import("@/server/services/closing-service");
    const today = new Date();
    await closeDay(w.owner, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, today);

    await expect(reopenDay(w.accountant, today, "محاولة غير مصرح بها")).rejects.toThrow("صلاحية حصرية للدكتور الرئيسي");
    await reopenDay(w.owner, today, "مراجعة الحسابات");
    const reopened = await getClosingForDate(w.owner, today);
    expect(reopened.closing?.status).toBe("REOPENED");
    expect(reopened.closing?.reopenedById).toBe(w.owner.id);
    expect(reopened.closing?.notes).toContain("مراجعة الحسابات");

    await closeDay(w.secretary, today, { actualCash: 120, actualCliq: 0, actualVisa: 0 });
    const closedAgain = await getClosingForDate(w.owner, today);
    expect(closedAgain.closing?.status).toBe("SUBMITTED");
  });
});

describe("closing history listing", () => {
  it("lists the settled day with its actors for the accountant", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { closeDay, approveDay, listClosings } = await import("@/server/services/closing-service");
    const visitId = await createVisitToCompletion(w, 50);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 50 });
    const today = new Date();
    await closeDay(w.secretary, today, { actualCash: 50, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, today);

    const list = await listClosings(w.accountant, {});
    expect(list.total).toBe(1);
    expect(list.items[0].status).toBe("APPROVED");
    expect(list.items[0].submittedById).toBe(w.secretary.id);
    expect(list.items[0].approvedById).toBe(w.owner.id);
  });
});