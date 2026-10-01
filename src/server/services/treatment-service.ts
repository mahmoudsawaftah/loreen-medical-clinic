import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { money, moneyZero } from "@/lib/money";
import { dateInputToLocalMidnight } from "@/lib/time";
import type { AuthUser } from "@/lib/auth/authorize";
import { canTransition } from "./visit-service";
import { notifySecretaries } from "./notification-service";

export interface ServiceLineInput {
  serviceId?: string | null;
  description: string;
  area?: string | null;
  linePrice?: number | null;
}

export interface MaterialLineInput {
  productId: string;
  batchId?: string | null;
  qtyUsed: number;
  unit?: string | null;
}

export interface MedicationLineInput {
  medicationId?: string | null;
  name: string;
  qty?: string | null;
  dose?: string | null;
  instructions?: string | null;
}

export interface SaveTreatmentInput {
  services: ServiceLineInput[];
  materials: MaterialLineInput[];
  medications?: MedicationLineInput[];
  notes?: string | null;
  basePrice: number;
}

/**
 * Saves (or creates) the treatment draft for a visit.
 * Materials are NOT deducted here — deduction happens exactly once at the
 * configured inventory-deduction point (settings.inventoryDeductAt).
 */
export async function saveTreatmentDraft(actor: AuthUser, visitId: string, input: SaveTreatmentInput): Promise<{ treatmentId: string }> {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.TREATMENTS_CREATE)) throw new AppError("لا تملك صلاحية تسجيل الجلسات", "FORBIDDEN");
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  assertFound(visit, "الزيارة غير موجودة");
  if (visit.status !== "WITH_DOCTOR" && visit.status !== "TREATMENT_COMPLETED" && visit.status !== "REGISTERED" && visit.status !== "WAITING") {
    throw new AppError("لا يمكن تحرير الجلسة من الحالة الحالية");
  }
  if (input.services.length === 0 && input.materials.length === 0) {
    throw new AppError("يجب تسجيل خدمة أو مادة واحدة على الأقل", "VALIDATION");
  }
  if (input.basePrice <= 0) throw new AppError("يجب إدخال سعر الجلسة", "VALIDATION");

  // Validate products/batches and capture cost snapshots now
  const materialCosts = new Map<string, { productId: string; name: string; batchId: string | null; unitCost: Prisma.Decimal; unit: string; available: Prisma.Decimal }>();
  for (const m of input.materials) {
    if (m.qtyUsed <= 0) throw new AppError("الكمية المستخدمة يجب أن تكون أكبر من صفر");
    const product = await db.product.findUnique({ where: { id: m.productId } });
    assertFound(product, "المنتج غير موجود");
    if (!product.active) throw new AppError(`المنتج ${product.name} غير نشط`);
    if (!product.divisible && !Number.isInteger(m.qtyUsed)) {
      throw new AppError(`المنتج "${product.name}" لا يقبل الكسور — أدخل كمية صحيحة (${product.stockUnit})`, "VALIDATION");
    }
    let batchId: string | null = null;
    let unitCost = product.avgCost ?? moneyZero();
    let available: Prisma.Decimal | null = null;
    if (m.batchId) {
      const batch = await db.productBatch.findUnique({ where: { id: m.batchId } });
      assertFound(batch, "الدفعة غير موجودة");
      batchId = batch.id;
      available = batch.qtyOnHand;
      if (batch.unitCost) unitCost = batch.unitCost;
    } else {
      // aggregate availability across batches
      const agg = await db.productBatch.aggregate({ where: { productId: product.id, active: true }, _sum: { qtyOnHand: true } });
      available = agg._sum.qtyOnHand ?? moneyZero();
    }
    materialCosts.set(m.productId, { productId: m.productId, name: product.name, batchId, unitCost, unit: m.unit ?? product.stockUnit, available });
  }

  const existing = await db.treatment.findUnique({ where: { visitId } });
  const before = existing
    ? { basePrice: existing.basePrice, notes: existing.notes, itemCount: await db.treatmentItem.count({ where: { treatmentId: existing.id } }) }
    : null;

  const treatment = await db.$transaction(async (tx) => {
    const t = existing
      ? await tx.treatment.update({
          where: { id: existing.id },
          data: { basePrice: input.basePrice, notes: input.notes ?? null, doctorId: actor.id },
        })
      : await tx.treatment.create({
          data: { visitId, doctorId: actor.id, basePrice: input.basePrice, finalPrice: input.basePrice, notes: input.notes ?? null },
        });

    await tx.treatmentItem.deleteMany({ where: { treatmentId: t.id } });
    await tx.visitMedication.deleteMany({ where: { visitId } });

    for (const s of input.services) {
      await tx.treatmentItem.create({
        data: {
          treatmentId: t.id,
          kind: "SERVICE",
          serviceId: s.serviceId ?? null,
          description: s.description,
          area: s.area ?? null,
          linePrice: s.linePrice ? money(s.linePrice) : null,
        },
      });
    }
    for (const m of input.materials) {
      const info = materialCosts.get(m.productId)!;
      await tx.treatmentItem.create({
        data: {
          treatmentId: t.id,
          kind: "MATERIAL",
          productId: info.productId,
          productBatchId: info.batchId,
          qtyUsed: money(m.qtyUsed),
          description: info.name,
          unit: info.unit,
          unitCostSnapshot: info.unitCost,
        },
      });
    }
    if (input.medications && input.medications.length > 0) {
      for (const med of input.medications) {
        if (!med.name.trim()) throw new AppError("اسم الدواء مطلوب", "VALIDATION");
        await tx.visitMedication.create({
          data: {
            visitId,
            medicationId: med.medicationId ?? null,
            name: med.name.trim(),
            qty: med.qty?.trim() || null,
            dose: med.dose?.trim() || null,
            instructions: med.instructions?.trim() || null,
            createdById: actor.id,
          },
        });
      }
    }
    return t;
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "treatment.save",
    entityType: "treatment",
    entityId: treatment.id,
    before,
    after: { basePrice: input.basePrice, services: input.services.length, materials: input.materials.length, notes: input.notes },
  });

  return { treatmentId: treatment.id };
}

