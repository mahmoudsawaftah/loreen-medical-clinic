import "server-only";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getMessaging } from "@/lib/messaging";
import { getSettings } from "@/lib/settings";
import { assertPermission } from "@/lib/permissions";
import { GRANULAR_PERMISSIONS } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Promotional campaigns (V3).
 * - Audience selectors resolve against patient profiles (phone-based).
 * - marketingOptOut=true patients are ALWAYS excluded from promotional sends.
 * - Transactional communication (follow-ups, reminders) is NOT affected.
 * - Sending is idempotent: an atomic DRAFT/SCHEDULED -> SENDING claim prevents
 *   double-submit; retries only touch FAILED recipients.
 */

import {
  type AudienceType,
  AUDIENCE_LABELS,
  type CampaignInput,
  type CampaignPreview,
  hasValidPhone,
  CAMPAIGN_STATUS_LABELS,
} from "@/lib/campaigns";

/** How far recipients are distributed across a promotional send. */

function matchesBotoxish(s: string): boolean {
  const t = s.toLowerCase();
  return t.includes("بوتوكس") || t.includes("botox");
}

function matchesFiller(s: string): boolean {
  const t = s.toLowerCase();
  return t.includes("فيلر") || t.includes("filler");
}

async function resolveAudience(type: AudienceType, doctorId?: string | null, customerIds?: string[]): Promise<{ id: string; fullName: string; phone: string | null; marketingOptOut: boolean }[]> {
  const select = { id: true, fullName: true, phone: true, marketingOptOut: true };
  switch (type) {
    case "ALL": {
      return db.customer.findMany({ where: { status: "ACTIVE" }, select });
    }
    case "BOTOX":
    case "FILLER": {
      const matcher = type === "BOTOX" ? matchesBotoxish : matchesFiller;
      const [eventRows, profileRows] = await Promise.all([
        db.customerMedicalEvent.findMany({ select: { customerId: true, procedureType: true } }),
        db.customerMedicalProfile.findMany({ select: { customerId: true, previousProcedures: true } }),
      ]);
      const ids = new Set<string>();
      for (const e of eventRows) if (matcher(e.procedureType)) ids.add(e.customerId);
      for (const p of profileRows) if (p.previousProcedures.some((x) => matcher(x))) ids.add(p.customerId);
      if (ids.size === 0) return [];
      return db.customer.findMany({ where: { id: { in: [...ids] }, status: "ACTIVE" }, select });
    }
    case "NEW": {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return db.customer.findMany({ where: { createdAt: { gte: since }, status: "ACTIVE" }, select });
    }
    case "RETURNING": {
      const grouped = await db.visit.groupBy({
        by: ["customerId"],
        having: { customerId: { _count: { gte: 2 } } },
      });
      const ids = grouped.map((g) => g.customerId);
      if (ids.length === 0) return [];
      return db.customer.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select });
    }
    case "INACTIVE": {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const active = await db.visit.findMany({ where: { createdAt: { gte: cutoff } }, select: { customerId: true }, distinct: ["customerId"] });
      const activeIds = new Set(active.map((v) => v.customerId));
      const all = await db.customer.findMany({ where: { status: "ACTIVE" }, select });
      return all.filter((c) => !activeIds.has(c.id));
    }
    case "BIRTHDAY": {
      const all = await db.customer.findMany({ where: { birthDate: { not: null }, status: "ACTIVE" }, select: { ...select, birthDate: true } });
      const today = new Date();
      const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14);
      return all.filter((c) => {
        const bd = c.birthDate!;
        const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        return next <= horizon;
      }).map(({ birthDate: _bd, ...rest }) => rest);
    }
    case "DOCTOR": {
      if (!doctorId) return [];
      const visited = await db.visit.findMany({ where: { doctorId }, select: { customerId: true }, distinct: ["customerId"] });
      const ids = visited.map((v) => v.customerId);
      if (ids.length === 0) return [];
      return db.customer.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select });
    }
    case "MANUAL": {
      const ids = customerIds ?? [];
      if (ids.length === 0) return [];
      return db.customer.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select });
    }
  }
}

export async function previewCampaign(actor: AuthUser, input: CampaignInput): Promise<CampaignPreview> {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE);
  if (!input.name.trim()) throw new AppError("اسم الحملة مطلوب", "VALIDATION");
  if (!input.messageTemplate.trim()) throw new AppError("نص الرسالة مطلوب", "VALIDATION");
  const customers = await resolveAudience(input.audienceType, input.doctorId, input.customerIds);
  const matched = customers.length;
  const validPhone = customers.filter((c) => c.phone && hasValidPhone(c.phone)).length;
  const optedOut = customers.filter((c) => c.marketingOptOut).length;
  const final = customers.filter((c) => c.phone && hasValidPhone(c.phone) && !c.marketingOptOut).length;
  const sample = customers[0]?.fullName ?? "";
  return { matched, validPhone, optedOut, final, sample };
}

