import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { money, moneyZero } from "@/lib/money";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Physical inventory counts (V2).
 *
 * Lifecycle: DRAFT -> IN_PROGRESS -> SUBMITTED -> REVIEWED -> POSTED
 * - Expected quantities are snapshotted into lines at creation time.
 * - Posting NEVER silently rewrites stock: every difference produces an
 *   explicit PHYSICAL_COUNT_ADJUSTMENT StockMovement that references the
 *   count (referenceCountId) — the stock ledger stays immutable & traceable.
 * - Review/posting are owner-only; drafting & counting are owner/accountant.
 */

export interface CreateInventoryCountInput {
  countDate: Date;
  notes?: string | null;
  category?: string | null;
}

/** Expected totals snapshot per line (product-level when no batches exist). */
async function snapshotLines(tx: Prisma.TransactionClient, opts: { category?: string | null }) {
  const products = await tx.product.findMany({
    where: { active: true, ...(opts.category ? { category: opts.category } : {}) },
    orderBy: { name: "asc" },
    include: { batches: { where: { active: true }, orderBy: { expiryDate: "asc" } } },
  });
  const lines: {
    productId: string;
    batchId: string | null;
    expectedQty: Prisma.Decimal;
    countedQty: Prisma.Decimal;
    unit: string;
    estimatedCostImpact: Prisma.Decimal;
    product: { avgCost: Prisma.Decimal | null };
    batch: { unitCost: Prisma.Decimal | null } | null;
  }[] = [];
  for (const p of products) {
    if (p.batches.length > 0) {
      for (const b of p.batches) {
        lines.push({
          productId: p.id,
          batchId: b.id,
          expectedQty: b.qtyOnHand,
          countedQty: moneyZero(),
          unit: p.stockUnit,
          estimatedCostImpact: moneyZero(),
          product: { avgCost: p.avgCost },
          batch: { unitCost: b.unitCost },
        });
      }
    } else {
      lines.push({
        productId: p.id,
        batchId: null,
        expectedQty: moneyZero(),
        countedQty: moneyZero(),
        unit: p.stockUnit,
        estimatedCostImpact: moneyZero(),
        product: { avgCost: p.avgCost },
        batch: null,
      });
    }
  }
  return lines;
}

export async function createInventoryCount(actor: AuthUser, input: CreateInventoryCountInput) {
  const count = await db.$transaction(async (tx) => {
    const lines = await snapshotLines(tx, { category: input.category ?? null });
    const created = await tx.inventoryCount.create({
      data: {
        countDate: input.countDate,
        notes: input.notes ?? null,
        createdById: actor.id,
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            batchId: l.batchId,
            expectedQty: l.expectedQty,
            countedQty: l.countedQty,
            difference: moneyZero(),
            unit: l.unit,
            estimatedCostImpact: moneyZero(),
          })),
        },
      },
      include: { lines: true },
    });
    return created;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "inventory_count.create",
    entityType: "inventory_count",
    entityId: count.id,
    after: { countNo: count.countNo, countDate: count.countDate.toISOString(), lines: count.lines.length },
  });
  return count;
}

export async function getInventoryCount(actor: AuthUser, countId: string) {
  const count = await db.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      createdBy: { select: { name: true } },
      performedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      postedBy: { select: { name: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        include: { product: { select: { name: true, category: true, stockUnit: true, avgCost: true } }, batch: { select: { batchNo: true, expiryDate: true, unitCost: true } } },
      },
    },
  });
  return mustFind(count, "الجرد غير موجود");
}

