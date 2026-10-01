import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, db, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("visit flow: check-in → doctor → treatment → cashier → paid", () => {
  it("walks the full state machine and ends PAID with an audited trail", async () => {
    const { createVisit, checkInVisit, getVisit } = await import("@/server/services/visit-service");
    const { startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");

    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id });
    expect((await getVisit(w.doctor, visitId)).status).toBe("REGISTERED");

    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [{ productId: w.productId, batchId: w.batchId, qtyUsed: 2 }],
      basePrice: 100,
      notes: null,
    });

    const sent = await sendToCashier(w.doctor, visitId);
    expect(sent.invoiceId).toBeTruthy();

    const afterSend = await getVisit(w.secretary, visitId);
    expect(afterSend.status).toBe("READY_FOR_PAYMENT");
    expect(afterSend.invoice?.status).toBe("UNPAID");
    expect(afterSend.invoice?.finalAmount.toNumber()).toBe(100);

    await collectPayment(w.secretary, { invoiceId: sent.invoiceId, method: PaymentMethod.CASH, amount: 100 });

    const paid = await getVisit(w.owner, visitId);
    expect(paid.status).toBe("PAID");
    expect(paid.invoice?.status).toBe("PAID");
    expect(paid.paidAt).toBeTruthy();
    const payment = paid.invoice?.payments[0];
    expect(payment?.status).toBe("COMPLETED");
    expect(payment?.method).toBe("CASH");
    expect(payment?.amount.toNumber()).toBe(100);

    const audit = await db.auditLog.count();
    expect(audit).toBeGreaterThanOrEqual(7); // create, checkin, start, complete, draft, send, collect
  });

  it("rejects duplicate send-to-cashier", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w);
    await sendToCashier(w.doctor, visitId);
    await expect(sendToCashier(w.doctor, visitId)).rejects.toThrow(AppError);
  });

  it("sends a priced treatment directly from WITH_DOCTOR", async () => {
    const { createVisit, checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id });
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [],
      basePrice: 60,
      notes: null,
    });

    const sent = await sendToCashier(w.doctor, visitId);
    expect(sent.invoiceId).toBeTruthy();
    expect((await db.visit.findUnique({ where: { id: visitId }, select: { status: true } }))?.status).toBe("READY_FOR_PAYMENT");
  });

  it("creates a secretary reminder for an unassigned scheduled appointment", async () => {
    const { createVisit } = await import("@/server/services/visit-service");
    const scheduledAt = new Date("2030-06-20T10:00:00.000Z");
    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, scheduledAt });

    const task = await db.followUpTask.findFirst({ where: { appointmentVisitId: visitId } });
    expect(task?.assignedToId).toBeNull();
    expect(task?.type).toBe("REMINDER");
    expect(task?.dueDate.getTime()).toBe(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
  });

  it("removes the automatic secretary reminder when a doctor is assigned", async () => {
    const { createVisit, assignVisitDoctor } = await import("@/server/services/visit-service");
    const scheduledAt = new Date("2030-06-21T10:00:00.000Z");
    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, scheduledAt });

    await assignVisitDoctor(w.secretary, visitId, w.doctor.id);

    expect(await db.followUpTask.findFirst({ where: { appointmentVisitId: visitId } })).toBeNull();
  });

  it("cancels a visit from WAITING and forbids later transitions", async () => {
    const { createVisit, checkInVisit, cancelVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId });
    await checkInVisit(w.secretary, visitId);
    await cancelVisit(w.secretary, visitId, "غادرت العيادة");
    await expect(startWithDoctor(w.doctor, visitId)).rejects.toThrow(AppError);
  });
});
