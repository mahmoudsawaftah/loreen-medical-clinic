import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { money, moneyZero, moneyDiv } from "@/lib/money";
import { assertPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Inventory: products, batches/lots, and a full movement ledger.
 * Every quantity change produces a StockMovement (explainability requirement).
 * Stock quantity may ONLY change through explicit movements (receipts,
 * treatment usage, physical counts, waste, expiry, returns, adjustments,
 * reversals) — never through product metadata edits.
 */

export interface CreateProductInput {
  name: string;
  englishName?: string | null;
  category: string;
  sku?: string | null;
  stockUnit: string;
  purchaseUnit?: string | null;
  conversionToStock?: number | null;
  divisible?: boolean;
  usagePrecision?: number;
  minStock?: number;
  avgCost?: number | null;
  trackExpiry?: boolean;
  trackBatch?: boolean;
  supplierId?: string | null;
  notes?: string | null;
}

export async function createProduct(actor: AuthUser, input: CreateProductInput): Promise<{ id: string }> {
  if (!input.name.trim()) throw new AppError("اسم المنتج مطلوب", "VALIDATION");
  if (!input.stockUnit.trim()) throw new AppError("وحدة القياس مطلوبة", "VALIDATION");
  const product = await db.product.create({
    data: {
      name: input.name.trim(),
      englishName: input.englishName?.trim() || null,
      category: input.category.trim(),
      sku: input.sku?.trim() || null,
      stockUnit: input.stockUnit.trim(),
      purchaseUnit: input.purchaseUnit?.trim() || null,
      conversionToStock: input.conversionToStock ? money(input.conversionToStock) : null,
      divisible: input.divisible ?? true,
      usagePrecision: input.usagePrecision ?? 3,
      minStock: money(input.minStock ?? 0),
      avgCost: input.avgCost ? money(input.avgCost) : null,
      trackExpiry: input.trackExpiry ?? false,
      trackBatch: input.trackBatch ?? false,
      supplierId: input.supplierId || null,
      notes: input.notes ?? null,
      createdById: actor.id,
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "product.create", entityType: "product", entityId: product.id, after: { name: product.name, category: product.category } });
  return { id: product.id };
}

export async function updateProduct(actor: AuthUser, productId: string, input: Partial<CreateProductInput>) {
  const existing = await db.product.findUnique({ where: { id: productId } });
  assertFound(existing, "المنتج غير موجود");
  const before = { name: existing.name, category: existing.category, minStock: existing.minStock.toNumber(), active: existing.active };
  const updated = await db.product.update({
    where: { id: productId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.englishName !== undefined ? { englishName: input.englishName?.trim() || null } : {}),
      ...(input.category !== undefined ? { category: input.category.trim() } : {}),
      ...(input.sku !== undefined ? { sku: input.sku?.trim() || null } : {}),
      ...(input.stockUnit !== undefined ? { stockUnit: input.stockUnit.trim() } : {}),
      ...(input.purchaseUnit !== undefined ? { purchaseUnit: input.purchaseUnit?.trim() || null } : {}),
      ...(input.conversionToStock !== undefined ? { conversionToStock: input.conversionToStock ? money(input.conversionToStock) : null } : {}),
      ...(input.divisible !== undefined ? { divisible: input.divisible } : {}),
      ...(input.usagePrecision !== undefined ? { usagePrecision: Math.max(0, Math.min(6, Math.floor(input.usagePrecision))) } : {}),
      ...(input.minStock !== undefined ? { minStock: money(input.minStock ?? 0) } : {}),
      ...(input.avgCost !== undefined ? { avgCost: input.avgCost ? money(input.avgCost) : null } : {}),
      ...(input.trackExpiry !== undefined ? { trackExpiry: input.trackExpiry } : {}),
      ...(input.trackBatch !== undefined ? { trackBatch: input.trackBatch } : {}),
      ...(input.supplierId !== undefined ? { supplierId: input.supplierId || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "product.update", entityType: "product", entityId: productId, before, after: { name: updated.name, category: updated.category, minStock: updated.minStock.toNumber(), active: updated.active } });
  return updated;
}

export async function setProductActive(actor: AuthUser, productId: string, active: boolean) {
  const existing = await db.product.findUnique({ where: { id: productId } });
  assertFound(existing, "المنتج غير موجود");
  const before = { active: existing.active };
  await db.product.update({ where: { id: productId }, data: { active } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "product.set_active", entityType: "product", entityId: productId, before, after: { active } });
}

export interface AddStockInput {
  /** Quantity in purchase unit when the product has a conversion, otherwise in stock (usage) unit. */
  qty: number;
  /** Cost per purchase unit when the product has a conversion, otherwise per stock unit. */
  unitCost: number;
  supplierId?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  invoiceRef?: string | null;
  notes?: string | null;
}

/**
 * Stock receipt (استلام مخزون / إضافة كمية).
 * Creates a receipt batch + a PURCHASE_RECEIPT movement; the ledger is the
 * single source of truth for on-hand quantities.
 */
export async function addStock(actor: AuthUser, productId: string, input: AddStockInput) {
  assertPermission(actor, GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK);
  if (!(input.qty > 0)) throw new AppError("الكمية يجب أن تكون أكبر من صفر", "VALIDATION");
  if (!(input.unitCost >= 0)) throw new AppError("سعر الوحدة غير صالح", "VALIDATION");
  const product = await db.product.findUnique({ where: { id: productId } });
  assertFound(product, "المنتج غير موجود");

  const conversion = product.conversionToStock ? product.conversionToStock.toNumber() : 1;
  if (!(conversion > 0)) throw new AppError("حجم العبوة غير صالح", "VALIDATION");
  const stockQty = money(input.qty * conversion);
  const unitCostPerStock = money(input.unitCost / conversion);

  const referenceId = input.invoiceRef?.trim() || `receipt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  await db.$transaction(async (tx) => {
    const batch = await tx.productBatch.create({
      data: {
        productId,
        batchNo: input.batchNo?.trim() || null,
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
        qtyOnHand: stockQty,
        receivedQty: stockQty,
        unitCost: unitCostPerStock,
        createdById: actor.id,
      },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        batchId: batch.id,
        type: "PURCHASE_RECEIPT",
        qty: stockQty,
        unit: product.stockUnit,
        balanceAfter: stockQty,
        referenceType: "INVENTORY_RECEIPT",
        referenceId,
        userId: actor.id,
        reason: input.notes?.trim() || "استلام مخزون",
      },
    });
    if (product.avgCost === null) {
      await tx.product.update({ where: { id: productId }, data: { avgCost: unitCostPerStock } });
    }
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "inventory.add_stock",
    entityType: "product",
    entityId: productId,
    after: { qty: input.qty, unitCost: input.unitCost, stockQty: stockQty.toNumber(), referenceId, supplierId: input.supplierId ?? null },
  });
}

/**
 * Hard delete — allowed only when the product has NO operational history
 * (movements, batches, purchase items, treatment items, count lines).
 * Otherwise the caller must deactivate (تعطيل) to preserve the record.
 */
export async function deleteProduct(actor: AuthUser, productId: string) {
  assertPermission(actor, GRANULAR_PERMISSIONS.INVENTORY_DELETE);
  const product = await db.product.findUnique({ where: { id: productId } });
  assertFound(product, "المنتج غير موجود");
  if (!product.active) throw new AppError("المنتج معطل — أعد تفعيله قبل الحذف", "VALIDATION");

  const [movements, batches, purchaseItems, treatmentItems, requestItems, countLines] = await Promise.all([
    db.stockMovement.count({ where: { productId } }),
    db.productBatch.count({ where: { productId } }),
    db.purchaseItem.count({ where: { productId } }),
    db.treatmentItem.count({ where: { productId } }),
    db.purchaseRequestItem.count({ where: { productId } }),
    db.inventoryCountLine.count({ where: { productId } }),
  ]);
  if (movements + batches + purchaseItems + treatmentItems + requestItems + countLines > 0) {
    throw new AppError(
      "لا يمكن حذف هذا المنتج لوجود حركات سابقة مرتبطة به. يمكنك تعطيله للحفاظ على السجل.",
      "CONFLICT",
    );
  }
  await db.product.delete({ where: { id: productId } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "product.delete", entityType: "product", entityId: productId, before: { name: product.name } });
}

export async function listProducts(actor: AuthUser, opts: { query?: string; category?: string | null; activeOnly?: boolean; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const where: Prisma.ProductWhereInput = {};
  if (opts.query?.trim()) where.name = { contains: opts.query.trim(), mode: "insensitive" };
  if (opts.category) where.category = opts.category;
  if (opts.activeOnly) where.active = true;

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        batches: { orderBy: { expiryDate: "asc" }, where: { active: true } },
        supplier: { select: { name: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: products.map((p) => {
      const onHand = p.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero());
      return { ...p, onHand, lowStock: onHand.lte(p.minStock) };
    }),
  };
}

export async function getProduct(actor: AuthUser, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      batches: { orderBy: { expiryDate: "asc" } },
      supplier: true,
      movements: { orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { name: true } }, batch: { select: { batchNo: true } } } },
    },
  });
  return mustFind(product, "المنتج غير موجود");
}

/** Physical-count history lines for a product (جرد tab). */
export async function getProductCountHistory(actor: AuthUser, productId: string) {
  const lines = await db.inventoryCountLine.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { count: { select: { status: true, countDate: true } }, batch: { select: { batchNo: true } } },
  });
  return lines;
}

/** Manual stock adjustment (permission-gated) with mandatory reason. */
export async function adjustStock(actor: AuthUser, productId: string, input: { batchId?: string | null; qty: number; reason: string; type?: "ADJUSTMENT" | "WASTE" | "EXPIRED" | "RETURN_TO_SUPPLIER" }) {
  if (!input.reason.trim()) throw new AppError("سبب التعديل مطلوب", "VALIDATION");
  if (input.qty === 0) throw new AppError("الكمية لا يمكن أن تكون صفرًا", "VALIDATION");
  const product = await db.product.findUnique({ where: { id: productId } });
  assertFound(product, "المنتج غير موجود");

  const qty = money(input.qty);
  await db.$transaction(async (tx) => {
    if (input.batchId) {
      const batch = await tx.productBatch.findUnique({ where: { id: input.batchId } });
      assertFound(batch, "الدفعة غير موجودة");
      const newBalance = batch.qtyOnHand.add(qty);
      if (newBalance.lt(0)) throw new AppError("الرصيد لا يمكن أن يصبح سالبًا", "VALIDATION");
      await tx.productBatch.update({ where: { id: batch.id }, data: { qtyOnHand: newBalance } });
      await tx.stockMovement.create({
        data: {
          productId,
          batchId: batch.id,
          type: input.type ?? "ADJUSTMENT",
          qty,
          unit: product.stockUnit,
          balanceAfter: newBalance,
          referenceType: "MANUAL",
          referenceId: `adjust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId: actor.id,
          reason: input.reason.trim(),
        },
      });
    } else {
      // whole-product adjustment: apply to batches if single batch, else create product-level movement
      const batches = await tx.productBatch.findMany({ where: { productId, active: true }, orderBy: { createdAt: "asc" } });
      if (batches.length === 0) {
        await tx.stockMovement.create({
          data: {
            productId,
            type: input.type ?? "ADJUSTMENT",
            qty,
            unit: product.stockUnit,
            balanceAfter: qty,
            referenceType: "MANUAL",
            referenceId: `adjust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: actor.id,
            reason: input.reason.trim(),
          },
        });
      } else if (batches.length === 1) {
        const b = batches[0];
        const newBalance = b.qtyOnHand.add(qty);
        if (newBalance.lt(0)) throw new AppError("الرصيد لا يمكن أن يصبح سالبًا", "VALIDATION");
        await tx.productBatch.update({ where: { id: b.id }, data: { qtyOnHand: newBalance } });
        await tx.stockMovement.create({
          data: {
            productId,
            batchId: b.id,
            type: input.type ?? "ADJUSTMENT",
            qty,
            unit: product.stockUnit,
            balanceAfter: newBalance,
            referenceType: "MANUAL",
            referenceId: `adjust-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId: actor.id,
            reason: input.reason.trim(),
          },
        });
      } else {
        throw new AppError("يوجد أكثر من دفعة — يجب تحديد الدفعة المراد تعديلها", "VALIDATION");
      }
    }
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "inventory.adjust",
    entityType: "product",
    entityId: productId,
    after: { qty: input.qty, type: input.type ?? "ADJUSTMENT", reason: input.reason.trim(), batchId: input.batchId ?? null },
  });
}

