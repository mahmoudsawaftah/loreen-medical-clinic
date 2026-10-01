import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, type SeedWorld } from "./setup";

const FAIL_PHONE = "0790000001";
process.env.MESSAGING_MOCK_FAIL_PHONES = FAIL_PHONE;

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

async function camp() {
  return import("@/server/services/campaign-service");
}

interface AudienceCustomer {
  id: string;
  fullName: string;
  phone: string;
  optedOut: boolean;
  birthDate?: Date | null;
  botox?: boolean;
}

/** Seeds N customers with the given audience attributes. */
async function seedCustomers(list: AudienceCustomer[]) {
  for (const c of list) {
    await db.customer.create({
      data: {
        fullName: c.fullName,
        phone: c.phone,
        marketingConsent: !c.optedOut,
        marketingOptOut: c.optedOut,
        marketingOptOutAt: c.optedOut ? new Date() : null,
        birthDate: c.birthDate ?? null,
      },
    });
    if (c.botox) {
      const cust = await db.customer.findFirst({ where: { fullName: c.fullName } });
      if (cust) {
        await db.customerMedicalEvent.create({
          data: { customerId: cust.id, procedureType: "بوتوكس - الجبهة", procedureDate: new Date(), createdById: w.doctor.id },
        });
      }
    }
  }
}

