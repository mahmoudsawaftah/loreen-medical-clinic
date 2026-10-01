import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getMessaging } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * CRM: follow-up tasks, birthday queue, communication log.
 * Messaging goes through the provider adapter; with no external credentials
 * the mock provider records sends locally (status + history preserved).
 */

export async function createFollowUp(
  actor: AuthUser,
  input: { customerId: string; visitId?: string | null; dueDate: string; type?: "FOLLOW_UP" | "BIRTHDAY" | "REMINDER" | "OTHER"; notes?: string | null; assignedToId?: string | null },
): Promise<{ id: string }> {
  if (!input.dueDate) throw new AppError("تاريخ المتابعة مطلوب", "VALIDATION");
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  assertFound(customer, "العميلة غير موجودة");
  const task = await db.followUpTask.create({
    data: {
      customerId: input.customerId,
      visitId: input.visitId || null,
      doctorId: actor.role === "DOCTOR" || actor.role === "OWNER" ? actor.id : null,
      dueDate: new Date(input.dueDate),
      type: input.type ?? "FOLLOW_UP",
      assignedToId: input.assignedToId || null,
      notes: input.notes || null,
    },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "follow_up.create", entityType: "follow_up", entityId: task.id, after: input });
  return { id: task.id };
}

export async function completeFollowUp(actor: AuthUser, taskId: string, status: "CONTACTED" | "BOOKED" | "NO_ANSWER" | "CLOSED", notes?: string | null) {
  const task = await db.followUpTask.findUnique({ where: { id: taskId } });
  assertFound(task, "المهمة غير موجودة");
  const before = { status: task.status };
  await db.followUpTask.update({
    where: { id: taskId },
    data: { status, notes: notes ?? task.notes, completedAt: new Date(), completedById: actor.id },
  });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: `follow_up.${status.toLowerCase()}`, entityType: "follow_up", entityId: taskId, before, after: { status } });
}

/** Queues: pending follow-ups (optional range), birthdays within N days. */
export async function followUpQueue(actor: AuthUser, opts: { daysAhead?: number; status?: string | null; assignedToMe?: boolean }) {
  const settings = await getSettings();
  const days = opts.daysAhead ?? 30;
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const where: Record<string, unknown> = {
    status: opts.status ?? "PENDING",
    dueDate: { lte: horizon },
  };
  if (opts.assignedToMe && (actor.role === "DOCTOR" || actor.role === "OWNER")) {
    where.assignedToId = actor.id;
  }
  const tasks = await db.followUpTask.findMany({
    where,
    orderBy: [{ dueDate: "asc" }],
    include: {
      customer: { select: { id: true, fullName: true, phone: true, birthDate: true } },
      visit: { select: { visitNo: true } },
      appointmentVisit: { select: { id: true, visitNo: true, scheduledAt: true, status: true } },
      assignedTo: { select: { name: true } },
    },
  });
  const birthdayCustomers = await birthdayQueue(actor, days);
  return { tasks, birthdayCustomers, timezone: settings.timezone };
}

/** Customers whose birthday falls within the next N days (clinic tz). */
export async function birthdayQueue(actor: AuthUser, daysAhead = 14) {
  const customers = await db.customer.findMany({ where: { birthDate: { not: null } }, select: { id: true, fullName: true, phone: true, birthDate: true, marketingConsent: true } });
  const today = new Date();
  const thisYear = today.getFullYear();
  const horizon = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const birthdays = customers
    .map((c) => {
      const bd = c.birthDate!;
      const next = new Date(thisYear, bd.getMonth(), bd.getDate());
      if (next < today) next.setFullYear(thisYear + 1);
      return { customer: c, next };
    })
    .filter((x) => x.next <= horizon)
    .sort((a, b) => a.next.getTime() - b.next.getTime());
  return birthdays;
}

export interface SendCommunicationInput {
  customerId: string;
  message: string;
  channel: "whatsapp" | "sms" | "manual" | "mock";
  followUpTaskId?: string | null;
}

/** Sends via provider adapter and always records the CommunicationLog row. */
export async function sendCommunication(actor: AuthUser, input: SendCommunicationInput): Promise<{ id: string }> {
  const customer = await db.customer.findUnique({ where: { id: input.customerId } });
  assertFound(customer, "العميلة غير موجودة");
  if (!input.message.trim()) throw new AppError("نص الرسالة مطلوب", "VALIDATION");
  if (!customer.phone) throw new AppError("العملية ليس لديها رقم هاتف", "VALIDATION");

  const settings = await getSettings();
  const provider = getMessaging();
  const result = await provider.send({ phone: customer.phone, message: input.message.trim(), channel: input.channel });

  const log = await db.communicationLog.create({
    data: {
      customerId: input.customerId,
      followUpTaskId: input.followUpTaskId || null,
      channel: input.channel.toUpperCase() as never,
      message: input.message.trim(),
      status: result.status,
      providerRef: result.providerRef ?? null,
      error: result.error ?? null,
      sentById: actor.id,
    },
  });

  if (result.status === "SENT" && input.followUpTaskId) {
    await db.followUpTask.update({ where: { id: input.followUpTaskId }, data: { status: "CONTACTED", completedAt: new Date(), completedById: actor.id } });
  }

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "communication.send",
    entityType: "communication_log",
    entityId: log.id,
    after: { customerId: input.customerId, channel: input.channel, status: result.status, provider: settings.messagingChannel },
  });
  return { id: log.id };
}

export async function contactLog(actor: AuthUser, customerId?: string, page = 1, pageSize = 30) {
  const where: Record<string, unknown> = {};
  if (customerId) where.customerId = customerId;
  const [total, items] = await Promise.all([
    db.communicationLog.count({ where }),
    db.communicationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { id: true, fullName: true, phone: true } }, sentBy: { select: { name: true } } },
    }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
