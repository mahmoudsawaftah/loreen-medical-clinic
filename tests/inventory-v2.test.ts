import { beforeEach, describe, expect, it } from "vitest";
import { moneyZero } from "@/lib/money";
import { seedWorld, type SeedWorld } from "./setup";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("inventory v2: friendly stock receipt (addStock)", () => {
  it("adds stock with conversion (purchase unit → usage unit) and records a receipt movement", async () => {
    const { addStock, getProduct } = await import("@/server/services/inventory-service");
    const { db } = await import("./setup");

    const product = await db.product.create({
      data: { name: "بوتوكس", category: "حقن", stockUnit: "وحدة", purchaseUnit: "سرنجة", conversionToStock: 100, divisible: true, active: true },
    });
    await addStock(w.accountant, product.id, { qty: 2, unitCost: 350 });

    const p = await getProduct(w.owner, product.id);
    const onHand = p.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero());
    expect(onHand.toNumber()).toBe(200); // 2 سرنجات × 100 وحدة
    expect(p.batches[0].unitCost?.toNumber()).toBe(3.5); // 350 / 100 لكل وحدة
    expect(p.movements[0].type).toBe("PURCHASE_RECEIPT");
    expect(p.movements[0].qty.toNumber()).toBe(200);
    expect(p.movements[0].referenceType).toBe("INVENTORY_RECEIPT");
    expect(p.movements[0].user.name).toBe("المحاسبة");
    expect(p.avgCost?.toNumber()).toBe(3.5);
  });

  it("adds stock without conversion directly in usage units", async () => {
    const { addStock, getProduct } = await import("@/server/services/inventory-service");
    const { db } = await import("./setup");
    const product = await db.product.create({ data: { name: "كريم", category: "مستحضرات", stockUnit: "أنبوب", active: true } });
    await addStock(w.accountant, product.id, { qty: 5, unitCost: 8, batchNo: "B-1" });
    const p = await getProduct(w.owner, product.id);
    expect(p.batches[0].qtyOnHand.toNumber()).toBe(5);
    expect(p.batches[0].unitCost?.toNumber()).toBe(8);
    expect(p.batches[0].batchNo).toBe("B-1");
  });

  it("rejects zero/invalid quantities", async () => {
    const { addStock } = await import("@/server/services/inventory-service");
    await expect(addStock(w.accountant, w.productId, { qty: 0, unitCost: 1 })).rejects.toThrow("أكبر من صفر");
  });

  it("addStock is denied to roles without inventory.add_stock", async () => {
    const { addStock } = await import("@/server/services/inventory-service");
    const { GRANULAR_PERMISSIONS, hasPermission } = await import("@/lib/permissions");
    expect(hasPermission(w.secretary, GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK)).toBe(false);
    await expect(addStock(w.secretary, w.productId, { qty: 5, unitCost: 1 })).rejects.toThrow("لا تملك صلاحية");
  });
});

describe("inventory v2: product editing and deletion", () => {
  it("editing product metadata never changes stock", async () => {
    const { updateProduct, getProduct } = await import("@/server/services/inventory-service");
    await updateProduct(w.accountant, w.productId, { name: "مصل هيالورونيك (محدث)", minStock: 5, notes: "لا يمس الرصيد" });
    const p = await getProduct(w.owner, w.productId);
    expect(p.name).toBe("مصل هيالورونيك (محدث)");
    expect(p.minStock.toNumber()).toBe(5);
    expect(p.batches[0].qtyOnHand.toNumber()).toBe(10);
  });

  it("deleting a product with no history succeeds", async () => {
    const { deleteProduct } = await import("@/server/services/inventory-service");
    const { db } = await import("./setup");
    const product = await db.product.create({ data: { name: "منتج بلا تاريخ", category: "مستحضرات", stockUnit: "قطعة", active: true } });
    await deleteProduct(w.owner, product.id);
    const gone = await db.product.findUnique({ where: { id: product.id } });
    expect(gone).toBeNull();
  });

  it("deleting a product with history is blocked with the Arabic protection message", async () => {
    const { deleteProduct } = await import("@/server/services/inventory-service");
    await expect(deleteProduct(w.owner, w.productId)).rejects.toThrow("لا يمكن حذف هذا المنتج لوجود حركات سابقة مرتبطة به. يمكنك تعطيله للحفاظ على السجل.");
  });

  it("a disabled product stays in the ledger and remains usable in history", async () => {
    const { setProductActive, addStock } = await import("@/server/services/inventory-service");
    await addStock(w.accountant, w.productId, { qty: 3, unitCost: 9 });
    await setProductActive(w.owner, w.productId, false);
    const { db } = await import("./setup");
    const p = await db.product.findUnique({ where: { id: w.productId } });
    expect(p?.active).toBe(false);
    expect(await db.stockMovement.count({ where: { productId: w.productId } })).toBeGreaterThan(0);
  });

  it("delete requires inventory.delete permission (owner-only by default)", async () => {
    const { GRANULAR_PERMISSIONS, hasPermission } = await import("@/lib/permissions");
    expect(hasPermission(w.accountant, GRANULAR_PERMISSIONS.INVENTORY_DELETE)).toBe(false);
    expect(hasPermission(w.owner, GRANULAR_PERMISSIONS.INVENTORY_DELETE)).toBe(true);
  });
});