export interface FollowUpOnSend {
  dueDate?: string;
  notes?: string | null;
  type?: "FOLLOW_UP" | "REMINDER" | "OTHER";
  /** Also reserve a future Visit as the patient's review appointment. */
  scheduleAppointment?: boolean;
}

function reviewProcedureLabel(items: { kind: string; description: string }[]): string | null {
  const descriptions = items.filter((item) => item.kind === "SERVICE").map((item) => item.description).join(" ");
  const hasBotox = /بوتوكس|botox/i.test(descriptions);
  const hasFiller = /فيلر|filler/i.test(descriptions);
  if (hasBotox && hasFiller) return "البوتوكس والفيلر";
  if (hasBotox) return "البوتوكس";
  if (hasFiller) return "الفيلر";
  return null;
}

function addCalendarDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Doctor sends the bill to the cashier.
 * Validates the treatment, deducts inventory (exactly once, per configured
 * deduction point), creates the invoice + lines, transitions the visit.
 */
export async function sendToCashier(
  actor: AuthUser,
  visitId: string,
  followUps: FollowUpOnSend[] = [],
): Promise<{ treatmentId: string; invoiceId: string }> {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE)) throw new AppError("لا تملك صلاحية إتمام الجلسات", "FORBIDDEN");
  const visit = await db.visit.findUnique({ where: { id: visitId }, include: { treatment: { include: { items: true } } } });
  assertFound(visit, "الزيارة غير موجودة");
  const treatment = visit.treatment;
  assertFound(treatment, "لا توجد جلسة مسجلة لهذه الزيارة");

  if (visit.status === "READY_FOR_PAYMENT" || visit.status === "PARTIALLY_PAID" || visit.status === "PAID" || visit.status === "CLOSED") {
    throw new AppError("تم إرسال الحساب مسبقًا", "CONFLICT");
  }
  if (!canTransition(visit.status, "READY_FOR_PAYMENT")) throw new AppError("لا يمكن إرسال الحساب من الحالة الحالية");
  if (treatment.basePrice.lte(0)) throw new AppError("يجب إدخال سعر الجلسة قبل الإرسال", "VALIDATION");
  if (treatment.items.length === 0) throw new AppError("يجب تسجيل إجراء واحد على الأقل", "VALIDATION");

  const settings = await getSettings();
  const treatmentCompletedAt = visit.treatmentCompletedAt ?? new Date();
  const deductAtSend = settings.inventoryDeductAt !== "PAYMENT";
  const review = followUps.find((f) => f.scheduleAppointment);
  const reviewLabel = reviewProcedureLabel(treatment.items);
  const automaticReviewDate = review?.scheduleAppointment
    ? dateInputToLocalMidnight(review.dueDate, settings.timezone) ?? (reviewLabel ? addCalendarDays(treatmentCompletedAt, 14) : null)
    : null;
  if (review?.scheduleAppointment && !automaticReviewDate) {
    throw new AppError("حدد تاريخ موعد المراجعة أو استخدم مراجعة البوتوكس/الفيلر التلقائية", "VALIDATION");
  }

  const result = await db.$transaction(async (tx) => {
    if (deductAtSend) {
      await applyStockDeductions(tx, treatment, actor);
    }

    // Carries any treatment-level discount (applied pre-invoice by an authorized doctor)
    const discountAmount = treatment.discountAmount ?? moneyZero();
    const finalAmount = treatment.finalPrice ?? treatment.basePrice;

    const invoice = await tx.invoice.create({
      data: {
        visitId,
        customerId: visit.customerId,
        originalAmount: treatment.basePrice,
        discountAmount,
        finalAmount,
        status: "UNPAID",
        lines: {
          create: treatment.items.map((item) => ({
            kind: item.kind,
            description: item.description,
            qty: item.qtyUsed,
            unit: item.unit,
            unitPrice: item.kind === "MATERIAL" ? item.unitCostSnapshot : null,
            amount: item.kind === "MATERIAL" ? money(item.qtyUsed ?? 0).mul(item.unitCostSnapshot ?? 0) : moneyZero(),
            treatmentItemId: item.id,
            createdById: actor.id,
          })),
        },
      },
    });

    await tx.treatment.update({
      where: { id: treatment.id },
      data: { sentToCashierAt: new Date(), finalPrice: finalAmount, discountAmount },
    });

    // Link the pre-invoice discount row to the created invoice (single Discount record)
    await tx.discount.updateMany({ where: { treatmentId: treatment.id }, data: { invoiceId: invoice.id } });

    await tx.visit.update({
      where: { id: visitId },
      data: {
        status: "READY_FOR_PAYMENT",
        treatmentCompletedAt: visit.treatmentCompletedAt ?? treatmentCompletedAt,
        sentToCashierAt: new Date(),
      },
    });

    let reviewAppointment: { id: string } | null = null;
    if (review?.scheduleAppointment && automaticReviewDate) {
      const reviewDayEnd = addCalendarDays(automaticReviewDate, 1);
      const existing = await tx.visit.findFirst({
        where: {
          customerId: visit.customerId,
          scheduledAt: { gte: automaticReviewDate, lt: reviewDayEnd },
          status: { notIn: ["CANCELLED", "CLOSED"] },
        },
        select: { id: true },
      });
      reviewAppointment = existing ?? await tx.visit.create({
        data: {
          customerId: visit.customerId,
          doctorId: visit.doctorId ?? null,
          scheduledAt: automaticReviewDate,
          status: "REGISTERED",
          notes: `موعد مراجعة ${reviewLabel ?? "بعد الإجراء"}`,
        },
        select: { id: true },
      });
    }

    for (const f of followUps) {
      if (!f.dueDate && !f.scheduleAppointment) continue;
      const dueDate = f.scheduleAppointment && automaticReviewDate
        ? addCalendarDays(automaticReviewDate, -1)
        : f.dueDate ? new Date(f.dueDate) : null;
      if (!dueDate) continue;
      await tx.followUpTask.create({
        data: {
          customerId: visit.customerId,
          visitId,
          appointmentVisitId: f.scheduleAppointment ? reviewAppointment?.id ?? null : null,
          doctorId: actor.id,
          dueDate,
          type: f.type ?? (f.scheduleAppointment ? "REMINDER" : "FOLLOW_UP"),
          status: "PENDING",
          notes: f.notes ?? (f.scheduleAppointment ? `تذكير قبل موعد مراجعة ${reviewLabel ?? "بعد الإجراء"}` : null),
        },
      });
    }

    return { invoice };
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "treatment.send_to_cashier",
    entityType: "visit",
    entityId: visitId,
    before: { status: visit.status },
    after: { status: "READY_FOR_PAYMENT", invoiceId: result.invoice.id, invoiceNo: result.invoice.invoiceNo, amount: result.invoice.originalAmount.toNumber(), stockDeducted: deductAtSend },
  });

  await notifySecretaries({
    title: "جلسة جاهزة للتحصيل",
    body: `${visit.id} — جاهزة عند الاستقبال`,
    type: "TREATMENT_COMPLETED",
    entityType: "visit",
    entityId: visitId,
  });

  return { treatmentId: treatment.id, invoiceId: result.invoice.id };
}

