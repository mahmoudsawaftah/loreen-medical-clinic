import "server-only";
import { Prisma, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { money, moneyZero } from "@/lib/money";
import type { AuthUser } from "@/lib/auth/authorize";
import { applyStockDeductions } from "./treatment-service";
import { notifyDoctor, notifyPricingManagers, NOTIFICATION_TYPES } from "./notification-service";

/**
 * Billing & collections.
 * - Discounts are permission-gated (pricing.discount): granted to Owner and
 *   Main Doctor by default — an individual account can be granted/blocked.
 * - Secretary collects with a payment method (Cash / CliQ / Visa) but can never
 *   alter the doctor's price or create a discount.
 * - Split/partial payment only when settings enable them.
 * - Invoices/payments are never hard-deleted; void with audit trail.
 */

export interface DiscountInput {
  amount?: number | null;
  percent?: number | null;
  reason?: string | null;
}

function assertDiscountPermission(actor: AuthUser): void {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.PRICING_DISCOUNT)) {
    throw new AppError("لا تملك صلاحية منح الخصم", "FORBIDDEN");
  }
}

async function computeDiscount(original: Prisma.Decimal, input: DiscountInput, settings: { discountReasonRequired: boolean }): Promise<{ discount: Prisma.Decimal; final: Prisma.Decimal }> {
  if (settings.discountReasonRequired && !input.reason?.trim()) {
    throw new AppError("سبب الخصم مطلوب", "VALIDATION");
  }
  let discount: Prisma.Decimal;
  if (input.percent != null) {
    if (input.percent <= 0 || input.percent > 100) throw new AppError("نسبة الخصم يجب أن تكون بين 1 و 100", "VALIDATION");
    discount = original.mul(input.percent).div(100);
  } else if (input.amount != null) {
    if (input.amount <= 0) throw new AppError("قيمة الخصم يجب أن تكون أكبر من صفر", "VALIDATION");
    discount = money(input.amount);
  } else {
    throw new AppError("أدخل قيمة أو نسبة الخصم", "VALIDATION");
  }
  if (discount.gte(original)) throw new AppError("الخصم لا يمكن أن يساوي أو يتجاوز قيمة الجلسة/الفاتورة", "VALIDATION");
  return { discount, final: original.sub(discount) };
}

/** Invoice-level discount (only before any payment; carries to the treatment). */
export async function applyDiscount(actor: AuthUser, invoiceId: string, input: DiscountInput): Promise<void> {
  assertDiscountPermission(actor);

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { where: { status: "COMPLETED" } } } });
  assertFound(invoice, "الفاتورة غير موجودة");
  if (invoice.status === "VOID") throw new AppError("لا يمكن خصم فاتورة ملغاة");
  if (invoice.payments.length > 0) throw new AppError("لا يمكن تطبيق خصم بعد التحصيل");
  if (invoice.discountAmount && invoice.discountAmount.gt(0)) throw new AppError("يوجد خصم معتمد مسبقًا — لا يمكن التعديل عليه");

  const settings = await getSettings();
  const original = invoice.originalAmount;
  const { discount, final } = await computeDiscount(original, input, settings);

  const before = { originalAmount: invoice.originalAmount, discountAmount: invoice.discountAmount, finalAmount: invoice.finalAmount };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: invoiceId }, data: { discountAmount: discount, finalAmount: final } });
    await tx.treatment.updateMany({
      where: { visitId: invoice.visitId },
      data: { discountAmount: discount, finalPrice: final },
    });
    await tx.discount.upsert({
      where: { invoiceId },
      update: {
        type: input.percent != null ? "PERCENT" : "AMOUNT",
        originalAmount: original,
        discountAmount: discount,
        finalAmount: final,
        reason: input.reason?.trim() || null,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      create: {
        invoiceId,
        treatmentId: (await tx.treatment.findUnique({ where: { visitId: invoice.visitId } }))?.id ?? null,
        type: input.percent != null ? "PERCENT" : "AMOUNT",
        originalAmount: original,
        discountAmount: discount,
        finalAmount: final,
        reason: input.reason?.trim() || null,
        approvedById: actor.id,
      },
    });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "invoice.discount_applied",
    entityType: "invoice",
    entityId: invoiceId,
    before,
    after: {
      originalAmount: original.toNumber(),
      discountAmount: discount.toNumber(),
      finalAmount: final.toNumber(),
      reason: input.reason ?? null,
      approvedBy: actor.name,
    },
  });
}

