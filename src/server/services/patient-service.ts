import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound, mustFind } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { resolveSourceFields } from "./customer-source-service";
import type { AuthUser } from "@/lib/auth/authorize";

export interface CreatePatientInput {
  fullName: string;
  phone: string;
  phone2?: string | null;
  email?: string | null;
  birthDate?: string | null;
  source?: string | null;
  sourceId?: string | null;
  sourceNote?: string | null;
  referrerCustomerId?: string | null;
  marketingConsent?: boolean;
  marketingOptOut?: boolean;
  tags?: string[];
  notes?: string | null;
}

const cleanPhone = (p: string) => p.trim().replace(/^\+?0+/, "");

export async function createPatient(actor: AuthUser, input: CreatePatientInput): Promise<{ id: string; customerNo: number }> {
  if (input.fullName.trim().length < 2) throw new AppError("الاسم غير كافٍ", "VALIDATION");
  if (!input.phone.trim()) throw new AppError("رقم الهاتف مطلوب", "VALIDATION");
  const phone = cleanPhone(input.phone);
  const sourceFields = await resolveSourceFields({ sourceId: input.sourceId ?? null, sourceNote: input.sourceNote ?? null, referrerCustomerId: input.referrerCustomerId ?? null });

  const customer = await db.customer.create({
    data: {
      fullName: input.fullName.trim(),
      phone,
      phone2: input.phone2 ? cleanPhone(input.phone2) : null,
      email: input.email?.trim() || null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      source: input.source || null,
      sourceId: sourceFields.sourceId,
      sourceNote: sourceFields.sourceNote,
      referrerCustomerId: sourceFields.referrerCustomerId,
      marketingConsent: input.marketingConsent ?? false,
      marketingOptOut: input.marketingOptOut ?? false,
      marketingOptOutAt: input.marketingOptOut ? new Date() : null,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      createdById: actor.id,
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "patient.create",
    entityType: "customer",
    entityId: customer.id,
    after: { fullName: customer.fullName, phone: customer.phone, customerNo: customer.customerNo },
  });
  return { id: customer.id, customerNo: customer.customerNo };
}

export async function searchPatients(actor: AuthUser, query: string, page = 1, pageSize = 20) {
  const q = query.trim();
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q.replace(/^\+?0+/, "") } },
          { phone2: { contains: q.replace(/^\+?0+/, "") } },
          { customerNo: !Number.isNaN(Number(q)) ? Number(q) : -1 },
        ],
      }
    : {};
  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: { select: { visits: true } },
        visits: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, status: true } },
      },
    }),
  ]);
  return {
    items: customers.map((c) => ({
      id: c.id,
      customerNo: c.customerNo,
      fullName: c.fullName,
      phone: c.phone,
      birthDate: c.birthDate,
      tags: c.tags,
      status: c.status,
      createdAt: c.createdAt,
      visitCount: c._count.visits,
      lastVisit: c.visits[0]?.createdAt ?? null,
    })),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getPatient(actor: AuthUser, customerId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: {
      medicalProfile: { include: { updatedByDoctor: { select: { name: true } } } },
      medicalEvents: { orderBy: { procedureDate: "desc" }, include: { createdBy: { select: { name: true } } } },
      visits: {
        orderBy: { createdAt: "desc" },
        include: {
          doctor: { select: { name: true } },
          treatment: { include: { items: true, discount: { include: { approvedBy: { select: { name: true } } } } } },
          invoice: { include: { payments: true } },
        },
      },
      followUps: { orderBy: { dueDate: "asc" }, take: 20 },
      communications: { orderBy: { sentAt: "desc" }, take: 20 },
      sourceRef: { select: { id: true, name: true } },
      referrer: { select: { id: true, fullName: true, customerNo: true } },
      referred: { select: { id: true, fullName: true, customerNo: true } },
    },
  });
  return mustFind(customer, "العميلة غير موجودة");
}

