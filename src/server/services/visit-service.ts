import "server-only";
import { VisitStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { getDayRange, todayRange } from "@/lib/time";
import type { AuthUser } from "@/lib/auth/authorize";
import { notifyDoctor, notifySecretaries } from "./notification-service";

/**
 * Visit state machine (blueprint §7.1):
 * REGISTERED -> WAITING -> WITH_DOCTOR -> TREATMENT_COMPLETED -> READY_FOR_PAYMENT
 *              -> (PARTIALLY_PAID if configured) -> PAID -> CLOSED
 * CANCELLED from any pre-payment state.
 * All transitions are permission-checked, timestamped, and audited.
 */

export const VISIT_FLOW_ORDER: VisitStatus[] = [
  "REGISTERED",
  "WAITING",
  "WITH_DOCTOR",
  "TREATMENT_COMPLETED",
  "READY_FOR_PAYMENT",
  "PARTIALLY_PAID",
  "PAID",
  "CLOSED",
];

const TRANSITIONS: Record<VisitStatus, VisitStatus[]> = {
  REGISTERED: ["WAITING", "CANCELLED"],
  WAITING: ["WITH_DOCTOR", "CANCELLED"],
  WITH_DOCTOR: ["TREATMENT_COMPLETED", "READY_FOR_PAYMENT", "WAITING", "CANCELLED"],
  TREATMENT_COMPLETED: ["READY_FOR_PAYMENT", "CANCELLED"],
  READY_FOR_PAYMENT: ["PARTIALLY_PAID", "PAID", "CLOSED", "CANCELLED"],
  PARTIALLY_PAID: ["PAID", "CLOSED"],
  PAID: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: VisitStatus, to: VisitStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export interface CreateVisitInput {
  customerId: string;
  doctorId?: string | null;
  scheduledAt?: string | Date | null;
  notes?: string | null;
}

export async function createVisit(actor: AuthUser, input: CreateVisitInput): Promise<{ id: string; visitNo: number }> {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  assertFound(customer, "العميلة غير موجودة");
  if (input.doctorId) {
    const doctor = await db.user.findUnique({ where: { id: input.doctorId } });
    assertFound(doctor, "الدكتور غير موجود");
  }
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new AppError("تاريخ الموعد غير صحيح", "VALIDATION");
  const visit = await db.visit.create({
    data: {
      customerId: input.customerId,
      doctorId: input.doctorId ?? null,
      scheduledAt,
      status: "REGISTERED",
      notes: input.notes ?? null,
    },
  });
  if (!input.doctorId && scheduledAt) {
    await db.followUpTask.create({
      data: {
        customerId: input.customerId,
        visitId: visit.id,
        appointmentVisitId: visit.id,
        dueDate: new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000),
        type: "REMINDER",
        notes: "تذكير بموعد لا يحتاج استشارة طبيب",
      },
    });
  }
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "visit.create",
    entityType: "visit",
    entityId: visit.id,
    after: { visitNo: visit.visitNo, customerId: input.customerId, doctorId: input.doctorId },
  });
  if (input.doctorId) {
    await notifyDoctor(
      {
        title: "عميلة جديدة بانتظارك",
        body: `${customer.fullName} — قم باستقبالها من قائمة اليوم`,
        type: "VISIT_ASSIGNED",
        entityType: "visit",
        entityId: visit.id,
      },
      input.doctorId,
      actor.id,
    );
  }
  await notifySecretaries({
    title: "موعد/مريضة جديدة",
    body: `${customer.fullName} — تم تسجيلها وتحتاج متابعة الاستقبال`,
    type: "VISIT_ASSIGNED",
    entityType: "visit",
    entityId: visit.id,
  });
  return { id: visit.id, visitNo: visit.visitNo };
}

/** Check-in: REGISTERED -> WAITING */
export async function checkInVisit(actor: AuthUser, visitId: string): Promise<void> {
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  assertFound(visit, "الزيارة غير موجودة");
  if (!canTransition(visit.status, "WAITING")) throw new AppError("لا يمكن تسجيل الوصول من الحالة الحالية");
  const before = { status: visit.status };
  await db.visit.update({
    where: { id: visitId },
    data: { status: "WAITING", waitingAt: new Date(), checkedInById: actor.id, checkInAt: visit.checkInAt ?? new Date() },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "visit.check_in", entityType: "visit", entityId: visitId, before, after: { status: "WAITING" } });
}

/** Move to WAITING from any early state (reception control). */
export async function setWaiting(actor: AuthUser, visitId: string): Promise<void> {
  await transitionTo(actor, visitId, "WAITING");
}

