import "server-only";
import { db } from "@/lib/db";
import { assertFound } from "@/lib/errors";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Medical history summary shown to the doctor BEFORE treating the patient
 * (spec: "show patient's previous visits/medical history first").
 * Financial data (paid amounts) is only attached for accounts holding
 * PAYMENTS_VIEW_HISTORY — the secretary never sees the medical record.
 */
export async function getPatientHistorySummary(actor: AuthUser, customerId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  assertFound(customer, "العميلة غير موجودة");

  const medicalAllowed = hasPermission(actor, GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL);
  const financialAllowed = hasPermission(actor, GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY);

  const visits = await db.visit.findMany({
    where: { customerId, status: { notIn: ["CANCELLED"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      doctor: { select: { name: true } },
      treatment: {
        include: {
          items: { select: { kind: true, description: true, area: true, linePrice: true } },
          discount: { select: { discountAmount: true, reason: true, approvedBy: { select: { name: true } } } },
        },
      },
      invoice: { include: { payments: { where: { status: "COMPLETED" }, select: { amount: true, method: true, paidAt: true } } } },
      medications: { orderBy: { createdAt: "desc" } },
    },
  });

  const lastVisit = visits[0] ?? null;
  const lastBotox = medicalAllowed ? visits.find((v) => v.treatment?.items.some((i) => /بوتوكس|botox/i.test(i.description))) ?? null : null;
  const lastFiller = medicalAllowed ? visits.find((v) => v.treatment?.items.some((i) => /فيلر|filler/i.test(i.description))) ?? null : null;
  const lastTreatmentDate = medicalAllowed ? (lastVisit?.treatmentCompletedAt ?? lastVisit?.createdAt ?? null) : null;
  const totalVisits = visits.length;

  return {
    customer: { id: customer.id, fullName: customer.fullName, phone: customer.phone, customerNo: customer.customerNo },
    totalVisits,
    lastVisitDate: lastVisit?.createdAt ?? null,
    lastTreatmentDate,
    lastBotox: lastBotox ? { date: lastBotox.treatmentCompletedAt ?? lastBotox.createdAt } : null,
    lastFiller: lastFiller ? { date: lastFiller.treatmentCompletedAt ?? lastFiller.createdAt } : null,
    medicalAllowed,
    financialAllowed,
    history: medicalAllowed
      ? visits.map((v) => ({
          visitId: v.id,
          visitNo: v.visitNo,
          date: v.createdAt,
          status: v.status,
          doctor: v.doctor?.name ?? null,
          completed: v.treatmentCompletedAt ?? null,
          items: v.treatment?.items ?? [],
          discountAmount: v.treatment?.discountAmount?.toNumber() ?? 0,
          discountReason: v.treatment?.discount?.reason ?? null,
          medications: v.medications,
        }))
      : [],
    financial: financialAllowed
      ? visits.map((v) => ({
          visitId: v.id,
          visitNo: v.visitNo,
          originalAmount: v.treatment?.basePrice?.toNumber() ?? v.invoice?.originalAmount?.toNumber() ?? 0,
          discountAmount: v.treatment?.discountAmount?.toNumber() ?? v.invoice?.discountAmount?.toNumber() ?? 0,
          finalAmount: v.treatment?.finalPrice?.toNumber() ?? v.invoice?.finalAmount?.toNumber() ?? 0,
          paid: (v.invoice?.payments ?? []).reduce((a, p) => a + p.amount.toNumber(), 0),
          status: v.invoice?.status ?? null,
          invoiceNo: v.invoice?.invoiceNo ?? null,
        }))
      : [],
  };
}

export interface PatientTimelineOptions {
  customerId: string;
  limit?: number;
}

/**
 * Combined chronological timeline (visits + medical events + follow-ups) —
 * used on the patient detail page and the visit screen.
 */
export async function getPatientTimeline(actor: AuthUser, opts: PatientTimelineOptions) {
  const customer = await db.customer.findUnique({ where: { id: opts.customerId } });
  assertFound(customer, "العميلة غير موجودة");
  const medicalAllowed = hasPermission(actor, GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL);

  const limit = opts.limit ?? 20;
  const [visits, events, followUps] = await Promise.all([
    db.visit.findMany({
      where: { customerId: opts.customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { doctor: { select: { name: true } } },
    }),
    medicalAllowed
      ? db.customerMedicalEvent.findMany({ where: { customerId: opts.customerId }, orderBy: { createdAt: "desc" }, take: limit, include: { createdBy: { select: { name: true } } } })
      : Promise.resolve([]),
    medicalAllowed
      ? db.followUpTask.findMany({ where: { customerId: opts.customerId }, orderBy: { createdAt: "desc" }, take: limit })
      : Promise.resolve([]),
  ]);

  const entries: { date: Date; kind: string; title: string; subtitle?: string | null; visitId?: string }[] = [
    ...visits.map((v) => ({
      date: v.createdAt,
      kind: "visit",
      title: `زيارة #${v.visitNo}`,
      subtitle: v.status,
      visitId: v.id,
    })),
    ...events.map((e) => ({ date: e.createdAt, kind: "event", title: e.procedureType, subtitle: e.notes ?? null })),
    ...followUps.map((f) => ({ date: f.createdAt, kind: "followup", title: f.type, subtitle: f.notes ?? null })),
  ];
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries.slice(0, limit);
}