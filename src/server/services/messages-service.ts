import { GRANULAR_PERMISSIONS, assertPermission } from "@/lib/permissions";
import { db } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/authorize";

export interface CommunicationLogFilters {
  category?: string | null;
  channel?: string | null;
  campaignId?: string | null;
  customerId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export async function listCommunicationLogs(actor: AuthUser, filters: CommunicationLogFilters = {}) {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_READ);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 50));
  const where: Record<string, unknown> = {};
  if (filters.category) where.category = filters.category;
  if (filters.channel) where.channel = filters.channel;
  if (filters.campaignId) where.campaignId = filters.campaignId;
  if (filters.customerId) where.customerId = filters.customerId;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) {
      const from = new Date(filters.from);
      if (!Number.isNaN(from.getTime())) range.gte = from;
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (!Number.isNaN(to.getTime())) range.lte = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
    }
    if (Object.keys(range).length > 0) where.sentAt = range;
  }

  const [items, total] = await Promise.all([
    db.communicationLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { id: true, fullName: true, phone: true } }, sentBy: { select: { name: true } }, campaign: { select: { id: true, name: true } } },
    }),
    db.communicationLog.count({ where }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