/**
 * Treatment-level discount applied by an authorized doctor BEFORE the invoice
 * is created (spec: doctor prices the session, discounts it, then sends to
 * reception for payment). The amount is carried into the invoice by
 * sendToCashier.
 */
export async function applyTreatmentDiscount(actor: AuthUser, visitId: string, input: DiscountInput): Promise<void> {
  assertDiscountPermission(actor);

  const visit = await db.visit.findUnique({ where: { id: visitId }, include: { treatment: true, invoice: true } });
  assertFound(visit, "الزيارة غير موجودة");
  const treatment = visit.treatment;
  assertFound(treatment, "لا توجد جلسة مسجلة لهذه الزيارة");
  if (visit.invoice) throw new AppError("تم إنشاء الفاتورة — عدّل الخصم من صفحة الفاتورة", "CONFLICT");
  if (visit.status === "READY_FOR_PAYMENT" || visit.status === "PARTIALLY_PAID" || visit.status === "PAID" || visit.status === "CLOSED") {
    throw new AppError("لا يمكن تعديل الخصم بعد إرسال الحساب", "CONFLICT");
  }
  if (treatment.discountAmount.gt(0)) throw new AppError("يوجد خصم معتمد مسبقًا — لا يمكن التعديل عليه");

  const settings = await getSettings();
  const original = treatment.basePrice;
  const { discount, final } = await computeDiscount(original, input, settings);

  const before = { discountAmount: treatment.discountAmount, finalPrice: treatment.finalPrice };

  await db.$transaction(async (tx) => {
    await tx.treatment.update({
      where: { id: treatment.id },
      data: { discountAmount: discount, finalPrice: final },
    });
    await tx.discount.upsert({
      where: { treatmentId: treatment.id },
      update: {
        type: input.percent != null ? "PERCENT" : "AMOUNT",
        originalAmount: original,
        discountAmount: discount,
        finalAmount: final,
        reason: input.reason?.trim() || null,
        approvedById: actor.id,
        approvedAt: new Date(),
      },
      create: {
        treatmentId: treatment.id,
        type: input.percent != null ? "PERCENT" : "AMOUNT",
        originalAmount: original,
        discountAmount: discount,
        finalAmount: final,
        reason: input.reason?.trim() || null,
        approvedById: actor.id,
      },
    });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "treatment.discount_applied",
    entityType: "visit",
    entityId: visitId,
    before,
    after: {
      originalAmount: original.toNumber(),
      discountAmount: discount.toNumber(),
      finalAmount: final.toNumber(),
      reason: input.reason ?? null,
      approvedBy: actor.name,
    },
  });
}

export interface CollectPaymentInput {
  invoiceId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  notes?: string | null;
}

export interface AdjustInvoiceAmountInput {
  invoiceId: string;
  amount: number;
  reason?: string | null;
}