/**
 * Start session with doctor: -> WITH_DOCTOR (atomic accept).
 * Only the assigned doctor (or the Owner) may accept; an unassigned visit
 * is claimed by the first doctor who accepts (doctorId auto-assigned).
 */
export async function startWithDoctor(actor: AuthUser, visitId: string): Promise<void> {
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  assertFound(visit, "الزيارة غير موجودة");
  if (!canTransition(visit.status, "WITH_DOCTOR")) throw new AppError(`لا يمكن الانتقال من حالة ${visit.status} إلى WITH_DOCTOR`);
  if (visit.doctorId && visit.doctorId !== actor.id && actor.role !== "OWNER") {
    throw new AppError("هذه الجلسة معيّنة لدكتور آخر", "FORBIDDEN");
  }
  const updated = await db.visit.updateMany({
    where: { id: visitId, status: visit.status },
    data: { status: "WITH_DOCTOR", startedAt: new Date(), doctorId: visit.doctorId ?? actor.id },
  });
  if (updated.count === 0) throw new AppError("تغيّرت حالة الزيارة — حاول مجددًا", "CONFLICT");
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "visit.transition:WITH_DOCTOR",
    entityType: "visit",
    entityId: visitId,
    before: { status: visit.status },
    after: { status: "WITH_DOCTOR", acceptedBy: actor.name },
  });
}

/** Reception reassigns the visit to another doctor while still waiting/registered. */
export async function assignVisitDoctor(actor: AuthUser, visitId: string, doctorId: string): Promise<void> {
  const visit = await db.visit.findUnique({ where: { id: visitId }, include: { customer: { select: { fullName: true } } } });
  assertFound(visit, "الزيارة غير موجودة");
  if (visit.status !== "REGISTERED" && visit.status !== "WAITING") {
    throw new AppError("لا يمكن تغيير الدكتور بعد بدء الجلسة", "CONFLICT");
  }
  const doctor = await db.user.findUnique({ where: { id: doctorId } });
  assertFound(doctor, "الدكتور غير موجود");
  if (doctor.role !== "DOCTOR" && doctor.role !== "MAIN_DOCTOR" && doctor.role !== "OWNER") {
    throw new AppError("المستخدم المحدد ليس طبيبًا", "VALIDATION");
  }
  const before = { doctorId: visit.doctorId };
  await db.$transaction([
    db.visit.update({ where: { id: visitId }, data: { doctorId } }),
    db.followUpTask.deleteMany({
      where: {
        visitId,
        appointmentVisitId: visitId,
        doctorId: null,
        assignedToId: null,
        type: "REMINDER",
        status: "PENDING",
      },
    }),
  ]);
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "visit.assign_doctor",
    entityType: "visit",
    entityId: visitId,
    before,
    after: { doctorId },
  });
  await notifyDoctor(
    {
      title: "تم تحويل عميلة إليك",
      body: `${visit.customer?.fullName ?? "عميلة"} — بانتظار استقبالك`,
      type: "VISIT_ASSIGNED",
      entityType: "visit",
      entityId: visitId,
    },
    doctorId,
    actor.id,
  );
  await notifySecretaries({
    title: "تم تحويل مريضة لطبيب",
    body: `${visit.customer?.fullName ?? "مريضة"} — تم تحديث الطبيب المسؤول`,
    type: "VISIT_ASSIGNED",
    entityType: "visit",
    entityId: visitId,
  });
}

/** Return to waiting (doctor releases patient before completion). */
export async function returnToWaiting(actor: AuthUser, visitId: string): Promise<void> {
  await transitionTo(actor, visitId, "WAITING");
}

/** Doctor completes the treatment clinically (no billing yet). */
export async function completeTreatmentClinically(actor: AuthUser, visitId: string): Promise<void> {
  await transitionTo(actor, visitId, "TREATMENT_COMPLETED");
}

/** Send bill to cashier: -> READY_FOR_PAYMENT (called by billing service after validation). */
export async function markReadyForPayment(actor: AuthUser, visitId: string): Promise<void> {
  await transitionTo(actor, visitId, "READY_FOR_PAYMENT");
}

export async function cancelVisit(actor: AuthUser, visitId: string, reason: string): Promise<void> {
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  assertFound(visit, "الزيارة غير موجودة");
  if (!canTransition(visit.status, "CANCELLED")) throw new AppError("لا يمكن إلغاء الزيارة من الحالة الحالية");
  if (!reason.trim()) throw new AppError("سبب الإلغاء مطلوب", "VALIDATION");
  const before = { status: visit.status };
  await db.visit.update({
    where: { id: visitId },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "visit.cancel", entityType: "visit", entityId: visitId, before, after: { status: "CANCELLED", reason } });
}

export async function closeVisit(actor: AuthUser, visitId: string): Promise<void> {
  await transitionTo(actor, visitId, "CLOSED");
}

