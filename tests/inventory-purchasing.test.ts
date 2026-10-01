import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, createVisitToCompletion, db, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";
import { money } from "@/lib/money";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("inventory: deduction at cashier-send (default TREATMENT_COMPLETED), idempotent, insufficient-stock guard", () => {
  it("deducts the batch and records TREATMENT_USAGE movements exactly once", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { PaymentMethod } = await import("@prisma/client");

    const visitId = await createVisitToCompletion(w);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);

    const batchAfterSend = await db.productBatch.findUnique({ where: { id: w.batchId } });
    expect(batchAfterSend?.qtyOnHand.toNumber()).toBe(8);

    const treatment = await db.treatment.findFirst({ where: { visitId } });
    const movements = await db.stockMovement.findMany({ where: { referenceType: "TREATMENT", referenceId: treatment?.id ?? "", type: "TREATMENT_USAGE" } });
    expect(movements).toHaveLength(1);
    expect(movements[0].qty.toNumber()).toBe(-2);
    expect(movements[0].balanceAfter.toNumber()).toBe(8);

    // collect payment must NOT deduct again (deduct point is send, not payment)
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    const movementsAfterPayment = await db.stockMovement.count({ where: { referenceType: "TREATMENT", referenceId: treatment?.id ?? "", type: "TREATMENT_USAGE" } });
    expect(movementsAfterPayment).toBe(1);
    const batchAfterPayment = await db.productBatch.findUnique({ where: { id: w.batchId } });
    expect(batchAfterPayment?.qtyOnHand.toNumber()).toBe(8);
  });

  it("throws and rolls back the whole send when stock is insufficient", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, 150, [{ productId: w.productId, batchId: w.batchId, qtyUsed: 99 }]);

    await expect(sendToCashier(w.doctor, visitId)).rejects.toThrow(AppError);

    const batch = await db.productBatch.findUnique({ where: { id: w.batchId } });
    expect(batch?.qtyOnHand.toNumber()).toBe(10); // unchanged
    const invoice = await db.invoice.findUnique({ where: { visitId } });
    expect(invoice).toBeNull(); // rolled back
  });

  it("consumes from FIFO batches when no batch is selected", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const second = await db.productBatch.create({
      data: { productId: w.productId, batchNo: "TEST-2", expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000), qtyOnHand: 5, receivedQty: 5, unitCost: 12, active: true },
    });
    // FIFO order is expiryDate ASC then createdAt ASC: TEST-1 (+90d) drains first,
    // then TEST-2 (+200d) covers the remaining unit.
    const visitId = await createVisitToCompletion(w, 200, [{ productId: w.productId, batchId: null, qtyUsed: 11 }]);
    await sendToCashier(w.doctor, visitId);

    const b1 = await db.productBatch.findUnique({ where: { id: w.batchId } });
    const b2 = await db.productBatch.findUnique({ where: { id: second.id } });
    expect(b1?.qtyOnHand.toNumber()).toBe(0);
    expect(b2?.qtyOnHand.toNumber()).toBe(4);
  });
});

describe("purchasing: request → approval → receipt creates batches and stock", () => {
  it("secretary operational request stays PENDING; owner approval approves it", async () => {
    const { createPurchaseRequest, approvePurchaseRequest } = await import("@/server/services/purchase-service");
    const { id } = await createPurchaseRequest(w.secretary, {
      type: "OPERATIONAL",
      description: "مستلزمات تنظيف",
      items: [{ description: "معقم سطوح", qty: 2, unit: "زجاجة", estimatedCost: 5 }],
    });
    const pending = await db.purchaseRequest.findUnique({ where: { id } });
    expect(pending?.status).toBe("PENDING");
    expect(pending?.approvedById).toBeNull();
    await approvePurchaseRequest(w.owner, id, "APPROVED", "موافق");
    const approved = await db.purchaseRequest.findUnique({ where: { id } });
    expect(approved?.status).toBe("APPROVED");
    expect(approved?.approvedById).toBe(w.owner.id);
    expect(approved?.approvedAt).toBeTruthy();
  });

  it("owner medical purchase request is auto-approved (default setting)", async () => {
    const { createPurchaseRequest } = await import("@/server/services/purchase-service");
    const { id } = await createPurchaseRequest(w.owner, {
      type: "MEDICAL",
      items: [{ productId: w.productId, description: "تعبئة مصل", qty: 3, unit: "مل" }],
    });
    const req = await db.purchaseRequest.findUnique({ where: { id } });
    expect(req?.status).toBe("APPROVED");
    expect(req?.approvedById).toBe(w.owner.id);
  });

  it("receives stock: creates batch, positive movement, product on-hand grows", async () => {
    const { createPurchase } = await import("@/server/services/purchase-service");
    const before = await db.productBatch.aggregate({ where: { productId: w.productId }, _sum: { qtyOnHand: true } });
    const { id: purchaseId } = await createPurchase(w.owner, {
      requestId: null,
      supplierId: null,
      invoiceNo: "SUP-001",
      totalAmount: 48,
      date: new Date().toISOString().slice(0, 10),
      method: "CASH",
      notes: null,
      items: [
        {
          productId: w.productId,
          description: "مصل هيالورونيك",
          isExpenseOnly: false,
          qtyReceived: 4,
          unit: "مل",
          unitCost: 12,
          batchNo: "NEW-1",
          expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        },
      ],
    });
    const purchase = await db.purchase.findUnique({ where: { id: purchaseId }, include: { items: { include: { batch: true } } } });
    expect(purchase?.totalAmount.toNumber()).toBe(48);
    expect(purchase?.status).toBe("COMPLETED");
    const item = purchase?.items[0];
    expect(item?.createdBatchId).toBeTruthy();
    expect(item?.batch?.qtyOnHand.toNumber()).toBe(4);

    const after = await db.productBatch.aggregate({ where: { productId: w.productId }, _sum: { qtyOnHand: true } });
    expect(after._sum.qtyOnHand?.toNumber()).toBe((before._sum.qtyOnHand ?? money(0)).toNumber() + 4);

    const movement = await db.stockMovement.findFirst({ where: { referenceType: "PURCHASE", referenceId: purchaseId, type: "PURCHASE_RECEIPT" } });
    expect(movement).toBeTruthy();
    expect(movement?.qty.toNumber()).toBe(4);
  });
});