/** Reception may correct an invoice price directly; managers are informed, not asked to approve. */
export async function adjustInvoiceAmount(actor: AuthUser, input: AdjustInvoiceAmountInput): Promise<void> {
  if (actor.role !== "SECRETARY" || !hasPermission(actor, GRANULAR_PERMISSIONS.PAYMENTS_COLLECT)) {
    throw new AppError("تعديل السعر متاح للسكرتيرة فقط", "FORBIDDEN");
  }
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      payments: { where: { status: "COMPLETED" } },
      visit: { select: { id: true, visitNo: true, customer: { select: { fullName: true } } } },
    },
  });
  assertFound(invoice, "الفاتورة غير موجودة");
  if (invoice.status === "VOID" || invoice.status === "PAID") throw new AppError("لا يمكن تعديل فاتورة ملغاة أو مسددة بالكامل", "CONFLICT");
  if (invoice.discountAmount.gt(0)) throw new AppError("لا يمكن تعديل سعر عليه خصم معتمد", "CONFLICT");

  if (!Number.isFinite(input.amount)) throw new AppError("أدخل سعرًا صحيحًا", "VALIDATION");
  const nextAmount = money(input.amount);
  const collected = invoice.payments.reduce((total, payment) => total.plus(payment.amount), moneyZero());
  if (nextAmount.lte(0)) throw new AppError("السعر يجب أن يكون أكبر من صفر", "VALIDATION");
  if (nextAmount.lt(collected)) throw new AppError(`السعر الجديد أقل من المبلغ المحصل (المحصل: ${collected.toNumber()})`, "VALIDATION");
  if (nextAmount.eq(invoice.finalAmount)) return;

  const before = { originalAmount: invoice.originalAmount.toNumber(), finalAmount: invoice.finalAmount.toNumber(), collected: collected.toNumber() };
  const nextInvoiceStatus = collected.gte(nextAmount) ? "PAID" : collected.gt(0) ? "PARTIALLY_PAID" : "UNPAID";
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { originalAmount: nextAmount, finalAmount: nextAmount },
    });
    await tx.treatment.updateMany({
      where: { visitId: invoice.visitId },
      data: { basePrice: nextAmount, finalPrice: nextAmount },
    });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: nextInvoiceStatus } });
    await tx.visit.update({ where: { id: invoice.visitId }, data: { status: nextInvoiceStatus === "PAID" ? "PAID" : nextInvoiceStatus === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "READY_FOR_PAYMENT" } });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "invoice.price_changed_by_reception",
    entityType: "invoice",
    entityId: invoice.id,
    before,
    after: { originalAmount: nextAmount.toNumber(), finalAmount: nextAmount.toNumber(), reason: input.reason?.trim() || null },
  });
  await notifyPricingManagers({
    title: "تم تعديل سعر فاتورة",
    body: `${invoice.visit.customer.fullName} (#${invoice.visit.visitNo}) — من ${before.finalAmount} د.أ إلى ${nextAmount.toNumber()} د.أ — بواسطة ${actor.name}${input.reason?.trim() ? ` — ${input.reason.trim()}` : ""}`,
    type: NOTIFICATION_TYPES.PRICE_CHANGED,
    entityType: "invoice",
    entityId: invoice.id,
    actorId: actor.id,
  });
}

/** Secretary collects a payment. Enforces payment-method rules and discount immutability. */
export async function collectPayment(actor: AuthUser, input: CollectPaymentInput): Promise<{ paymentId: string }> {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.PAYMENTS_COLLECT)) throw new AppError("لا تملك صلاحية التحصيل", "FORBIDDEN");
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    include: { payments: { where: { status: "COMPLETED" } } },
  });
  assertFound(invoice, "الفاتورة غير موجودة");
  if (invoice.status === "VOID") throw new AppError("لا يمكن تحصيل فاتورة ملغاة");
  if (invoice.status === "PAID") throw new AppError("الفاتورة مسددة بالكامل");

  const settings = await getSettings();
  const collected = invoice.payments.reduce((a, p) => a.plus(p.amount), moneyZero());
  const remaining = invoice.finalAmount.sub(collected);
  if (money(input.amount).lte(0)) throw new AppError("المبلغ يجب أن يكون أكبر من صفر", "VALIDATION");
  if (money(input.amount).gt(remaining)) {
    throw new AppError(`المبلغ أكبر من المتبقي (المتبقي: ${remaining.toNumber()})`, "VALIDATION");
  }
  const isPartial = money(input.amount).lt(remaining);
  if (isPartial && !settings.partialPaymentEnabled) {
    throw new AppError("الدفع الجزئي غير مفعّل في الإعدادات", "VALIDATION");
  }
  if (invoice.payments.length > 0 && !settings.splitPaymentEnabled) {
    throw new AppError("الدفع المختلط (أكثر من طريقة) غير مفعّل في الإعدادات", "VALIDATION");
  }

  const payment = await db.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        method: input.method,
        amount: money(input.amount),
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        collectedById: actor.id,
        status: "COMPLETED",
      },
    });

    // inventory deduction at payment point (when configured)
    if (settings.inventoryDeductAt === "PAYMENT") {
      const treatment = await tx.treatment.findUnique({ where: { visitId: invoice.visitId }, include: { items: true } });
      if (treatment) await applyStockDeductions(tx, treatment, actor);
    }

    const newCollected = collected.add(created.amount);
    const newStatus = newCollected.gte(invoice.finalAmount) ? "PAID" : "PARTIALLY_PAID";
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: newStatus } });
    await tx.visit.update({
      where: { id: invoice.visitId },
      data: { status: newStatus === "PAID" ? "PAID" : "PARTIALLY_PAID", paidAt: newStatus === "PAID" ? new Date() : null },
    });
    return created;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "payment.collect",
    entityType: "payment",
    entityId: payment.id,
    after: {
      invoiceId: invoice.id,
      method: input.method,
      amount: input.amount,
      reference: input.reference ?? null,
      visitId: invoice.visitId,
    },
  });

  return { paymentId: payment.id };
}

