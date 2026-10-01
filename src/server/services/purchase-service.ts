import "server-only";
import { Prisma, PurchaseRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { money, moneyZero } from "@/lib/money";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Purchasing:
 * - Secretary: operational purchase requests (cleaning, supplies) -> owner review.
 * - Owner: medical purchase requests (Botox/filler/meds). Owner-created requests
 *   are auto-approved per settings.ownerPurchaseAutoApproved (TBD default: true).
 * - Receiving stock from a purchase creates positive StockMovements (received
 *   qty, not requested qty) and links the supplier invoice evidence.
 */

export interface CreateRequestInput {
  type: "OPERATIONAL" | "MEDICAL";
  description?: string | null;
  expectedAmount?: number | null;
  notes?: string | null;
  items: { productId?: string | null; description: string; qty: number; unit?: string | null; estimatedCost?: number | null }[];
}

export async function createPurchaseRequest(actor: AuthUser, input: CreateRequestInput): Promise<{ id: string }> {
  if (input.items.length === 0) throw new AppError("يجب إضافة بند واحد على الأقل", "VALIDATION");
  for (const it of input.items) {
    if (!it.description.trim()) throw new AppError("وصف البند مطلوب", "VALIDATION");
    if (it.qty <= 0) throw new AppError("الكمية يجب أن تكون أكبر من صفر", "VALIDATION");
  }

  const settings = await getSettings();
  const autoApprove = input.type === "MEDICAL" && actor.role === "OWNER" && settings.ownerPurchaseAutoApproved;
  const status: PurchaseRequestStatus = autoApprove ? "APPROVED" : "PENDING";

  const request = await db.purchaseRequest.create({
    data: {
      type: input.type,
      status,
      description: input.description || null,
      expectedAmount: input.expectedAmount ? money(input.expectedAmount) : null,
      notes: input.notes || null,
      requesterId: actor.id,
      ...(autoApprove ? { approvedById: actor.id, approvedAt: new Date() } : {}),
      items: {
        create: input.items.map((it) => ({
          productId: it.productId || null,
          description: it.description.trim(),
          qty: money(it.qty),
          unit: it.unit || null,
          estimatedCost: it.estimatedCost ? money(it.estimatedCost) : null,
        })),
      },
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "purchase_request.create",
    entityType: "purchase_request",
    entityId: request.id,
    after: { type: input.type, status, autoApproved: autoApprove, expectedAmount: input.expectedAmount ?? null },
  });
  return { id: request.id };
}

export async function approvePurchaseRequest(actor: AuthUser, requestId: string, action: "APPROVED" | "REJECTED" | "NEEDS_CHANGES", reason?: string | null) {
  const request = await db.purchaseRequest.findUnique({ where: { id: requestId } });
  assertFound(request, "الطلب غير موجود");
  if (request.status === "RECEIVED" || request.status === "CANCELLED") throw new AppError("لا يمكن تعديل طلب في هذه الحالة");
  const before = { status: request.status };
  await db.purchaseRequest.update({
    where: { id: requestId },
    data: {
      status: action,
      approvedById: action === "APPROVED" ? actor.id : null,
      approvedAt: action === "APPROVED" ? new Date() : null,
      rejectedReason: action === "REJECTED" || action === "NEEDS_CHANGES" ? reason || null : null,
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: `purchase_request.${action.toLowerCase()}`, entityType: "purchase_request", entityId: requestId, before, after: { status: action, reason: reason ?? null } });
}

export async function listPurchaseRequests(actor: AuthUser, opts: { status?: string | null; type?: string | null; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.PurchaseRequestWhereInput = {};
  if (opts.status) where.status = opts.status as never;
  if (opts.type) where.type = opts.type as never;
  const [total, items] = await Promise.all([
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        requester: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: { include: { product: { select: { name: true, stockUnit: true } } } },
        purchases: { select: { id: true, purchaseNo: true, totalAmount: true, status: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export interface PurchaseItemInput {
  productId?: string | null;
  description: string;
  isExpenseOnly: boolean;
  qtyReceived: number;
  unit?: string | null;
  unitCost: number;
  batchNo?: string | null;
  expiryDate?: string | null;
}

export interface CreatePurchaseInput {
  requestId?: string | null;
  supplierId?: string | null;
  invoiceNo: string;
  totalAmount: number;
  method?: "CASH" | "CLIQ" | "VISA" | null;
  date?: string | null;
  notes?: string | null;
  items: PurchaseItemInput[];
}

/** Create a purchase; inventory items increase stock (received qty, not requested). */
export async function createPurchase(actor: AuthUser, input: CreatePurchaseInput): Promise<{ id: string }> {
  if (!input.invoiceNo.trim()) throw new AppError("رقم فاتورة المورد مطلوب", "VALIDATION");
  if (input.items.length === 0) throw new AppError("يجب إضافة بند واحد على الأقل", "VALIDATION");
  const totalCheck = input.items.reduce((a, it) => a.plus(money(it.qtyReceived).mul(money(it.unitCost))), moneyZero());
  if (money(input.totalAmount).lte(0)) throw new AppError("القيمة الإجمالية يجب أن تكون أكبر من صفر", "VALIDATION");
  if (!money(input.totalAmount).equals(totalCheck)) {
    throw new AppError(`القيمة الإجمالية (${input.totalAmount}) لا تطابق مجموع البنود (${totalCheck.toNumber()})`, "VALIDATION");
  }

  const purchase = await db.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        requestId: input.requestId || null,
        supplierId: input.supplierId || null,
        invoiceNo: input.invoiceNo.trim(),
        totalAmount: money(input.totalAmount),
        method: input.method ?? null,
        date: input.date ? new Date(input.date) : new Date(),
        notes: input.notes || null,
        createdById: actor.id,
        status: "COMPLETED",
      },
    });

    for (const it of input.items) {
      let batchId: string | null = null;
      if (!it.isExpenseOnly && it.productId) {
        const product = await tx.product.findUnique({ where: { id: it.productId } });
        assertFound(product, "المنتج غير موجود");
        if (it.qtyReceived <= 0) throw new AppError("كمية الاستلام يجب أن تكون أكبر من صفر", "VALIDATION");
        const expiry = it.expiryDate ? new Date(it.expiryDate) : null;
        const batch = await tx.productBatch.create({
          data: {
            productId: it.productId,
            batchNo: it.batchNo?.trim() || `B-${Date.now().toString(36).toUpperCase()}`,
            expiryDate: expiry,
            qtyOnHand: money(it.qtyReceived),
            unitCost: money(it.unitCost),
            receivedQty: money(it.qtyReceived),
          },
        });
        batchId = batch.id;
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            batchId: batch.id,
            type: "PURCHASE_RECEIPT",
            qty: money(it.qtyReceived),
            unit: it.unit ?? product.stockUnit,
            balanceAfter: money(it.qtyReceived),
            referenceType: "PURCHASE",
            referenceId: created.id,
            userId: actor.id,
            reason: `استلام مشتريات ${created.purchaseNo} (فاتورة ${input.invoiceNo.trim()})`,
          },
        });
      }
      await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          productId: it.isExpenseOnly ? null : (it.productId ?? null),
          description: it.description.trim(),
          isExpenseOnly: it.isExpenseOnly,
          qtyReceived: money(it.qtyReceived),
          unit: it.unit || null,
          unitCost: money(it.unitCost),
          batchNo: it.batchNo?.trim() || null,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : null,
          createdBatchId: batchId,
        },
      });
    }

    if (input.requestId) {
      await tx.purchaseRequest.update({ where: { id: input.requestId }, data: { status: "RECEIVED" } });
    }
    return created;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "purchase.create",
    entityType: "purchase",
    entityId: purchase.id,
    after: { purchaseNo: purchase.purchaseNo, totalAmount: input.totalAmount, items: input.items.length, requestId: input.requestId ?? null },
  });
  return { id: purchase.id };
}