async function transitionTo(actor: AuthUser, visitId: string, to: VisitStatus): Promise<void> {
  const visit = await db.visit.findUnique({ where: { id: visitId } });
  assertFound(visit, "الزيارة غير موجودة");
  if (!canTransition(visit.status, to)) throw new AppError(`لا يمكن الانتقال من حالة ${visit.status} إلى ${to}`);
  const before = { status: visit.status };
  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === "WAITING") data.waitingAt = now;
  if (to === "WITH_DOCTOR") data.startedAt = now;
  if (to === "TREATMENT_COMPLETED") data.treatmentCompletedAt = now;
  if (to === "READY_FOR_PAYMENT") data.sentToCashierAt = now;
  if (to === "PAID") data.paidAt = now;
  if (to === "CLOSED") {
    data.closedAt = now;
    data.closedById = actor.id;
  }
  await db.visit.update({ where: { id: visitId }, data });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: `visit.transition:${to}`, entityType: "visit", entityId: visitId, before, after: { status: to } });
}

export async function getVisit(actor: AuthUser, visitId: string) {
  const visit = await db.visit.findUnique({
    where: { id: visitId },
    include: {
      customer: true,
      doctor: { select: { id: true, name: true } },
      treatment: {
        include: {
          items: { include: { product: true, batch: true, service: true } },
          discount: { include: { approvedBy: { select: { name: true } } } },
        },
      },
      invoice: { include: { payments: true, discount: { include: { approvedBy: { select: { name: true } } } } } },
      followUps: true,
      reopenedBy: { select: { id: true, name: true } },
      medications: { include: { medication: { select: { id: true, name: true } } } },
    },
  });
  return mustFind(visit, "الزيارة غير موجودة");
}

export async function listVisits(
  actor: AuthUser,
  opts: { status?: VisitStatus | null; date?: Date | null; doctorId?: string | null; customerId?: string | null; page?: number; pageSize?: number; todayOnly?: boolean },
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const where: Record<string, unknown> = {};
  const settings = await getSettings();
  if (opts.status) where.status = opts.status;
  if (opts.doctorId) where.doctorId = opts.doctorId;
  if (opts.customerId) where.customerId = opts.customerId;
  if (opts.todayOnly) {
    Object.assign(where, scheduledOrCreatedOnDay(todayRange(settings.timezone)));
  } else if (opts.date) {
    Object.assign(where, scheduledOrCreatedOnDay(getDayRange(opts.date, settings.timezone)));
  }
  const [total, items] = await Promise.all([
    db.visit.count({ where }),
    db.visit.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { id: true, fullName: true, phone: true, customerNo: true } }, doctor: { select: { id: true, name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getTodayQueue(actor: AuthUser) {
  const settings = await getSettings();
  const visits = await db.visit.findMany({
    where: { ...scheduledOrCreatedOnDay(todayRange(settings.timezone)), status: { notIn: ["CANCELLED", "CLOSED"] } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      customer: { select: { id: true, fullName: true, phone: true } },
      doctor: { select: { id: true, name: true } },
      treatment: { select: { basePrice: true, finalPrice: true } },
    },
  });
  return visits;
}

/** Doctor's own queue: only visits assigned to this doctor (reception may see all). */
export async function getDoctorQueue(actor: AuthUser) {
  const settings = await getSettings();
  const doctorOnly = actor.role !== "OWNER" && actor.role !== "SECRETARY";
  const visits = await db.visit.findMany({
    where: {
      ...scheduledOrCreatedOnDay(todayRange(settings.timezone)),
      status: { notIn: ["CANCELLED", "CLOSED", "PAID"] },
      ...(doctorOnly ? { doctorId: actor.id } : {}),
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      customer: { select: { id: true, fullName: true, phone: true, customerNo: true, createdAt: true } },
      doctor: { select: { id: true, name: true } },
      medications: { include: { medication: { select: { id: true, name: true } } } },
    },
  });
  const waiting = visits.filter((v) => v.status === "WAITING" || v.status === "REGISTERED").length;
  const withDoctor = visits.filter((v) => v.status === "WITH_DOCTOR").length;
  const completed = visits.filter((v) => v.status === "TREATMENT_COMPLETED" || v.status === "READY_FOR_PAYMENT" || v.status === "PARTIALLY_PAID").length;
  return { visits, counts: { waiting, withDoctor, completed } };
}

function scheduledOrCreatedOnDay(range: { start: Date; end: Date }) {
  return {
    OR: [
      { scheduledAt: { gte: range.start, lt: range.end } },
      { scheduledAt: null, createdAt: { gte: range.start, lt: range.end } },
    ],
  };
}
