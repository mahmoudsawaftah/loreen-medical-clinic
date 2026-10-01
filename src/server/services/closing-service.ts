import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { money, moneyZero } from "@/lib/money";
import { normalizeToDay, formatDate } from "@/lib/time";
import { notifyOwner, NOTIFICATION_TYPES } from "@/server/services/notification-service";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * End-of-day settlement workflow (نهاية اليوم):
 *   OPEN → SUBMITTED → APPROVED
 *             ↘ REVIEW_REQUIRED → SUBMITTED → APPROVED
 *   APPROVED → REOPENED (owner only) → can be submitted again
 * The secretary (or whoever holds closing.prepare) submits the counted
 * amounts with an explanation when a variance exists; the owner reviews
 * (closing.review) and approves (closing.approve), or returns the day for
 * correction with a note. Every transition is audited.
 */

interface ExpectedTotals {
  expectedCash: import("@prisma/client").Prisma.Decimal;
  expectedCliq: import("@prisma/client").Prisma.Decimal;
  expectedVisa: import("@prisma/client").Prisma.Decimal;
}

async function expectedTotalsFor(date: Date): Promise<ExpectedTotals> {
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const payments = await db.payment.findMany({
    where: { paidAt: { gte: day, lt: next }, status: "COMPLETED" },
    select: { method: true, amount: true },
  });
  const totals = { expectedCash: moneyZero(), expectedCliq: moneyZero(), expectedVisa: moneyZero() };
  for (const p of payments) {
    if (p.method === "CASH") totals.expectedCash = totals.expectedCash.plus(p.amount);
    else if (p.method === "CLIQ") totals.expectedCliq = totals.expectedCliq.plus(p.amount);
    else if (p.method === "VISA") totals.expectedVisa = totals.expectedVisa.plus(p.amount);
  }
  return totals;
}