export async function updatePatientContact(actor: AuthUser, customerId: string, input: Partial<CreatePatientInput>) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  assertFound(customer, "العميلة غير موجودة");

  const sourceFields =
    input.sourceId !== undefined || input.sourceNote !== undefined || input.referrerCustomerId !== undefined
      ? await resolveSourceFields({
          sourceId: input.sourceId === undefined ? customer.sourceId : input.sourceId ?? null,
          sourceNote: input.sourceNote === undefined ? customer.sourceNote : input.sourceNote ?? null,
          referrerCustomerId: input.referrerCustomerId === undefined ? customer.referrerCustomerId : input.referrerCustomerId ?? null,
        })
      : null;

  const before = {
    fullName: customer.fullName,
    phone: customer.phone,
    phone2: customer.phone2,
    email: customer.email,
    birthDate: customer.birthDate?.toISOString(),
    source: customer.source,
    sourceId: customer.sourceId,
    sourceNote: customer.sourceNote,
    referrerCustomerId: customer.referrerCustomerId,
    marketingConsent: customer.marketingConsent,
    tags: customer.tags,
    notes: customer.notes,
  };

  const updated = await db.customer.update({
    where: { id: customerId },
    data: {
      ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
      ...(input.phone !== undefined ? { phone: cleanPhone(input.phone) } : {}),
      ...(input.phone2 !== undefined ? { phone2: input.phone2 ? cleanPhone(input.phone2) : null } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.birthDate !== undefined ? { birthDate: input.birthDate ? new Date(input.birthDate) : null } : {}),
      ...(input.source !== undefined ? { source: input.source || null } : {}),
      ...(sourceFields ? { sourceId: sourceFields.sourceId, sourceNote: sourceFields.sourceNote, referrerCustomerId: sourceFields.referrerCustomerId } : {}),
      ...(input.marketingConsent !== undefined ? { marketingConsent: input.marketingConsent } : {}),
      ...(input.marketingOptOut !== undefined ? { marketingOptOut: input.marketingOptOut, marketingOptOutAt: input.marketingOptOut ? new Date() : null } : {}),
      ...(input.tags !== undefined ? { tags: input.tags ?? [] } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "patient.update_contact",
    entityType: "customer",
    entityId: customerId,
    before,
    after: {
      fullName: updated.fullName,
      phone: updated.phone,
      phone2: updated.phone2,
      email: updated.email,
      birthDate: updated.birthDate?.toISOString(),
      source: updated.source,
      sourceId: updated.sourceId,
      sourceNote: updated.sourceNote,
      referrerCustomerId: updated.referrerCustomerId,
      marketingConsent: updated.marketingConsent,
      marketingOptOut: updated.marketingOptOut,
      tags: updated.tags,
      notes: updated.notes,
    },
  });
}

export async function updateMedicalProfile(actor: AuthUser, customerId: string, input: { previousProcedures?: string[]; allergies?: string | null; medicalNotes?: string | null }) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  assertFound(customer, "العميلة غير موجودة");
  const existing = await db.customerMedicalProfile.findUnique({ where: { customerId } });
  const before = existing
    ? { previousProcedures: existing.previousProcedures, allergies: existing.allergies, medicalNotes: existing.medicalNotes }
    : null;

  await db.customerMedicalProfile.upsert({
    where: { customerId },
    update: {
      ...(input.previousProcedures !== undefined ? { previousProcedures: input.previousProcedures } : {}),
      ...(input.allergies !== undefined ? { allergies: input.allergies || null } : {}),
      ...(input.medicalNotes !== undefined ? { medicalNotes: input.medicalNotes || null } : {}),
      updatedByDoctorId: actor.id,
    },
    create: {
      customerId,
      previousProcedures: input.previousProcedures ?? [],
      allergies: input.allergies || null,
      medicalNotes: input.medicalNotes || null,
      updatedByDoctorId: actor.id,
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "patient.update_medical_profile",
    entityType: "customer",
    entityId: customerId,
    before,
    after: input,
  });
}

export async function addMedicalEvent(actor: AuthUser, customerId: string, input: { procedureType: string; area?: string | null; procedureDate?: string | null; productName?: string | null; notes?: string | null }) {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  assertFound(customer, "العميلة غير موجودة");
  const ev = await db.customerMedicalEvent.create({
    data: {
      customerId,
      procedureType: input.procedureType,
      area: input.area || null,
      procedureDate: input.procedureDate ? new Date(input.procedureDate) : null,
      productName: input.productName || null,
      notes: input.notes || null,
      createdById: actor.id,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "patient.medical_event.create",
    entityType: "customer_medical_event",
    entityId: ev.id,
    after: input,
  });
}

export async function patientAggregates(customerId: string) {
  const [visits, invoices] = await Promise.all([
    db.visit.findMany({ where: { customerId }, select: { id: true, status: true } }),
    db.invoice.findMany({
      where: { customerId, status: { not: "VOID" } },
      select: { finalAmount: true, payments: { where: { status: "COMPLETED" }, select: { amount: true } } },
    }),
  ]);
  const paid = invoices.reduce((acc, i) => acc.plus(i.payments.reduce((a, p) => a.plus(p.amount), new Prisma.Decimal(0))), new Prisma.Decimal(0));
  const billed = invoices.reduce((acc, i) => acc.plus(i.finalAmount), new Prisma.Decimal(0));
  return { visitCount: visits.length, totalSpent: billed.toNumber(), totalPaid: paid.toNumber() };
}

export async function getPatientsForDoctor(actor: AuthUser, doctorId: string, page = 1, pageSize = 20) {
  return searchPatients(actor, "", page, pageSize).then((r) => {
    const ids = new Set(r.items.map((i) => i.id));
    return { ...r, items: r.items.filter((i) => ids.has(i.id)) };
  });
}