/** Void a completed payment (controlled correction — audit trail, no hard delete). */
export async function voidPayment(actor: AuthUser, paymentId: string, reason: string): Promise<void> {
  const settings = await getSettings();
  if (!settings.refundEnabled && actor.role !== "OWNER") {
    throw new AppError("إلغاء المدفوعات غير مفعّل (قابل للتفعيل في الإعدادات)", "VALIDATION");
  }
  if (!reason.trim()) throw new AppError("سبب الإلغاء مطلوب", "VALIDATION");
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { invoice: true } });
  assertFound(payment, "الدفعة غير موجودة");
  if (payment.status === "VOID") throw new AppError("الدفعة ملغاة مسبقًا");
  const before = { status: payment.status, amount: payment.amount.toNumber(), method: payment.method };

  await db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: paymentId }, data: { status: "VOID", voidedAt: new Date(), voidedById: actor.id, voidReason: reason.trim() } });
    const invoice = payment.invoice;
    const live = await tx.payment.findMany({ where: { invoiceId: invoice.id, status: "COMPLETED" } });
    const collected = live.reduce((a, p) => a.plus(p.amount), moneyZero());
    const status = collected.gte(invoice.finalAmount) ? "PAID" : collected.gt(0) ? "PARTIALLY_PAID" : "UNPAID";
    await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
    await tx.visit.update({ where: { id: invoice.visitId }, data: { status: status === "PAID" ? "PAID" : status === "PARTIALLY_PAID" ? "PARTIALLY_PAID" : "READY_FOR_PAYMENT", paidAt: null } });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "payment.void",
    entityType: "payment",
    entityId: paymentId,
    before,
    after: { status: "VOID", reason: reason.trim() },
  });
}

/** Void an unpaid invoice (controlled — never hard delete). */
export async function voidInvoice(actor: AuthUser, invoiceId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new AppError("سبب الإلغاء مطلوب", "VALIDATION");
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { where: { status: "COMPLETED" } } } });
  assertFound(invoice, "الفاتورة غير موجودة");
  if (invoice.status === "VOID") throw new AppError("الفاتورة ملغاة مسبقًا");
  if (invoice.payments.length > 0) {
    const settings = await getSettings();
    if (!settings.refundEnabled && actor.role !== "OWNER") {
      throw new AppError("الفاتورة تحتوي مدفوعات — إلغاؤها يتطلب تفعيل خيار الإلغاء/الاسترداد في الإعدادات", "VALIDATION");
    }
  }

  const before = { status: invoice.status, finalAmount: invoice.finalAmount.toNumber(), discountAmount: invoice.discountAmount.toNumber() };
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), voidedById: actor.id, voidReason: reason.trim() } });
    await tx.visit.update({ where: { id: invoice.visitId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: `إلغاء فاتورة: ${reason.trim()}` } });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "invoice.void",
    entityType: "invoice",
    entityId: invoiceId,
    before,
    after: { status: "VOID", reason: reason.trim() },
  });
}