export async function createCampaign(actor: AuthUser, input: CampaignInput): Promise<{ id: string }> {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE);
  const counts = await previewCampaign(actor, input);
  const campaign = await db.campaign.create({
    data: {
      name: input.name.trim(),
      audienceType: input.audienceType,
      audienceParams: { doctorId: input.doctorId ?? null, customerIds: input.customerIds ?? [] },
      messageTemplate: input.messageTemplate.trim(),
      createdById: actor.id,
      matchedCount: counts.matched,
      validPhoneCount: counts.validPhone,
      optedOutCount: counts.optedOut,
      recipientCount: counts.final,
    },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "campaign.create",
    entityType: "campaign",
    entityId: campaign.id,
    after: { name: campaign.name, audienceType: campaign.audienceType, counts },
  });
  return { id: campaign.id };
}

export async function listCampaigns(actor: AuthUser) {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_READ);
  return db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}

export async function getCampaign(actor: AuthUser, campaignId: string) {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_READ);
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { createdBy: { select: { name: true } }, recipients: { orderBy: { createdAt: "asc" }, include: { customer: { select: { fullName: true } } } } },
  });
  assertFound(campaign, "الحملة غير موجودة");
  return campaign;
}

export async function renderTemplate(template: string, patientName: string, doctorName: string, settings: Awaited<ReturnType<typeof getSettings>>): Promise<string> {
  const today = new Date().toLocaleDateString("ar-JO");
  return template
    .replace(/\{\{patient_name\}\}/g, patientName)
    .replace(/\{\{clinic_name\}\}/g, settings.clinicName)
    .replace(/\{\{doctor_name\}\}/g, doctorName)
    .replace(/\{\{date\}\}/g, today);
}

async function doctorNameFor(customerId: string): Promise<string> {
  const visit = await db.visit.findFirst({
    where: { customerId, doctorId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { doctor: { select: { name: true } } },
  });
  return visit?.doctor?.name ?? "";
}

async function ensureCampaignSendPermission(actor: AuthUser): Promise<void> {
  assertPermission(actor, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
}

/** Test send: goes ONLY to the provided test number; never marks the campaign as sent. */
export async function sendTestMessage(actor: AuthUser, campaignId: string, testPhone: string): Promise<{ status: string }> {
  await ensureCampaignSendPermission(actor);
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertFound(campaign, "الحملة غير موجودة");
  if (!hasValidPhone(testPhone)) throw new AppError("رقم الاختبار غير صالح", "VALIDATION");

  const settings = await getSettings();
  const message = await renderTemplate(campaign.messageTemplate, "عميلة تجريبية", "", settings);
  const provider = getMessaging();
  const result = await provider.send({ phone: testPhone, message, channel: "whatsapp" });

  const anchor = (await firstRecipientCustomerId(campaign.id)) ?? (await db.customer.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!anchor) throw new AppError("لا يوجد عملاء في النظام لربط رسالة الاختبار", "VALIDATION");
  await db.communicationLog.create({
    data: {
      customerId: anchor,
      campaignId: campaign.id,
      category: "PROMOTIONAL",
      channel: "WHATSAPP",
      message,
      status: result.status,
      providerRef: result.providerRef ?? null,
      error: result.error ?? null,
      sentById: actor.id,
    },
  });
  return { status: result.status };
}

async function firstRecipientCustomerId(campaignId: string): Promise<string | null> {
  const r = await db.campaignRecipient.findFirst({ where: { campaignId }, select: { customerId: true } });
  return r?.customerId ?? null;
}

/** Schedule: DRAFT -> SCHEDULED with a target time. */
export async function scheduleCampaign(actor: AuthUser, campaignId: string, scheduledFor: string): Promise<void> {
  await ensureCampaignSendPermission(actor);
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertFound(campaign, "الحملة غير موجودة");
  if (campaign.status !== "DRAFT") throw new AppError("يمكن جدولة الحملات المسودة فقط", "CONFLICT");
  const at = new Date(scheduledFor);
  if (Number.isNaN(at.getTime())) throw new AppError("تاريخ الإرسال غير صالح", "VALIDATION");
  await db.campaign.update({ where: { id: campaignId }, data: { status: "SCHEDULED", scheduledFor: at } });
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "campaign.schedule", entityType: "campaign", entityId: campaignId, after: { scheduledFor: at.toISOString() } });
}

export async function cancelCampaign(actor: AuthUser, campaignId: string): Promise<void> {
  await ensureCampaignSendPermission(actor);
  const updated = await db.campaign.updateMany({
    where: { id: campaignId, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.id },
  });
  if (updated.count === 0) throw new AppError("لا يمكن إلغاء حملة أُرسلت أو جارٍ إرسالها", "CONFLICT");
  await writeAudit({ userId: actor.id, userRole: actor.role, action: "campaign.cancel", entityType: "campaign", entityId: campaignId, after: { status: "CANCELLED" } });
}

const PROVIDER_TO_LOG: Record<string, "SENT" | "FAILED" | "SKIPPED"> = {
  SENT: "SENT",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED",
};