export async function getClosingForDate(actor: AuthUser, date: Date) {
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const expected = await expectedTotalsFor(date);
  const closing = await db.dayClosing.findUnique({
    where: { closeDate: day },
    include: {
      closedBy: { select: { name: true } },
      reopenedBy: { select: { name: true } },
      submittedBy: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
  return { day, expected, closing };
}

/**
 * Secretary step: submit the day's counted amounts for review.
 * Creates or updates the settlement; moves it to SUBMITTED (بانتظار المراجعة).
 */
export async function closeDay(actor: AuthUser, date: Date, input: { actualCash: number; actualCliq: number; actualVisa: number; notes?: string | null; varianceExplanation?: string | null }) {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.CLOSING_PREPARE)) throw new AppError("لا تملك صلاحية تجهيز نهاية اليوم", "FORBIDDEN");
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const expected = await expectedTotalsFor(date);
  const closing = await db.dayClosing.findUnique({ where: { closeDate: day } });
  const notSubmittable = closing && ["SUBMITTED", "APPROVED", "CLOSED"].includes(closing.status);
  if (notSubmittable) throw new AppError("لا يمكن تقديم تسليم نهاية اليوم — اليوم غير قابل للتسليم حاليًا", "CONFLICT");

  const varianceCash = money(input.actualCash).sub(expected.expectedCash);
  const varianceCliq = money(input.actualCliq).sub(expected.expectedCliq);
  const varianceVisa = money(input.actualVisa).sub(expected.expectedVisa);
  const totalExpected = expected.expectedCash.add(expected.expectedCliq).add(expected.expectedVisa);
  const totalActual = money(input.actualCash).add(input.actualCliq).add(input.actualVisa);
  const totalVariance = totalActual.sub(totalExpected);

  const hasVariance = !varianceCash.isZero() || !varianceCliq.isZero() || !varianceVisa.isZero();
  if (hasVariance && !input.varianceExplanation?.trim()) {
    throw new AppError("يوجد فرق بين المتحصلات المتوقعة والمحصلة — مطلوب توضيح سبب الفرق قبل التسليم", "VALIDATION");
  }

  const saved = await db.dayClosing.upsert({
    where: { closeDate: day },
    update: {
      expectedCash: expected.expectedCash,
      expectedCliq: expected.expectedCliq,
      expectedVisa: expected.expectedVisa,
      actualCash: money(input.actualCash),
      actualCliq: money(input.actualCliq),
      actualVisa: money(input.actualVisa),
      varianceCash,
      varianceCliq,
      varianceVisa,
      totalExpected,
      totalActual,
      totalVariance,
      notes: input.notes || null,
      varianceExplanation: input.varianceExplanation?.trim() || null,
      status: "SUBMITTED",
      submittedById: actor.id,
      submittedAt: new Date(),
      approvedById: null,
      approvedAt: null,
      reviewNote: null,
      closedById: actor.id,
      closedAt: new Date(),
    },
    create: {
      closeDate: day,
      expectedCash: expected.expectedCash,
      expectedCliq: expected.expectedCliq,
      expectedVisa: expected.expectedVisa,
      actualCash: money(input.actualCash),
      actualCliq: money(input.actualCliq),
      actualVisa: money(input.actualVisa),
      varianceCash,
      varianceCliq,
      varianceVisa,
      totalExpected,
      totalActual,
      totalVariance,
      notes: input.notes || null,
      varianceExplanation: input.varianceExplanation?.trim() || null,
      status: "SUBMITTED",
      submittedById: actor.id,
      submittedAt: new Date(),
      closedById: actor.id,
      closedAt: new Date(),
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "closing.submit",
    entityType: "day_closing",
    entityId: saved.id,
    before: closing ? { status: closing.status } : null,
    after: {
      day: day.toISOString(),
      status: "SUBMITTED",
      expectedCash: expected.expectedCash.toNumber(),
      expectedCliq: expected.expectedCliq.toNumber(),
      expectedVisa: expected.expectedVisa.toNumber(),
      actualCash: input.actualCash,
      actualCliq: input.actualCliq,
      actualVisa: input.actualVisa,
      varianceCash: varianceCash.toNumber(),
      varianceCliq: varianceCliq.toNumber(),
      varianceVisa: varianceVisa.toNumber(),
      totalExpected: totalExpected.toNumber(),
      totalActual: totalActual.toNumber(),
      totalVariance: totalVariance.toNumber(),
      notes: input.notes ?? null,
      varianceExplanation: input.varianceExplanation?.trim() ?? null,
    },
  });

  const tzForLabel = (await getSettings()).timezone;
  await notifyOwner({
    title: `نهاية يوم ${formatDate(day, tzForLabel)} بانتظار المراجعة`,
    body: `المتوقع ${totalExpected.toNumber()} — الفعلي ${totalActual.toNumber()} — الفرق ${totalVariance.toNumber()}`,
    type: NOTIFICATION_TYPES.OTHER,
    entityType: "day_closing",
    entityId: saved.id,
    actorId: actor.id,
  });
}

/** Owner step: approve a submitted settlement (اعتماد اليوم). */
export async function approveDay(actor: AuthUser, date: Date) {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.CLOSING_APPROVE)) throw new AppError("لا تملك صلاحية اعتماد نهاية اليوم", "FORBIDDEN");
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const closing = await db.dayClosing.findUnique({ where: { closeDate: day } });
  assertFound(closing, "لا يوجد تسليم نهاية يوم لهذا التاريخ");
  if (closing.status !== "SUBMITTED") throw new AppError("لا يمكن الاعتماد — اليوم غير قيد المراجعة", "VALIDATION");

  const before = { status: closing.status };
  await db.dayClosing.update({
    where: { closeDate: day },
    data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), reviewedById: actor.id, reviewedAt: new Date() },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "closing.approve", entityType: "day_closing", entityId: closing.id, before, after: { status: "APPROVED", day: day.toISOString() } });
}