/** List stock movements with filters. */
export async function listStockMovements(actor: AuthUser, opts: { productId?: string; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 50;
  const where: Prisma.StockMovementWhereInput = {};
  if (opts.productId) where.productId = opts.productId;
  const [total, items] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { product: { select: { name: true, stockUnit: true } }, batch: { select: { batchNo: true, expiryDate: true } }, user: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Low-stock and expiring alerts for dashboards. */
export async function stockAlerts(actor: AuthUser) {
  const products = await db.product.findMany({
    where: { active: true },
    include: { batches: { where: { active: true }, orderBy: { expiryDate: "asc" } } },
  });
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const lowStock = products
    .map((p) => {
      const onHand = p.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero());
      return { product: p, onHand, low: onHand.lte(p.minStock) };
    })
    .filter((x) => x.low);

  const expiring = products.flatMap((p) =>
    p.batches
      .filter((b) => b.expiryDate && b.expiryDate <= soon && b.qtyOnHand.gt(0))
      .map((b) => ({ product: p, batch: b })),
  );
  return { lowStock, expiring };
}

export async function createSupplier(actor: AuthUser, input: { name: string; phone?: string | null; contact?: string | null; notes?: string | null }) {
  if (!input.name.trim()) throw new AppError("اسم المورد مطلوب", "VALIDATION");
  const s = await db.supplier.create({ data: { name: input.name.trim(), phone: input.phone || null, contact: input.contact || null, notes: input.notes || null, createdById: actor.id } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "supplier.create", entityType: "supplier", entityId: s.id, after: { name: s.name } });
  return s;
}

export async function listSuppliers(actor: AuthUser) {
  return db.supplier.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function listCategories(actor: AuthUser) {
  return db.product.groupBy({ by: ["category"], where: { active: true } });
}