/** Deducts stock for all material items of a treatment. Idempotent: skips if movements already exist. */
export async function applyStockDeductions(tx: Prisma.TransactionClient, treatment: { id: string; items: { id: string; kind: string; productId: string | null; productBatchId: string | null; qtyUsed: Prisma.Decimal | null; unit: string | null; unitCostSnapshot: Prisma.Decimal | null }[] }, actor: AuthUser): Promise<void> {
  const existing = await tx.stockMovement.findFirst({
    where: { referenceType: "TREATMENT", referenceId: treatment.id, type: "TREATMENT_USAGE" },
  });
  if (existing) return; // idempotency guard — never deduct twice

  const settings = await getSettings();
  for (const item of treatment.items) {
    if (item.kind !== "MATERIAL" || !item.productId) continue;
    const qty = item.qtyUsed ?? moneyZero();
    if (qty.lte(0)) continue;

    const batch = item.productBatchId
      ? await tx.productBatch.findUnique({ where: { id: item.productBatchId } })
      : null;
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (!product) continue;

    if (batch) {
      if (batch.qtyOnHand.lt(qty) && !settings.allowNegativeStock) {
        throw new AppError(`الكمية المتوفرة من ${product.name} (دفعة ${batch.batchNo ?? ""}) أقل من المطلوب`, "VALIDATION");
      }
      const newBalance = batch.qtyOnHand.sub(qty);
      await tx.productBatch.update({ where: { id: batch.id }, data: { qtyOnHand: newBalance } });
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          batchId: batch.id,
          type: "TREATMENT_USAGE",
          qty: qty.negated(),
          unit: item.unit ?? product.stockUnit,
          balanceAfter: newBalance,
          referenceType: "TREATMENT",
          referenceId: treatment.id,
          userId: actor.id,
          reason: `استهلاك جلسة ${treatment.id}`,
        },
      });
    } else {
      // no batch selected: consume from batches FIFO (by expiry then received)
      const batches = await tx.productBatch.findMany({
        where: { productId: product.id, active: true, qtyOnHand: { gt: 0 } },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
      });
      let remaining = qty;
      for (const b of batches) {
        if (remaining.lte(0)) break;
        const take = remaining.gte(b.qtyOnHand) ? b.qtyOnHand : remaining;
        const newBalance = b.qtyOnHand.sub(take);
        await tx.productBatch.update({ where: { id: b.id }, data: { qtyOnHand: newBalance } });
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            batchId: b.id,
            type: "TREATMENT_USAGE",
            qty: take.negated(),
            unit: item.unit ?? product.stockUnit,
            balanceAfter: newBalance,
            referenceType: "TREATMENT",
            referenceId: treatment.id,
            userId: actor.id,
            reason: `استهلاك جلسة ${treatment.id}`,
          },
        });
        remaining = remaining.sub(take);
      }
      if (remaining.gt(0)) {
        if (!settings.allowNegativeStock) {
          throw new AppError(`الكمية المتوفرة من ${product.name} غير كافية (ينقص ${remaining.toNumber()})`, "VALIDATION");
        }
        // negative-stock enabled: record a negative balance movement without batch
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: "TREATMENT_USAGE",
            qty: remaining.negated(),
            unit: item.unit ?? product.stockUnit,
            balanceAfter: remaining.negated(),
            referenceType: "TREATMENT",
            referenceId: treatment.id,
            userId: actor.id,
            reason: "استهلاك جلسة (بدون رصيد — السماح بالمخزون السالب مفعّل)",
          },
        });
      }
    }
  }
}