export async function listInventoryCounts(actor: AuthUser, opts: { status?: string | null; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.InventoryCountWhereInput = {};
  if (opts.status) where.status = opts.status as never;
  const [total, items] = await Promise.all([
    db.inventoryCount.count({ where }),
    db.inventoryCount.findMany({
      where,
      orderBy: { countDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: { select: { name: true } },
        postedBy: { select: { name: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

function assertStatus(count: { status: string }, expected: string[], action: string) {
  if (!expected.includes(count.status)) {
    throw new AppError(`لا يمكن ${action} — حالة الجرد الحالية: ${count.status}`, "CONFLICT");
  }
}

export async function startInventoryCount(actor: AuthUser, countId: string) {
  const count = await db.inventoryCount.findUnique({ where: { id: countId } });
  assertFound(count, "الجرد غير موجود");
  assertStatus(count, ["DRAFT"], "بدء الجرد");
  const updated = await db.inventoryCount.update({
    where: { id: countId },
    data: { status: "IN_PROGRESS", performedById: actor.id },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "inventory_count.start", entityType: "inventory_count", entityId: count.id, before: { status: count.status }, after: { status: "IN_PROGRESS" } });
  return updated;
}

export async function updateCountedQty(actor: AuthUser, countId: string, lineId: string, countedQty: number) {
  if (countedQty < 0) throw new AppError("الكمية المعدودة لا يمكن أن تكون سالبة", "VALIDATION");
  const count = await db.inventoryCount.findUnique({ where: { id: countId } });
  assertFound(count, "الجرد غير موجود");
  assertStatus(count, ["IN_PROGRESS"], "تعديل الكميات");
  const line = await db.inventoryCountLine.findUnique({
    where: { id: lineId },
    include: { product: { select: { avgCost: true } }, batch: { select: { unitCost: true } } },
  });
  assertFound(line, "سطر الجرد غير موجود");
  if (line.countId !== countId) throw new AppError("سطر الجرد لا يتبع هذا الجرد", "VALIDATION");

  const counted = money(countedQty);
  const difference = counted.sub(line.expectedQty);
  const unitCost = line.batch?.unitCost ?? line.product.avgCost ?? moneyZero();
  const impact = difference.mul(unitCost);

  const updated = await db.inventoryCountLine.update({
    where: { id: lineId },
    data: { countedQty: counted, difference, estimatedCostImpact: impact },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "inventory_count.counted", entityType: "inventory_count_line", entityId: lineId, after: { countId, expectedQty: line.expectedQty.toNumber(), countedQty, difference: difference.toNumber() } });
  return updated;
}

export async function submitInventoryCount(actor: AuthUser, countId: string) {
  const count = await db.inventoryCount.findUnique({ where: { id: countId }, include: { lines: true } });
  assertFound(count, "الجرد غير موجود");
  assertStatus(count, ["IN_PROGRESS"], "تقديم الجرد");
  const updated = await db.inventoryCount.update({ where: { id: countId }, data: { status: "SUBMITTED" } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "inventory_count.submit", entityType: "inventory_count", entityId: count.id, before: { status: count.status }, after: { status: "SUBMITTED", lines: count.lines.length } });
  return updated;
}

export async function reviewInventoryCount(actor: AuthUser, countId: string) {
  const count = await db.inventoryCount.findUnique({ where: { id: countId } });
  assertFound(count, "الجرد غير موجود");
  assertStatus(count, ["SUBMITTED"], "مراجعة الجرد");
  const updated = await db.inventoryCount.update({
    where: { id: countId },
    data: { status: "REVIEWED", reviewedById: actor.id },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "inventory_count.review", entityType: "inventory_count", entityId: count.id, before: { status: count.status }, after: { status: "REVIEWED" } });
  return updated;
}

export async function postInventoryCount(actor: AuthUser, countId: string) {
  const count = await db.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      lines: { include: { product: { select: { stockUnit: true } } } },
    },
  });
  assertFound(count, "الجرد غير موجود");
  assertStatus(count, ["REVIEWED"], "ترحيل الجرد");

  const posted = await db.$transaction(async (tx) => {
    const differences = count.lines.filter((l) => !l.difference.eq(0));
    for (const line of differences) {
      if (line.batchId) {
        const batch = await tx.productBatch.findUnique({ where: { id: line.batchId } });
        assertFound(batch, "الدفعة غير موجودة");
        const newBalance = batch.qtyOnHand.add(line.difference);
        if (newBalance.lt(0)) throw new AppError(`الرصيد لا يمكن أن يصبح سالبًا بعد الجرد — المنتج: ${line.product.stockUnit}`, "VALIDATION");
        await tx.productBatch.update({ where: { id: batch.id }, data: { qtyOnHand: newBalance } });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            batchId: batch.id,
            type: "PHYSICAL_COUNT_ADJUSTMENT",
            qty: line.difference,
            unit: line.product.stockUnit,
            balanceAfter: newBalance,
            referenceType: "INVENTORY_COUNT",
            referenceId: count.id,
            referenceCountId: count.id,
            userId: actor.id,
            reason: `تسوية الجرد الفيزيائي #${count.countNo}`,
          },
        });
      } else {
        const batches = await tx.productBatch.findMany({ where: { productId: line.productId, active: true }, orderBy: { createdAt: "asc" } });
        if (batches.length === 0 || batches.length === 1) {
          const target = batches[0];
          if (target) {
            const newBalance = target.qtyOnHand.add(line.difference);
            if (newBalance.lt(0)) throw new AppError("الرصيد لا يمكن أن يصبح سالبًا بعد الجرد", "VALIDATION");
            await tx.productBatch.update({ where: { id: target.id }, data: { qtyOnHand: newBalance } });
            await tx.stockMovement.create({
              data: {
                productId: line.productId,
                batchId: target.id,
                type: "PHYSICAL_COUNT_ADJUSTMENT",
                qty: line.difference,
                unit: line.product.stockUnit,
                balanceAfter: newBalance,
                referenceType: "INVENTORY_COUNT",
                referenceId: count.id,
                referenceCountId: count.id,
                userId: actor.id,
                reason: `تسوية الجرد الفيزيائي #${count.countNo}`,
              },
            });
          } else {
            await tx.stockMovement.create({
              data: {
                productId: line.productId,
                type: "PHYSICAL_COUNT_ADJUSTMENT",
                qty: line.difference,
                unit: line.product.stockUnit,
                balanceAfter: line.countedQty,
                referenceType: "INVENTORY_COUNT",
                referenceId: count.id,
                referenceCountId: count.id,
                userId: actor.id,
                reason: `تسوية الجرد الفيزيائي #${count.countNo}`,
              },
            });
          }
        } else {
          throw new AppError("يوجد أكثر من دفعة نشطة للمنتج — يجب إعادة الجرد على مستوى الدفعات", "VALIDATION");
        }
      }
    }
    const updated = await tx.inventoryCount.update({
      where: { id: count.id },
      data: { status: "POSTED", postedById: actor.id, postedAt: new Date() },
    });
    return updated;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "inventory_count.post",
    entityType: "inventory_count",
    entityId: count.id,
    before: { status: "REVIEWED" },
    after: { status: "POSTED", postedAt: new Date().toISOString(), movements: count.lines.filter((l) => !l.difference.eq(0)).length },
  });
  return posted;
}