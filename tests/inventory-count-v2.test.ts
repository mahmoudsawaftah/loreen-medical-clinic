import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("physical inventory counts (V2): lifecycle & immutability", () => {
  it("creates a count with expected-quantity snapshot lines", async () => {
    const { createInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date(), notes: null });
    expect(count.status).toBe("DRAFT");
    expect(count.lines.length).toBeGreaterThanOrEqual(1);
    const line = count.lines.find((l) => l.productId === w.productId);
    expect(line?.expectedQty.toNumber()).toBe(10);
    expect(line?.unit).toBe("مل");
  });

  it("start moves DRAFT → IN_PROGRESS and records the performer", async () => {
    const { createInventoryCount, startInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    const started = await startInventoryCount(w.accountant, count.id);
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.performedById).toBe(w.accountant.id);
  });

  it("computes difference and estimated cost impact from counted qty", async () => {
    const { createInventoryCount, startInventoryCount, updateCountedQty } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    await startInventoryCount(w.accountant, count.id);
    const line = count.lines.find((l) => l.productId === w.productId)!;
    const updated = await updateCountedQty(w.accountant, count.id, line.id, 7);
    expect(updated.difference.toNumber()).toBe(-3);
    expect(updated.estimatedCostImpact.toNumber()).toBe(-30);
    await expect(updateCountedQty(w.accountant, count.id, line.id, -1)).rejects.toThrow(AppError);
  });

  it("posts differences as PHYSICAL_COUNT_ADJUSTMENT movements referencing the count", async () => {
    const { createInventoryCount, startInventoryCount, updateCountedQty, submitInventoryCount, reviewInventoryCount, postInventoryCount, getInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    const line = count.lines.find((l) => l.productId === w.productId)!;
    await startInventoryCount(w.accountant, count.id);
    await updateCountedQty(w.accountant, count.id, line.id, 7);
    await submitInventoryCount(w.accountant, count.id);
    await reviewInventoryCount(w.owner, count.id);
    const posted = await postInventoryCount(w.owner, count.id);
    expect(posted.status).toBe("POSTED");
    expect(posted.postedById).toBe(w.owner.id);

    const batch = await db.productBatch.findUnique({ where: { id: w.batchId } });
    expect(batch?.qtyOnHand.toNumber()).toBe(7);
    const movement = await db.stockMovement.findFirst({ where: { referenceCountId: count.id } });
    expect(movement?.type).toBe("PHYSICAL_COUNT_ADJUSTMENT");
    expect(movement?.qty.toNumber()).toBe(-3);
    expect(movement?.referenceType).toBe("INVENTORY_COUNT");
    expect(movement?.reason).toContain("جرد");

    const loaded = await getInventoryCount(w.owner, count.id);
    expect(loaded.status).toBe("POSTED");
    expect(loaded.lines[0].countedQty.toNumber()).toBe(7);
  });

  it("refuses posting from DRAFT (status conflict)", async () => {
    const { createInventoryCount, postInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    await expect(postInventoryCount(w.owner, count.id)).rejects.toThrow(AppError);
  });

  it("refuses qty edits outside IN_PROGRESS", async () => {
    const { createInventoryCount, submitInventoryCount, startInventoryCount, updateCountedQty } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    await expect(updateCountedQty(w.accountant, count.id, count.lines[0].id, 5)).rejects.toThrow(AppError);
    await startInventoryCount(w.accountant, count.id);
    await submitInventoryCount(w.accountant, count.id);
    await expect(updateCountedQty(w.accountant, count.id, count.lines[0].id, 5)).rejects.toThrow(AppError);
  });

  it("lists counts with status and count numbers", async () => {
    const { createInventoryCount, listInventoryCounts } = await import("@/server/services/inventory-count-service");
    await createInventoryCount(w.accountant, { countDate: new Date() });
    const list = await listInventoryCounts(w.owner, {});
    expect(list.total).toBe(1);
    expect(list.items[0].countNo).toBe(1);
    expect(list.items[0].status).toBe("DRAFT");
  });

  it("handles products without batches at product level", async () => {
    const product = await db.product.create({
      data: { name: "قفازات", category: "مواد", stockUnit: "حبة", minStock: 0, active: true, createdById: w.owner.id, trackBatch: false, trackExpiry: false },
    });
    const { createInventoryCount, startInventoryCount, updateCountedQty, submitInventoryCount, reviewInventoryCount, postInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    const line = count.lines.find((l) => l.productId === product.id);
    expect(line?.batchId).toBeNull();
    await startInventoryCount(w.accountant, count.id);
    await updateCountedQty(w.accountant, count.id, line!.id, 3);
    await submitInventoryCount(w.accountant, count.id);
    await reviewInventoryCount(w.owner, count.id);
    await postInventoryCount(w.owner, count.id);
    const movement = await db.stockMovement.findFirst({ where: { productId: product.id, referenceCountId: count.id } });
    expect(movement?.qty.toNumber()).toBe(3);
    expect(movement?.batchId).toBeNull();
  });

  it("refuses posting a product-level line once the product has multiple batches", async () => {
    const product = await db.product.create({
      data: { name: "حقن تجميل", category: "مستحضرات", stockUnit: "مل", minStock: 0, active: true, createdById: w.owner.id, trackBatch: true },
    });
    const { createInventoryCount, startInventoryCount, updateCountedQty, submitInventoryCount, reviewInventoryCount, postInventoryCount } = await import("@/server/services/inventory-count-service");
    const count = await createInventoryCount(w.accountant, { countDate: new Date() });
    const line = count.lines.find((l) => l.productId === product.id);
    await startInventoryCount(w.accountant, count.id);
    await updateCountedQty(w.accountant, count.id, line!.id, 1);
    await submitInventoryCount(w.accountant, count.id);
    await reviewInventoryCount(w.owner, count.id);
    await db.productBatch.createMany({
      data: [
        { productId: product.id, batchNo: "A", qtyOnHand: 2, unitCost: 5, active: true },
        { productId: product.id, batchNo: "B", qtyOnHand: 2, unitCost: 6, active: true },
      ],
    });
    await expect(postInventoryCount(w.owner, count.id)).rejects.toThrow(AppError);
  });
});