async function deliverRecipients(actor: AuthUser, campaignId: string, template: string, recipientIds: string[]): Promise<number> {
  const settings = await getSettings();
  const provider = getMessaging();
  const recipients = await db.campaignRecipient.findMany({ where: { id: { in: recipientIds } }, include: { customer: { select: { fullName: true } } } });
  let failed = 0;
  for (const r of recipients) {
    const message = await renderTemplate(template, r.customer.fullName, await doctorNameFor(r.customerId), settings);
    const result = await provider.send({ phone: r.phone, message, channel: "whatsapp" });
    if (result.status === "FAILED") failed++;
    await db.campaignRecipient.update({ where: { id: r.id }, data: { status: result.status === "SENT" ? "SENT" : "FAILED", providerRef: result.providerRef ?? null, error: result.error ?? null, sentAt: new Date() } });
    await db.communicationLog.create({
      data: {
        customerId: r.customerId,
        campaignId,
        category: "PROMOTIONAL",
        channel: "WHATSAPP",
        message,
        status: PROVIDER_TO_LOG[result.status] ?? "SKIPPED",
        providerRef: result.providerRef ?? null,
        error: result.error ?? null,
        sentById: actor.id,
      },
    });
  }
  return failed;
}

/**
 * Send Now (idempotent). The atomic claim DRAFT/SCHEDULED -> SENDING means a
 * double click or a retry can never send the campaign twice; recipients are
 * snapshotted once. Final status: COMPLETED or PARTIAL_FAILURE.
 */
export async function sendCampaign(actor: AuthUser, campaignId: string): Promise<{ status: string; total: number; failed: number }> {
  await ensureCampaignSendPermission(actor);
  const claimed = await db.campaign.updateMany({
    where: { id: campaignId, status: { in: ["DRAFT", "SCHEDULED"] } },
    data: { status: "SENDING" },
  });
  if (claimed.count === 0) throw new AppError("الحملة أُرسلت مسبقًا أو ليست في حالة قابلة للإرسال", "CONFLICT");

  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertFound(campaign, "الحملة غير موجودة");

  const customers = await resolveAudience(campaign.audienceType as AudienceType, (campaign.audienceParams as { doctorId?: string | null } | null)?.doctorId, (campaign.audienceParams as { customerIds?: string[] } | null)?.customerIds);
  const eligible = customers.filter((c) => c.phone && hasValidPhone(c.phone) && !c.marketingOptOut);
  if (eligible.length === 0) {
    await db.campaign.update({ where: { id: campaignId }, data: { status: "DRAFT" } });
    throw new AppError("لا يوجد مستلمون مؤهلون في هذه الحملة", "VALIDATION");
  }

  await db.campaignRecipient.createMany({
    data: eligible.map((c) => ({ campaignId, customerId: c.id, phone: c.phone! })),
    skipDuplicates: true,
  });
  const recipients = await db.campaignRecipient.findMany({ where: { campaignId, status: "QUEUED" }, select: { id: true } });
  const failed = await deliverRecipients(actor, campaignId, campaign.messageTemplate, recipients.map((r) => r.id));

  const finalStatus = failed > 0 ? "PARTIAL_FAILURE" : "COMPLETED";
  await db.campaign.update({
    where: { id: campaignId },
    data: { status: finalStatus, sentAt: new Date(), recipientCount: recipients.length },
  });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "campaign.send",
    entityType: "campaign",
    entityId: campaignId,
    after: { status: finalStatus, total: recipients.length, failed },
  });
  return { status: finalStatus, total: recipients.length, failed };
}

/** Resend ONLY failed recipients; successful recipients are never touched. */
export async function retryFailedRecipients(actor: AuthUser, campaignId: string): Promise<{ status: string; retried: number; failed: number }> {
  await ensureCampaignSendPermission(actor);
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  assertFound(campaign, "الحملة غير موجودة");
  if (campaign.status !== "COMPLETED" && campaign.status !== "PARTIAL_FAILURE") {
    throw new AppError("إعادة الإرسال متاحة فقط بعد اكتمال الإرسال", "CONFLICT");
  }
  const failedRecipients = await db.campaignRecipient.findMany({ where: { campaignId, status: "FAILED" }, select: { id: true } });
  if (failedRecipients.length === 0) throw new AppError("لا يوجد مستلمون فاشلون لإعادة الإرسال", "VALIDATION");
  await db.campaignRecipient.updateMany({ where: { id: { in: failedRecipients.map((r) => r.id) } }, data: { status: "QUEUED", retriedAt: new Date(), error: null } });

  const stillFailed = await deliverRecipients(actor, campaignId, campaign.messageTemplate, failedRecipients.map((r) => r.id));
  const finalStatus = stillFailed > 0 ? "PARTIAL_FAILURE" : "COMPLETED";
  await db.campaign.update({ where: { id: campaignId }, data: { status: finalStatus, sentAt: new Date() } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "campaign.retry",
    entityType: "campaign",
    entityId: campaignId,
    after: { retried: failedRecipients.length, failed: stillFailed, status: finalStatus },
  });
  return { status: finalStatus, retried: failedRecipients.length, failed: stillFailed };
}