describe("inventory v2: divisible products enforce whole units in treatment usage", () => {
  it("rejects fractional consumption of a non-divisible product", async () => {
    const { db } = await import("./setup");
    const { createVisit, checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");

    const product = await db.product.create({ data: { name: "قفازات", category: "مستلزمات", stockUnit: "حبة", divisible: false, usagePrecision: 0, active: true } });
    const batch = await db.productBatch.create({ data: { productId: product.id, batchNo: "G-1", qtyOnHand: 10, receivedQty: 10, unitCost: 1, active: true } });
    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);

    await expect(
      saveTreatmentDraft(w.doctor, visitId, {
        services: [{ serviceId: w.serviceId, description: "جلسة", linePrice: 40 }],
        materials: [{ productId: product.id, batchId: batch.id, qtyUsed: 1.5 }],
        basePrice: 40,
        notes: null,
      }),
    ).rejects.toThrow("لا يقبل الكسور");

    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "جلسة", linePrice: 40 }],
      materials: [{ productId: product.id, batchId: batch.id, qtyUsed: 2 }],
      basePrice: 40,
      notes: null,
    });
    expect(batch.id).toBeTruthy();
  });
});

describe("end-of-day settlement RBAC (owner ↔ main doctor ↔ secretary)", () => {
  it("secretary can prepare; Dr. Sameh (طبيب رئيسي) is blocked from review/approve by default; owner approves", async () => {
    const { hasPermission, GRANULAR_PERMISSIONS } = await import("@/lib/permissions");
    expect(hasPermission(w.secretary, GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(true);
    expect(hasPermission(w.mainDoctor, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hasPermission(w.mainDoctor, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
    expect(hasPermission(w.mainDoctor, GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(false);
    expect(hasPermission(w.owner, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(true);
  });

  it("Dr. Sameh can review/approve once the owner explicitly grants it", async () => {
    const { hasPermission, GRANULAR_PERMISSIONS } = await import("@/lib/permissions");
    const granted = { ...w.mainDoctor, permissionOverrides: [...w.mainDoctor.permissionOverrides.filter((e) => !e.startsWith("DENY:closing.")), "GRANT:closing.review", "GRANT:closing.approve"] };
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(true);
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(true);
  });

  it("an accountant keeps read/review visibility but not approval", async () => {
    const { hasPermission, GRANULAR_PERMISSIONS } = await import("@/lib/permissions");
    expect(hasPermission(w.accountant, GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(true);
    expect(hasPermission(w.accountant, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(true);
    expect(hasPermission(w.accountant, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
  });

  it("the settlement is visible in navigation only to roles with a closing permission", async () => {
    const { navItemsFor } = await import("@/lib/navigation");
    const { effectivePermissions } = await import("@/lib/permissions");
    const forOwner = navItemsFor({ role: w.owner.role, permissions: effectivePermissions(w.owner) });
    expect(forOwner.some((n) => n.href === "/closing")).toBe(true);
    const forMainDoctor = navItemsFor({ role: w.mainDoctor.role, permissions: effectivePermissions(w.mainDoctor) });
    expect(forMainDoctor.some((n) => n.href === "/closing")).toBe(false);
  });
});