describe("campaigns-v3: audiences, consent, delivery", () => {
  it("preview counts are accurate: matched, valid phone, opted out, final", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "عميلة أ", phone: "0781111111", optedOut: false },
      { id: "seed-b", fullName: "عميلة ب", phone: FAIL_PHONE, optedOut: false },
      { id: "seed-c", fullName: "عميلة ج", phone: "", optedOut: false },
      { id: "seed-d", fullName: "عميلة د", phone: "0782222222", optedOut: true },
    ]);
    const { previewCampaign } = await camp();
    const preview = await previewCampaign(w.secretary, {
      name: "معاينة",
      audienceType: "ALL",
      messageTemplate: "مرحبًا {{patient_name}} في {{clinic_name}}",
    });
    expect(preview).toEqual({ matched: 5, validPhone: 4, optedOut: 1, final: 3, sample: "نور خالد" });
  });

  it("createCampaign persists the audience snapshot counts", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false },
      { id: "seed-b", fullName: "ب", phone: FAIL_PHONE, optedOut: false },
    ]);
    const { createCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, {
      name: "عرض الصيف",
      audienceType: "ALL",
      messageTemplate: "خصم 20% — {{clinic_name}}",
    });
    const row = await db.campaign.findUnique({ where: { id } });
    expect(row?.status).toBe("DRAFT");
    expect(row?.matchedCount).toBe(3);
    expect(row?.validPhoneCount).toBe(3);
    expect(row?.optedOutCount).toBe(0);
    expect(row?.recipientCount).toBe(3);
    expect(row?.createdById).toBe(w.secretary.id);
  });

  it("BOTOX audience resolves via medical events; template vars are rendered", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false, botox: true },
      { id: "seed-b", fullName: "ب", phone: "0782222222", optedOut: false },
    ]);
    const { previewCampaign, renderTemplate } = await camp();
    const preview = await previewCampaign(w.secretary, { name: "بوتوكس", audienceType: "BOTOX", messageTemplate: "x" });
    expect(preview.matched).toBe(1);
    const { getSettings } = await import("@/lib/settings");
    const settings = await getSettings();
    expect(await renderTemplate("أهلًا {{patient_name}} في {{clinic_name}}", "نور", "د. أحمد", settings)).toContain("نور");
  });

  it("a doctor (no campaign permission) cannot create or send campaigns, or read the log", async () => {
    const { createCampaign, sendCampaign, getCampaign } = await camp();
    const { listCommunicationLogs } = await import("@/server/services/messages-service");
    await expect(
      createCampaign(w.doctor, { name: "x", audienceType: "ALL", messageTemplate: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { id } = await createCampaign(w.secretary, { name: "x", audienceType: "ALL", messageTemplate: "x" });
    await expect(sendCampaign(w.doctor, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getCampaign(w.doctor, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listCommunicationLogs(w.doctor, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a test message goes only to the given number and never marks the campaign as sent", async () => {
    await seedCustomers([{ id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false }]);
    const { createCampaign, sendTestMessage, getCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "x", audienceType: "ALL", messageTemplate: "تجربة {{patient_name}}" });
    const result = await sendTestMessage(w.secretary, id, FAIL_PHONE);
    expect(result.status).toBe("FAILED");

    const campaign = await getCampaign(w.secretary, id);
    expect(campaign.status).toBe("DRAFT");
    expect(campaign.sentAt).toBeNull();
    const logs = await db.communicationLog.findMany({ where: { campaignId: id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe("PROMOTIONAL");
  });

  it("optimistic double submit (send now twice) sends only once", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false },
      { id: "seed-b", fullName: "ب", phone: FAIL_PHONE, optedOut: false },
    ]);
    const { createCampaign, sendCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "مرة واحدة", audienceType: "ALL", messageTemplate: "مرحبا" });
    const first = await sendCampaign(w.secretary, id);
    expect(first.status).toBe("PARTIAL_FAILURE");
    expect(first.total).toBe(3);

    await expect(sendCampaign(w.secretary, id)).rejects.toMatchObject({ code: "CONFLICT" });
    const recipients = await db.campaignRecipient.findMany({ where: { campaignId: id } });
    expect(recipients).toHaveLength(3);
    const logs = await db.communicationLog.count({ where: { campaignId: id, category: "PROMOTIONAL" } });
    expect(logs).toBe(3);
  });

  it("opted-out customers are excluded from sending (no recipient, no message)", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false },
      { id: "seed-d", fullName: "د", phone: "0782222222", optedOut: true },
    ]);
    const { createCampaign, sendCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "موافقة", audienceType: "ALL", messageTemplate: "مرحبا" });
    await sendCampaign(w.secretary, id);
    const recipients = await db.campaignRecipient.findMany({ where: { campaignId: id } });
    expect(recipients).toHaveLength(2);
    const optedRow = await db.customer.findFirst({ where: { fullName: "د" } });
    expect(recipients.some((r) => r.customerId === optedRow!.id)).toBe(false);
  });

  it("retry re-sends ONLY failed recipients", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false },
      { id: "seed-b", fullName: "ب", phone: FAIL_PHONE, optedOut: false },
    ]);
    const { resetMessagingProvider } = await import("@/lib/messaging");
    const { createCampaign, sendCampaign, retryFailedRecipients } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "إعادة", audienceType: "ALL", messageTemplate: "مرحبا" });

    process.env.MESSAGING_MOCK_FAIL_PHONES = FAIL_PHONE;
    resetMessagingProvider();
    await sendCampaign(w.secretary, id);
    const aRow = await db.customer.findFirst({ where: { fullName: "أ" } });
    const bRow = await db.customer.findFirst({ where: { fullName: "ب" } });
    expect((await db.campaignRecipient.findUnique({ where: { campaignId_customerId: { campaignId: id, customerId: aRow!.id } } }))?.status).toBe("SENT");
    expect((await db.campaignRecipient.findUnique({ where: { campaignId_customerId: { campaignId: id, customerId: bRow!.id } } }))?.status).toBe("FAILED");

    process.env.MESSAGING_MOCK_FAIL_PHONES = "";
    resetMessagingProvider();
    const retried = await retryFailedRecipients(w.secretary, id);
    expect(retried.retried).toBe(1);
    expect(retried.failed).toBe(0);
    expect((await db.campaignRecipient.findUnique({ where: { campaignId_customerId: { campaignId: id, customerId: bRow!.id } } }))?.status).toBe("SENT");
    expect((await db.campaignRecipient.findUnique({ where: { campaignId_customerId: { campaignId: id, customerId: bRow!.id } } }))?.retriedAt).toBeTruthy();

    const logsA = await db.communicationLog.count({ where: { campaignId: id, customerId: aRow!.id } });
    expect(logsA).toBe(1);

    await expect(retryFailedRecipients(w.secretary, id)).rejects.toThrow("لا يوجد مستلمون فاشلون");
  });

  it("schedule → scheduled; cancel a scheduled/draft campaign; cannot cancel sent ones", async () => {
    await seedCustomers([{ id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false }]);
    const { createCampaign, scheduleCampaign, cancelCampaign, sendCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "مجدولة", audienceType: "ALL", messageTemplate: "مرحبا" });
    await scheduleCampaign(w.secretary, id, "2026-08-20T09:00:00");
    expect((await db.campaign.findUnique({ where: { id } }))?.status).toBe("SCHEDULED");

    await cancelCampaign(w.secretary, id);
    expect((await db.campaign.findUnique({ where: { id } }))?.status).toBe("CANCELLED");
    expect((await db.campaign.findUnique({ where: { id } }))?.cancelledById).toBe(w.secretary.id);

    const { id: id2 } = await createCampaign(w.secretary, { name: "أخرى", audienceType: "ALL", messageTemplate: "مرحبا" });
    await sendCampaign(w.secretary, id2);
    await expect(cancelCampaign(w.secretary, id2)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("final statuses: COMPLETED when all deliver, PARTIAL_FAILURE otherwise", async () => {
    await seedCustomers([
      { id: "seed-a", fullName: "أ", phone: "0781111111", optedOut: false },
      { id: "seed-b", fullName: "ب", phone: FAIL_PHONE, optedOut: false },
    ]);
    const { resetMessagingProvider } = await import("@/lib/messaging");
    const { createCampaign, sendCampaign } = await camp();
    const { id } = await createCampaign(w.secretary, { name: "جزئي", audienceType: "ALL", messageTemplate: "مرحبا" });
    process.env.MESSAGING_MOCK_FAIL_PHONES = FAIL_PHONE;
    resetMessagingProvider();
    const partial = await sendCampaign(w.secretary, id);
    expect(partial.status).toBe("PARTIAL_FAILURE");

    const { id: id2 } = await createCampaign(w.secretary, { name: "كامل", audienceType: "ALL", messageTemplate: "مرحبا" });
    process.env.MESSAGING_MOCK_FAIL_PHONES = "";
    resetMessagingProvider();
    const complete = await sendCampaign(w.secretary, id2);
    expect(complete.status).toBe("COMPLETED");
    expect(complete.failed).toBe(0);
  });
});