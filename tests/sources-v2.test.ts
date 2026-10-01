import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, createVisitToCompletion, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";

let w: SeedWorld;

beforeEach(async () => { w = await seedWorld(); });

describe("customer acquisition sources (V2)", () => {
  it("creates, lists and rejects duplicate source names", async () => {
    const { createCustomerSource, listCustomerSources } = await import("@/server/services/customer-source-service");
    const created = await createCustomerSource(w.owner, { name: "إنستغرام" });
    expect(created.id).toBeTruthy();
    await expect(createCustomerSource(w.owner, { name: "إنستغرام" })).rejects.toThrow(AppError);
    const list = await listCustomerSources(w.owner);
    expect(list.some((s) => s.name === "إنستغرام")).toBe(true);
  });

  it("links patients to sources and reports new patients + billed amounts", async () => {
    const { createCustomerSource, marketingReport } = await import("@/server/services/customer-source-service");
    const { createPatient } = await import("@/server/services/patient-service");
    const { sendToCashier } = await import("@/server/services/treatment-service");

    const source = await createCustomerSource(w.owner, { name: "إعلان فيسبوك" });
    const { id } = await createPatient(w.secretary, { fullName: "سارة أحمد", phone: "0785556667", sourceId: source.id, sourceNote: "إعلان شهر رمضان" });
    const saved = await db.customer.findUnique({ where: { id } });
    expect(saved?.sourceId).toBe(source.id);
    expect(saved?.sourceNote).toBe("إعلان شهر رمضان");

    const visitId = await createVisitToCompletion(w, 150);
    await db.visit.update({ where: { id: visitId }, data: { customerId: id } });
    await sendToCashier(w.doctor, visitId);

    const report = await marketingReport(w.owner, {});
    const row = report.bySource.find((s) => s.id === source.id);
    expect(row?.newCustomers).toBe(1);
    const bills = await db.invoice.findMany({ where: { customerId: id, status: { not: "VOID" } } });
    expect(row?.billedAmount).toBe(bills.reduce((a, i) => a + i.finalAmount.toNumber(), 0));
  });

  it("records referral links between patients and lists them in the report", async () => {
    const { createPatient } = await import("@/server/services/patient-service");
    const { marketingReport } = await import("@/server/services/customer-source-service");
    const first = await createPatient(w.secretary, { fullName: "لينا علي", phone: "0798887776" });
    const second = await createPatient(w.secretary, { fullName: "ميرا علي", phone: "0791112223", referrerCustomerId: first.id });
    const report = await marketingReport(w.owner, {});
    expect(report.referred.some((r) => r.id === second.id && r.referrer?.id === first.id)).toBe(true);
  });

  it("rejects inactive sources and missing referrers", async () => {
    const { createCustomerSource } = await import("@/server/services/customer-source-service");
    const { createPatient } = await import("@/server/services/patient-service");
    const source = await createCustomerSource(w.owner, { name: "تويتر" });
    await db.customerSource.update({ where: { id: source.id }, data: { active: false } });
    await expect(createPatient(w.secretary, { fullName: "هدى سامي", phone: "0792223334", sourceId: source.id })).rejects.toThrow(AppError);
    await expect(createPatient(w.secretary, { fullName: "راما عادل", phone: "0793334445", referrerCustomerId: "no-such-id" })).rejects.toThrow(AppError);
  });
});