export async function searchInvoices(
  actor: AuthUser,
  opts: { query?: string; method?: PaymentMethod | null; dateFrom?: string | null; dateTo?: string | null; page?: number; pageSize?: number; status?: string | null },
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Prisma.InvoiceWhereInput = {};
  if (opts.query?.trim()) {
    const q = opts.query.trim();
    where.OR = [
      { invoiceNo: !Number.isNaN(Number(q)) ? Number(q) : -1 },
      { customer: { fullName: { contains: q, mode: "insensitive" } } },
      { customer: { phone: { contains: q.replace(/^\+?0+/, "") } } },
      { visit: { doctor: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }
  if (opts.status) where.status = opts.status as never;
  if (opts.dateFrom || opts.dateTo) {
    where.createdAt = {
      ...(opts.dateFrom ? { gte: new Date(opts.dateFrom) } : {}),
      ...(opts.dateTo ? { lte: new Date(opts.dateTo + "T23:59:59.999Z") } : {}),
    };
  }
  if (opts.method) {
    where.payments = { some: { method: opts.method, status: "COMPLETED" } };
  }

  const [total, items] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, fullName: true, phone: true, customerNo: true } },
        visit: { include: { doctor: { select: { name: true } } } },
        payments: { include: { collectedBy: { select: { name: true } } } },
        discount: { include: { approvedBy: { select: { name: true } } } },
      },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getInvoice(actor: AuthUser, invoiceId: string) {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      visit: { include: { doctor: { select: { name: true } }, treatment: { include: { items: true } } } },
      lines: true,
      payments: { include: { collectedBy: { select: { name: true } } } },
      discount: { include: { approvedBy: { select: { name: true } } } },
    },
  });
  return mustFind(invoice, "الفاتورة غير موجودة");
}

/**
 * Reopen a sent/paid visit for correction (spec: doctor forgot a service or
 * priced wrongly). Rules:
 * - Only allowed when the invoice has NO completed payments (a paid visit is
 *   corrected via void/refund flows, never silently reopened).
 * - The invoice is voided (audit trail, never hard-deleted) and the visit
 *   returns to WITH_DOCTOR so the doctor can edit and re-send.
 */
export async function reopenVisitForCorrection(actor: AuthUser, visitId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new AppError("سبب إعادة الفتح مطلوب", "VALIDATION");
  const visit = await db.visit.findUnique({ where: { id: visitId }, include: { invoice: { include: { payments: { where: { status: "COMPLETED" } } } }, doctor: { select: { id: true, name: true } } } });
  assertFound(visit, "الزيارة غير موجودة");
  if (visit.status !== "READY_FOR_PAYMENT" && visit.status !== "PARTIALLY_PAID") {
    throw new AppError("لا يمكن إعادة فتح الزيارة من حالتها الحالية", "CONFLICT");
  }
  if (!visit.invoice) throw new AppError("لا توجد فاتورة لهذه الزيارة", "CONFLICT");
  if (visit.invoice.payments.length > 0) {
    throw new AppError("الزيارة تحتوي دفعات مكتملة — الإلغاء/الاسترداد هو الطريق الصحيح للتصحيح", "VALIDATION");
  }

  const before = { status: visit.status, invoiceStatus: visit.invoice.status };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: visit.invoice!.id },
      data: { status: "VOID", voidedAt: new Date(), voidedById: actor.id, voidReason: `إعادة فتح للتصحيح: ${reason.trim()}` },
    });
    await tx.visit.update({
      where: { id: visitId },
      data: {
        status: "WITH_DOCTOR",
        reopenedAt: new Date(),
        reopenedById: actor.id,
        reopenReason: reason.trim(),
        sentToCashierAt: null,
        paidAt: null,
      },
    });
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "visit.reopen_for_correction",
    entityType: "visit",
    entityId: visitId,
    before,
    after: { status: "WITH_DOCTOR", invoiceVoided: true, reason: reason.trim() },
  });

  if (visit.doctorId && visit.doctorId !== actor.id) {
    await notifyDoctor(
      {
        title: "أعيد فتح جلسة للتصحيح",
        body: reason.trim(),
        type: "OTHER",
        entityType: "visit",
        entityId: visitId,
      },
      visit.doctorId,
      actor.id,
    );
  }
}