export async function listPurchases(actor: AuthUser, opts: { query?: string; dateFrom?: string | null; dateTo?: string | null; page?: number; pageSize?: number }) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.PurchaseWhereInput = {};
  if (opts.query?.trim()) {
    const q = opts.query.trim();
    where.OR = [
      { purchaseNo: !Number.isNaN(Number(q)) ? Number(q) : -1 },
      { invoiceNo: { contains: q, mode: "insensitive" } },
      { supplier: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (opts.dateFrom || opts.dateTo) {
    where.date = {
      ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
      ...(opts.dateTo ? { lte: new Date(opts.dateTo + "T23:59:59.999Z") } : {}),
    };
  }
  const [total, items] = await Promise.all([
    db.purchase.count({ where }),
    db.purchase.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplier: { select: { name: true } }, request: { select: { requestNo: true, type: true } }, createdBy: { select: { name: true } }, items: true },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getPurchase(actor: AuthUser, purchaseId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: true,
      request: { include: { requester: { select: { name: true } } } },
      createdBy: { select: { name: true } },
      items: { include: { product: { select: { name: true, stockUnit: true } } } },
    },
  });
  return mustFind(purchase, "المشتريات غير موجودة");
}

export async function voidPurchase(actor: AuthUser, purchaseId: string, reason: string) {
  if (!reason.trim()) throw new AppError("سبب الإلغاء مطلوب", "VALIDATION");
  const purchase = await db.purchase.findUnique({ where: { id: purchaseId }, include: { items: true } });
  assertFound(purchase, "المشتريات غير موجودة");
  if (purchase.status === "VOID") throw new AppError("ملغاة مسبقًا");
  const before = { status: purchase.status };

  await db.$transaction(async (tx) => {
    // reverse all stock movements of this purchase
    const movements = await tx.stockMovement.findMany({ where: { referenceType: "PURCHASE", referenceId: purchaseId, type: "PURCHASE_RECEIPT" } });
    for (const mv of movements) {
      if (mv.batchId) {
        const batch = await tx.productBatch.findUnique({ where: { id: mv.batchId } });
        if (batch) {
          const newBalance = batch.qtyOnHand.sub(mv.qty);
          await tx.productBatch.update({ where: { id: batch.id }, data: { qtyOnHand: newBalance } });
        }
      }
      await tx.stockMovement.create({
        data: {
          productId: mv.productId,
          batchId: mv.batchId,
          type: "REVERSAL",
          qty: mv.qty.negated(),
          unit: mv.unit,
          balanceAfter: 0,
          referenceType: "PURCHASE_VOID",
          referenceId: purchaseId,
          userId: actor.id,
          reason: `عكس استلام عند إلغاء المشتريات ${purchase.purchaseNo}: ${reason.trim()}`,
          sourceMovementId: mv.id,
        },
      });
    }
    await tx.purchase.update({ where: { id: purchaseId }, data: { status: "VOID", voidedAt: new Date(), voidedById: actor.id, voidReason: reason.trim() } });
    if (purchase.requestId) {
      await tx.purchaseRequest.update({ where: { id: purchase.requestId }, data: { status: "APPROVED" } });
    }
  });

  await writeAudit({ userId: actor.id, userRole: actor.role, action: "purchase.void", entityType: "purchase", entityId: purchaseId, before, after: { status: "VOID", reason: reason.trim() } });
}
