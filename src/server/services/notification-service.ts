import "server-only";
import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS, hasPermission } from "@/lib/permissions";

export const NOTIFICATION_TYPES = {
  VISIT_ASSIGNED: "VISIT_ASSIGNED",
  TREATMENT_COMPLETED: "TREATMENT_COMPLETED",
  SECRETARY_TASK: "SECRETARY_TASK",
  PRICE_CHANGED: "PRICE_CHANGED",
  OTHER: "OTHER",
} as const;

export interface CreateNotificationInput {
  recipientId: string;
  title: string;
  body?: string | null;
  type?: string;
  entityType?: string | null;
  entityId?: string | null;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  if (input.recipientId === "owner") return;
  await db.notification.create({
    data: {
      recipientId: input.recipientId,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? NOTIFICATION_TYPES.OTHER,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    },
  });
}

/** Notifies all active secretaries (reception desk) — used when a doctor completes a session. */
export async function notifySecretaries(input: Omit<CreateNotificationInput, "recipientId">): Promise<void> {
  const secretaries = await db.user.findMany({ where: { role: "SECRETARY", status: "ACTIVE" }, select: { id: true } });
  await db.notification.createMany({
    data: secretaries.map((s) => ({
      recipientId: s.id,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? NOTIFICATION_TYPES.OTHER,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
}

/** Ensures today's pending secretary tasks produce one in-app notification per recipient. */
export async function syncDueSecretaryTaskNotifications(now = new Date()): Promise<void> {
  const secretaries = await db.user.findMany({ where: { role: "SECRETARY", status: "ACTIVE" }, select: { id: true } });
  if (secretaries.length === 0) return;

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const secretaryIds = secretaries.map((s) => s.id);
  const tasks = await db.followUpTask.findMany({
    where: {
      dueDate: { lte: endOfToday },
      status: { in: ["PENDING", "NO_ANSWER"] },
      OR: [{ assignedToId: null }, { assignedToId: { in: secretaryIds } }],
    },
    include: {
      customer: { select: { fullName: true } },
      appointmentVisit: { select: { scheduledAt: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 200,
  });
  if (tasks.length === 0) return;

  const existing = await db.notification.findMany({
    where: {
      recipientId: { in: secretaryIds },
      type: NOTIFICATION_TYPES.SECRETARY_TASK,
      entityType: "follow_up",
      entityId: { in: tasks.map((task) => task.id) },
    },
    select: { recipientId: true, entityId: true },
  });
  const existingKeys = new Set(existing.map((item) => `${item.recipientId}:${item.entityId}`));
  const data: {
    recipientId: string;
    title: string;
    body: string;
    type: string;
    entityType: string;
    entityId: string;
  }[] = [];

  for (const task of tasks) {
    const recipients = task.assignedToId ? [task.assignedToId] : secretaryIds;
    const appointmentText = task.appointmentVisit?.scheduledAt
      ? ` — الموعد ${task.appointmentVisit.scheduledAt.toLocaleDateString("ar-JO")}`
      : "";
    for (const recipientId of recipients) {
      if (existingKeys.has(`${recipientId}:${task.id}`)) continue;
      data.push({
        recipientId,
        title: "مهمة سكرتيرة مستحقة",
        body: `${task.customer.fullName}${appointmentText} — تواصل/تذكير مطلوب اليوم`,
        type: NOTIFICATION_TYPES.SECRETARY_TASK,
        entityType: "follow_up",
        entityId: task.id,
      });
    }
  }

  if (data.length > 0) await db.notification.createMany({ data });
}

/** Notifies the doctor assigned to a visit (and the owner when the doctor is not the owner). */
export async function notifyDoctor(input: Omit<CreateNotificationInput, "recipientId">, doctorId: string, actorId: string): Promise<void> {
  const doctor = await db.user.findUnique({ where: { id: doctorId }, select: { role: true, id: true } });
  if (!doctor || doctor.id === actorId) return;
  await createNotification({ ...input, recipientId: doctor.id });
}

/** Notifies the clinic owner (Dr. Ahmad) — used for closing submission and other Owner alerts. */
export async function notifyOwner(input: Omit<CreateNotificationInput, "recipientId"> & { actorId?: string }): Promise<void> {
  const owner = await db.user.findFirst({ where: { role: "OWNER", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!owner || owner.id === input.actorId) return;
  await createNotification({ ...input, recipientId: owner.id });
}

/** Notifies active owners/main doctors about a receptionist price change without approval gating. */
export async function notifyPricingManagers(input: Omit<CreateNotificationInput, "recipientId"> & { actorId?: string }): Promise<void> {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", role: { in: ["OWNER", "MAIN_DOCTOR", "DOCTOR"] } },
    select: { id: true, role: true, permissionOverrides: true },
  });
  const recipients = users.filter((user) => user.id !== input.actorId && hasPermission(user, GRANULAR_PERMISSIONS.PRICING_DISCOUNT));
  if (recipients.length === 0) return;
  await db.notification.createMany({
    data: recipients.map((recipient) => ({
      recipientId: recipient.id,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? NOTIFICATION_TYPES.PRICE_CHANGED,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
}

/** Returns unread notification count for the current user. */
export async function getUnreadNotificationCount(actor: AuthUser): Promise<number> {
  return db.notification.count({ where: { recipientId: actor.id, readAt: null } });
}

export async function listNotifications(actor: AuthUser, limit = 30): Promise<{ id: string; title: string; body: string | null; type: string; entityType: string | null; entityId: string | null; readAt: Date | null; createdAt: Date }[]> {
  const items = await db.notification.findMany({
    where: { recipientId: actor.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, body: true, type: true, entityType: true, entityId: true, readAt: true, createdAt: true },
  });
  return items;
}

export async function markNotificationsRead(actor: AuthUser, ids?: string[]): Promise<void> {
  await db.notification.updateMany({
    where: { recipientId: actor.id, ...(ids && ids.length > 0 ? { id: { in: ids } } : { readAt: null }) },
    data: { readAt: new Date() },
  });
}