export async function getReadyForPaymentQueue(actor: AuthUser) {
  const visits = await db.visit.findMany({
    where: { status: "READY_FOR_PAYMENT" },
    orderBy: { sentToCashierAt: "asc" },
    include: {
      customer: { select: { id: true, fullName: true, phone: true, customerNo: true } },
      doctor: { select: { id: true, name: true } },
      treatment: {
        include: {
          items: true,
          discount: { include: { approvedBy: { select: { name: true } } } },
        },
      },
      invoice: { include: { payments: true, discount: { include: { approvedBy: { select: { name: true } } } } } },
    },
  });
  return visits.map((v) => ({
    visitId: v.id,
    visitNo: v.visitNo,
    customer: v.customer,
    doctor: v.doctor,
    sentToCashierAt: v.sentToCashierAt,
    items: v.treatment?.items ?? [],
    originalAmount: v.treatment?.basePrice ?? v.invoice?.originalAmount ?? moneyZero(),
    discountAmount: v.treatment?.discountAmount ?? v.invoice?.discountAmount ?? moneyZero(),
    finalAmount: v.treatment?.finalPrice ?? v.invoice?.finalAmount ?? moneyZero(),
    invoiceId: v.invoice?.id ?? null,
    invoiceNo: v.invoice?.invoiceNo ?? null,
    paidAmount: (v.invoice?.payments ?? []).filter((p) => p.status === "COMPLETED").reduce((a, p) => a.plus(p.amount), moneyZero()),
  }));
}