/** Reviewer step: return the settlement to the secretary for correction. */
export async function returnDayForReview(actor: AuthUser, date: Date, reason: string) {
  if (!hasPermission(actor, GRANULAR_PERMISSIONS.CLOSING_REVIEW)) throw new AppError("لا تملك صلاحية مراجعة نهاية اليوم", "FORBIDDEN");
  if (!reason.trim()) throw new AppError("سبب الإعادة للمراجعة مطلوب", "VALIDATION");
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const closing = await db.dayClosing.findUnique({ where: { closeDate: day } });
  assertFound(closing, "لا يوجد تسليم نهاية يوم لهذا التاريخ");
  if (closing.status !== "SUBMITTED") throw new AppError("لا يمكن الإعادة للمراجعة — اليوم غير قيد المراجعة", "VALIDATION");

  const before = { status: closing.status };
  await db.dayClosing.update({
    where: { closeDate: day },
    data: { status: "REVIEW_REQUIRED", reviewNote: reason.trim(), reviewedById: actor.id, reviewedAt: new Date() },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "closing.return_review", entityType: "day_closing", entityId: closing.id, before, after: { status: "REVIEW_REQUIRED", reason: reason.trim() } });
}

/** Owner-only: reopen an approved day (revisions, corrections). */
export async function reopenDay(actor: AuthUser, date: Date, reason: string) {
  if (actor.role !== "OWNER") throw new AppError("إعادة فتح يوم مغلق صلاحية حصرية للدكتور الرئيسي", "FORBIDDEN");
  if (!reason.trim()) throw new AppError("سبب إعادة الفتح مطلوب", "VALIDATION");
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const closing = await db.dayClosing.findUnique({ where: { closeDate: day } });
  assertFound(closing, "لا يوجد إغلاق لهذا اليوم");
  if (!["APPROVED", "CLOSED"].includes(closing.status)) throw new AppError("لا يمكن إعادة فتح اليوم إلا بعد اعتماده", "VALIDATION");

  const before = { status: closing.status };
  await db.dayClosing.update({
    where: { closeDate: day },
    data: { status: "REOPENED", reopenedById: actor.id, reopenedAt: new Date(), notes: `${closing.notes ?? ""}\n[إعادة فتح: ${reason.trim()}]`.trim() },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "closing.reopen", entityType: "day_closing", entityId: closing.id, before, after: { status: "REOPENED", reason: reason.trim() } });
}

/** Day activity summary shown to the reviewer (نشاط اليوم). */
export async function dayActivityFor(date: Date) {
  const tz = (await getSettings()).timezone;
  const day = normalizeToDay(date, tz);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  const range = { gte: day, lt: next };
  const [visits, payments, treatments, expenses, invoices] = await Promise.all([
    db.visit.count({ where: { checkInAt: range } }),
    db.payment.count({ where: { paidAt: range, status: "COMPLETED" } }),
    db.treatment.count({ where: { createdAt: range } }),
    db.expense.count({ where: { date: range } }),
    db.invoice.count({ where: { createdAt: range } }),
  ]);
  return { visits, payments, treatments, expenses, invoices };
}

export async function listClosings(actor: AuthUser, opts: { from?: string | null; to?: string | null; page?: number; pageSize?: number }) {
  const settings = await getSettings();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  if (opts.from || opts.to) {
    where.closeDate = {
      ...(opts.from ? { gte: normalizeToDay(new Date(opts.from), settings.timezone) } : {}),
      ...(opts.to
        ? {
            lte: new Date(normalizeToDay(new Date(opts.to), settings.timezone).getTime() + 24 * 60 * 60 * 1000 - 1),
          }
        : {}),
    };
  }
  const [total, items] = await Promise.all([
    db.dayClosing.count({ where }),
    db.dayClosing.findMany({
      where,
      orderBy: { closeDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        closedBy: { select: { name: true } },
        reopenedBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}