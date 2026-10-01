import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, db, fakeUser, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";
import { roleHasPermission, hardBlockedFor, hasPermission, GRANULAR_PERMISSIONS, PERMISSIONS, effectivePermissions } from "@/lib/permissions";
import { NAV, itemVisible, navItemsFor } from "@/lib/navigation";

let w: SeedWorld;
let main: ReturnType<typeof fakeUser>;

beforeEach(async () => {
  w = await seedWorld();
  const mainRow = await db.user.create({
    data: { username: "dr.sameh-main", name: "د. سامح", role: "MAIN_DOCTOR", passwordHash: "x" },
  });
  main = fakeUser("dr.sameh-main", "د. سامح", "MAIN_DOCTOR", mainRow.id);
});

/** REGISTERED visit assigned to the plain doctor. */
async function registeredVisit(doctorId: string | null = w.doctor.id) {
  const { createVisit } = await import("@/server/services/visit-service");
  return createVisit(w.secretary, { customerId: w.customerId, doctorId, notes: null });
}

describe("clinical workflow: MAIN_DOCTOR role & permission preset", () => {
  it("MAIN_DOCTOR preset grants doctor powers + pricing/discount + finance viewing", () => {
    expect(roleHasPermission("MAIN_DOCTOR", PERMISSIONS.TREATMENT_PRICE)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", PERMISSIONS.BILLING_DISCOUNT)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it("MAIN_DOCTOR has NO end-of-day permissions by default (prepare/review/approve)", () => {
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(false);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
  });

  it("Owner can grant closing.review/closing.approve to Dr. Sameh — no hard-block overrides the grant", () => {
    const granted = { ...main, permissionOverrides: [...main.permissionOverrides, "GRANT:closing.review", "GRANT:closing.approve"] };
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(true);
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
  });

  it("revoking the grants hides the closing feature again", () => {
    const revoked = { ...main, permissionOverrides: [...main.permissionOverrides.filter((e) => !e.startsWith("GRANT:closing.") && !e.startsWith("DENY:closing.")), "DENY:closing.review", "DENY:closing.approve"] };
    expect(hasPermission(revoked, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hasPermission(revoked, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
    const nav = navItemsFor({ role: revoked.role, permissions: effectivePermissions(revoked) });
    expect(nav.some((n) => n.href === "/closing")).toBe(false);
  });

  it("closing feature appears in Sameh's nav only after an explicit grant", () => {
    const blocked = navItemsFor({ role: main.role, permissions: effectivePermissions(main) });
    expect(blocked.some((n) => n.href === "/closing")).toBe(false);
    const granted = { ...main, permissionOverrides: [...main.permissionOverrides, "GRANT:closing.review"] };
    const visible = navItemsFor({ role: granted.role, permissions: effectivePermissions(granted) });
    expect(visible.some((n) => n.href === "/closing")).toBe(true);
  });

  it("plain DOCTOR / SECRETARY / ACCOUNTANT have no discount permission by default", () => {
    expect(roleHasPermission("DOCTOR", GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(false);
    expect(roleHasPermission("SECRETARY", GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(false);
    expect(roleHasPermission("ACCOUNTANT", GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(false);
    expect(roleHasPermission("SECRETARY", PERMISSIONS.TREATMENT_PRICE)).toBe(false);
  });

  it("MAIN_DOCTOR is hard-blocked from finance/payroll/users/settings/purchases-approve", () => {
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.FINANCIAL_PROFITS)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", PERMISSIONS.USERS_MANAGE)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.PURCHASES_APPROVE)).toBe(true);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(false);
  });

  it("SERVICES_* are hard-blocked for ACCOUNTANT/DOCTOR/SECRETARY but not MAIN_DOCTOR", () => {
    for (const code of [GRANULAR_PERMISSIONS.SERVICES_CREATE, GRANULAR_PERMISSIONS.SERVICES_EDIT, GRANULAR_PERMISSIONS.SERVICES_DISABLE] as const) {
      expect(hardBlockedFor("ACCOUNTANT", code)).toBe(true);
      expect(hardBlockedFor("DOCTOR", code)).toBe(true);
      expect(hardBlockedFor("SECRETARY", code)).toBe(true);
      expect(hardBlockedFor("MAIN_DOCTOR", code)).toBe(false);
    }
  });

  it("MAIN_DOCTOR account resolves permission via role preset and nav shows the new items", () => {
    expect(hasPermission(main, GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(true);
    expect(hasPermission(main, GRANULAR_PERMISSIONS.TREATMENTS_CREATE)).toBe(true);
    expect(hasPermission(main, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL)).toBe(false);
    const servicesItem = NAV.find((n) => n.href === "/services");
    const todayItem = NAV.find((n) => n.href === "/today");
    expect(itemVisible(servicesItem!, { role: "MAIN_DOCTOR", permissions: ["services.read"] })).toBe(true);
    expect(itemVisible(todayItem!, { role: "MAIN_DOCTOR", permissions: ["appointments.read"] })).toBe(true);
    expect(itemVisible(NAV.find((n) => n.href === "/payroll")!, { role: "MAIN_DOCTOR", permissions: [] })).toBe(false);
  });
});

describe("clinical workflow: service catalog", () => {
  it("owner/main doctor creates and lists a service; empty name rejected", async () => {
    const { createService, listServices } = await import("@/server/services/service-catalog-service");
    await createService(w.owner, { name: "حقن بوتوكس الجبهة", englishName: "Botox", category: "حقن", defaultPrice: 120, durationMinutes: 20, notes: "منطقة أمامية" });
    const res = await listServices(w.owner, { query: "بوتوكس" });
    expect(res.total).toBe(1);
    expect(res.items[0].defaultPrice?.toNumber()).toBe(120);
    await expect(createService(w.owner, { name: "  " })).rejects.toThrow(AppError);
  });

  it("updateService edits price and audit is written", async () => {
    const { createService, updateService } = await import("@/server/services/service-catalog-service");
    const { id } = await createService(w.owner, { name: "تقشير كيميائي", defaultPrice: 50 });
    await updateService(w.owner, id, { name: "تقشير كيميائي", defaultPrice: 55 });
    const row = await db.service.findUnique({ where: { id } });
    expect(row?.defaultPrice?.toNumber()).toBe(55);
    const audit = await db.auditLog.findFirst({ where: { entityId: id, action: "service.update" } });
    expect(audit).toBeTruthy();
  });

  it("unreferenced service is hard-deleted; referenced one is disabled with CONFLICT", async () => {
    const { createService, deleteService, listServices } = await import("@/server/services/service-catalog-service");
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const orphan = await createService(w.owner, { name: "خدمة يتيمة", defaultPrice: 10 });
    await deleteService(w.owner, orphan.id);
    expect((await listServices(w.owner, { query: "يتيمة" })).total).toBe(0);

    const referenced = await createService(w.owner, { name: "بروفايلو", defaultPrice: 120 });
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: referenced.id, description: "بروفايلو", linePrice: 120 }],
      materials: [],
      basePrice: 120,
    });
    await expect(deleteService(w.owner, referenced.id)).rejects.toThrow(AppError);
    const row = await db.service.findUnique({ where: { id: referenced.id } });
    expect(row?.active).toBe(false);
  });

  it("setServiceActive toggles visibility for activeOnly listings", async () => {
    const { createService, setServiceActive, listServices } = await import("@/server/services/service-catalog-service");
    const { id } = await createService(w.owner, { name: "جلسة فيلر", defaultPrice: 180 });
    await setServiceActive(w.owner, id, false);
    const active = await listServices(w.owner, { activeOnly: true, query: "فيلر" });
    expect(active.total).toBe(0);
    const all = await listServices(w.owner, { query: "فيلر" });
    expect(all.total).toBe(1);
  });

  it("catalog supports materials recipe JSON round-trip", async () => {
    const { createService, listServices } = await import("@/server/services/service-catalog-service");
    await createService(w.owner, { name: "بلازما", defaultMaterials: [{ name: "قفازات", qty: 2, unit: "حبة" }, { name: "أنبوب دم", qty: 1, unit: "وحدة" }] });
    const res = await listServices(w.owner, { query: "بلازما" });
    const mats = res.items[0].defaultMaterials as { name: string; qty: string | number }[];
    expect(mats).toHaveLength(2);
    expect(mats[0].name).toBe("قفازات");
  });
});

describe("clinical workflow: medication catalog", () => {
  it("creates and finds a medication via autocomplete search", async () => {
    const { createMedication } = await import("@/server/services/medication-service");
    const { searchMedications } = await import("@/server/services/medication-service");
    await createMedication(main, { name: "ليدوكايين موضعي 2%", form: "كريم", notes: "قبل الحقن" });
    const found = await searchMedications("ليدو");
    expect(found.some((m) => m.name.includes("ليدوكايين"))).toBe(true);
    const empty = await searchMedications("zzz-غير-موجود");
    expect(empty).toHaveLength(0);
  });

  it("disableMedication hides it from autocomplete and rejects empty names", async () => {
    const { createMedication, disableMedication } = await import("@/server/services/medication-service");
    const { searchMedications } = await import("@/server/services/medication-service");
    const { id } = await createMedication(main, { name: "إيبوبروفين 400mg" });
    await disableMedication(main, id, true);
    expect(await searchMedications("إيبوبروفين")).toHaveLength(0);
    await expect(createMedication(main, { name: "" })).rejects.toThrow(AppError);
  });
});

describe("clinical workflow: doctor assignment, queue and notifications", () => {
  it("creating a visit with an assigned doctor notifies that doctor", async () => {
    const { createVisit } = await import("@/server/services/visit-service");
    await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
    const notif = await db.notification.findFirst({ where: { recipientId: w.doctor.id } });
    expect(notif).toBeTruthy();
    expect(notif?.entityType).toBe("visit");
  });

  it("creating a visit without a doctor produces no notification", async () => {
    const { createVisit } = await import("@/server/services/visit-service");
    await createVisit(w.secretary, { customerId: w.customerId, doctorId: null, notes: null });
    expect(await db.notification.count()).toBe(0);
  });

  it("only the assigned doctor (or owner) can start the session; unassigned visits are claimed", async () => {
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { id: assigned } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, assigned);
    await expect(startWithDoctor(w.mainDoctor, assigned)).rejects.toThrow(AppError);
    await startWithDoctor(w.doctor, assigned);
    const row = await db.visit.findUnique({ where: { id: assigned } });
    expect(row?.status).toBe("WITH_DOCTOR");

    const { id: unassigned } = await registeredVisit(null);
    await checkInVisit(w.secretary, unassigned);
    await startWithDoctor(w.mainDoctor, unassigned);
    const row2 = await db.visit.findUnique({ where: { id: unassigned } });
    expect(row2?.doctorId).toBe(w.mainDoctor.id);
    expect(row2?.status).toBe("WITH_DOCTOR");
  });

  it("reception reassigns a waiting visit and notifies the new doctor; reassign after start is rejected", async () => {
    const { assignVisitDoctor } = await import("@/server/services/visit-service");
    const { id: visitId } = await registeredVisit(null);
    await assignVisitDoctor(w.secretary, visitId, w.doctor.id);
    const row = await db.visit.findUnique({ where: { id: visitId } });
    expect(row?.doctorId).toBe(w.doctor.id);
    expect(await db.notification.count({ where: { recipientId: w.doctor.id } })).toBeGreaterThan(0);

    const { id: started } = await registeredVisit(w.doctor.id);
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    await checkInVisit(w.secretary, started);
    await startWithDoctor(w.doctor, started);
    await expect(assignVisitDoctor(w.secretary, started, w.mainDoctor.id)).rejects.toThrow(AppError);
  });

  it("getDoctorQueue returns only the doctor's own visits with correct counts", async () => {
    const { createVisit, checkInVisit, getDoctorQueue, getTodayQueue } = await import("@/server/services/visit-service");
    const v1 = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
    const v2 = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.mainDoctor.id, notes: null });
    await checkInVisit(w.secretary, v1.id);
    const mine = await getDoctorQueue(w.doctor);
    expect(mine.visits.every((v) => v.doctorId === w.doctor.id)).toBe(true);
    expect(mine.counts.waiting).toBeGreaterThanOrEqual(1);
    void v2;
    const secretaryView = await getTodayQueue(w.secretary);
    expect(secretaryView.some((v) => v.doctorId === w.mainDoctor.id)).toBe(true);
    const mainView = await getDoctorQueue(main);
    expect(mainView.visits.every((v) => v.doctorId === main.id)).toBe(true);
  });

  it("markNotificationsRead clears unread count; listNotifications returns recent items", async () => {
    const { createVisit } = await import("@/server/services/visit-service");
    const { getUnreadNotificationCount, listNotifications, markNotificationsRead } = await import("@/server/services/notification-service");
    await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
    expect(await getUnreadNotificationCount(w.doctor)).toBe(1);
    const items = await listNotifications(w.doctor);
    expect(items[0].title).toBeTruthy();
    await markNotificationsRead(w.doctor);
    expect(await getUnreadNotificationCount(w.doctor)).toBe(0);
  });
});

describe("clinical workflow: treatment entry with medications", () => {
  async function draftWithMedications(medications: { medicationId?: string | null; name: string; qty?: string | null; dose?: string | null; instructions?: string | null }[]) {
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [],
      medications,
      basePrice: 100,
    });
    return visitId;
  }

  it("persists prescription rows from the catalog picker", async () => {
    const visitId = await draftWithMedications([{ medicationId: null, name: "باراسيتامول 500mg", qty: "1 علبة", dose: "3 مرات يوميًا", instructions: "بعد الأكل" }]);
    const rows = await db.visitMedication.findMany({ where: { visitId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("باراسيتامول 500mg");
    expect(rows[0].dose).toBe("3 مرات يوميًا");
  });

  it("re-saving with empty medications clears previous prescription", async () => {
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    const visitId = await draftWithMedications([{ name: "فيتامين C" }]);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [],
      medications: [],
      basePrice: 100,
    });
    expect(await db.visitMedication.count({ where: { visitId } })).toBe(0);
  });

  it("rejects a medication line with an empty name", async () => {
    await expect(draftWithMedications([{ name: "   " }])).rejects.toThrow(AppError);
  });

  it("secretary cannot save a treatment draft", async () => {
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await expect(saveTreatmentDraft(w.secretary, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [],
      basePrice: 100,
    })).rejects.toThrow(AppError);
  });

  it("secretary cannot access the treatment-entry screen (legacy gate)", async () => {
    expect(roleHasPermission("SECRETARY", PERMISSIONS.TREATMENT_RECORD)).toBe(false);
    expect(roleHasPermission("DOCTOR", PERMISSIONS.TREATMENT_RECORD)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", PERMISSIONS.TREATMENT_RECORD)).toBe(true);
  });

  it("getVisit exposes medications with catalog name", async () => {
    const { getVisit } = await import("@/server/services/visit-service");
    const visitId = await draftWithMedications([{ medicationId: null, name: "ليدوكايين موضعي", qty: "5 مل" }]);
    const visit = await getVisit(w.owner, visitId);
    expect(visit.medications).toHaveLength(1);
    expect(visit.medications[0].name).toBe("ليدوكايين موضعي");
  });
});

describe("clinical workflow: treatment discount then invoice carry-over", () => {
  async function treatmentWithDiscount(percent: number, actor: typeof w.owner | typeof main = main) {
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    const { applyTreatmentDiscount } = await import("@/server/services/billing-service");
    const { checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { id: visitId } = await registeredVisit(actor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(actor, visitId);
    await completeTreatmentClinically(actor, visitId);
    await saveTreatmentDraft(actor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [],
      basePrice: 100,
    });
    await applyTreatmentDiscount(actor, visitId, { percent, reason: "عميلة دائمة" });
    return visitId;
  }

  it("main doctor applies a treatment-level discount before the invoice exists", async () => {
    const visitId = await treatmentWithDiscount(10);
    const t = await db.treatment.findUnique({ where: { visitId } });
    expect(t?.discountAmount?.toNumber()).toBe(10);
    expect(t?.finalPrice?.toNumber()).toBe(90);
    const discount = await db.discount.findFirst({ where: { treatmentId: t!.id } });
    expect(discount?.invoiceId).toBeNull();
    expect(discount?.reason).toBe("عميلة دائمة");
  });

  it("secretary and plain doctor cannot apply a treatment discount", async () => {
    const { applyTreatmentDiscount } = await import("@/server/services/billing-service");
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await expect(applyTreatmentDiscount(w.secretary, visitId, { percent: 5 })).rejects.toThrow(AppError);
    await expect(applyTreatmentDiscount(w.doctor, visitId, { percent: 5 })).rejects.toThrow(AppError);
  });

  it("rejects a second discount and discounts >= session price", async () => {
    const { applyTreatmentDiscount } = await import("@/server/services/billing-service");
    const visitId = await treatmentWithDiscount(5);
    await expect(applyTreatmentDiscount(main, visitId, { percent: 5 })).rejects.toThrow(AppError);
    const { id: visit2 } = await registeredVisit(main.id);
    const { checkInVisit, startWithDoctor } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft } = await import("@/server/services/treatment-service");
    await checkInVisit(w.secretary, visit2);
    await startWithDoctor(main, visit2);
    await saveTreatmentDraft(main, visit2, { services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }], materials: [], basePrice: 50 });
    await expect(applyTreatmentDiscount(main, visit2, { amount: 50 })).rejects.toThrow(AppError);
  });

  it("sendToCashier carries the discount into the invoice and links the same Discount row", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await treatmentWithDiscount(10);
    const { invoiceId } = await sendToCashier(main, visitId);
    const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.discountAmount?.toNumber()).toBe(10);
    expect(inv?.finalAmount?.toNumber()).toBe(90);
    const discount = await db.discount.findFirst({ where: { treatmentId: { not: null } } });
    expect(discount?.invoiceId).toBe(invoiceId);
    const queue = await (await import("@/server/services/treatment-service")).getReadyForPaymentQueue(w.secretary);
    const q = queue.find((x) => x.visitId === visitId);
    expect(q?.discountAmount.toNumber()).toBe(10);
    expect(q?.finalAmount.toNumber()).toBe(90);
  });

  it("sendToCashier notifies all active secretaries", async () => {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await treatmentWithDiscount(5);
    await sendToCashier(main, visitId);
    const notifs = await db.notification.findMany({ where: { recipientId: w.secretary.id } });
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].type).toBe("TREATMENT_COMPLETED");
  });
});

describe("clinical workflow: reopen visit for correction", () => {
  async function readyVisit() {
    const { sendToCashier } = await import("@/server/services/treatment-service");
    const visitId = await createVisitToCompletion(w, 100);
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    return { visitId, invoiceId };
  }

  it("owner reopens a READY_FOR_PAYMENT visit: invoice voided, visit back WITH_DOCTOR", async () => {
    const { reopenVisitForCorrection } = await import("@/server/services/billing-service");
    const { visitId, invoiceId } = await readyVisit();
    await reopenVisitForCorrection(w.owner, visitId, "تصحيح سعر الجلسة");
    const visit = await db.visit.findUnique({ where: { id: visitId } });
    expect(visit?.status).toBe("WITH_DOCTOR");
    expect(visit?.reopenedAt).toBeTruthy();
    expect(visit?.reopenedById).toBe(w.owner.id);
    expect(visit?.reopenReason).toBe("تصحيح سعر الجلسة");
    expect(visit?.sentToCashierAt).toBeNull();
    const inv = await db.invoice.findUnique({ where: { id: invoiceId } });
    expect(inv?.status).toBe("VOID");
  });

  it("cannot reopen once a payment has been collected", async () => {
    const { reopenVisitForCorrection } = await import("@/server/services/billing-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { visitId, invoiceId } = await readyVisit();
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CASH, amount: 100 });
    await expect(reopenVisitForCorrection(w.owner, visitId, "محاولة بعد التحصيل")).rejects.toThrow(AppError);
  });

  it("cannot reopen a visit that has not reached the cashier", async () => {
    const { reopenVisitForCorrection } = await import("@/server/services/billing-service");
    const visitId = await createVisitToCompletion(w, 100);
    await expect(reopenVisitForCorrection(w.owner, visitId, "لا يوجد حساب")).rejects.toThrow(AppError);
  });
});

describe("clinical workflow: patient history summary & timeline", () => {
  async function visitWithBotox() {
    const { checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "حقن بوتوكس الجبهة", linePrice: 120 }],
      materials: [],
      basePrice: 120,
    });
    await sendToCashier(w.doctor, visitId);
    return visitId;
  }

  it("detects last botox visit for the doctor and gates medical data for the secretary", async () => {
    const { getPatientHistorySummary } = await import("@/server/services/patient-history-service");
    await visitWithBotox();
    const mainSummary = await getPatientHistorySummary(main, w.customerId);
    expect(mainSummary.totalVisits).toBe(1);
    expect(mainSummary.lastBotox?.date).toBeTruthy();
    expect(mainSummary.lastFiller).toBeNull();
    expect(mainSummary.history[0].items[0].description).toContain("بوتوكس");
    const secretarySummary = await getPatientHistorySummary(w.secretary, w.customerId);
    expect(secretarySummary.history).toHaveLength(0);
    expect(secretarySummary.lastBotox).toBeNull();
  });

  it("financial detail is only attached with PAYMENTS_VIEW_HISTORY", async () => {
    const { getPatientHistorySummary } = await import("@/server/services/patient-history-service");
    await visitWithBotox();
    const mainSummary = await getPatientHistorySummary(main, w.customerId);
    expect(mainSummary.financial[0].finalAmount).toBe(120);
  });

  it("creates a 14-day cosmetic review appointment and a secretary reminder on day 13", async () => {
    const { checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { followUpQueue } = await import("@/server/services/crm-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "حقن بوتوكس الجبهة", linePrice: 120 }],
      materials: [],
      basePrice: 120,
    });

    await sendToCashier(w.doctor, visitId, [{ scheduleAppointment: true, type: "REMINDER" }]);

    const sourceVisit = await db.visit.findUnique({ where: { id: visitId } });
    const reviewAppointment = await db.visit.findFirst({
      where: { customerId: w.customerId, id: { not: visitId }, scheduledAt: { not: null } },
    });
    const task = await db.followUpTask.findFirst({ where: { visitId, appointmentVisitId: reviewAppointment?.id } });
    if (!sourceVisit?.treatmentCompletedAt || !reviewAppointment?.scheduledAt || !task) throw new Error("Review appointment was not created");
    expect(reviewAppointment.scheduledAt.getTime() - sourceVisit.treatmentCompletedAt.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(task.status).toBe("PENDING");
    expect(task.dueDate.getTime()).toBe(reviewAppointment.scheduledAt.getTime() - 24 * 60 * 60 * 1000);

    const secretaryQueue = await followUpQueue(w.secretary, { daysAhead: 30 });
    expect(secretaryQueue.tasks.some((item) => item.id === task?.id && item.appointmentVisit?.id === reviewAppointment?.id)).toBe(true);
  });

  it("reuses an existing review appointment on the same day", async () => {
    const { checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { id: visitId } = await registeredVisit(w.doctor.id);
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);
    const sourceVisit = await db.visit.findUniqueOrThrow({ where: { id: visitId } });
    const scheduledAt = new Date(sourceVisit.treatmentCompletedAt!.getTime() + 14 * 24 * 60 * 60 * 1000);
    const existingAppointment = await db.visit.create({
      data: { customerId: w.customerId, doctorId: w.doctor.id, scheduledAt, status: "REGISTERED", notes: "موعد محجوز مسبقًا" },
    });
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "حقن فيلر الشفاه", linePrice: 180 }],
      materials: [],
      basePrice: 180,
    });
    await sendToCashier(w.doctor, visitId, [{ scheduleAppointment: true, type: "REMINDER" }]);

    const appointments = await db.visit.findMany({ where: { customerId: w.customerId, scheduledAt: { not: null } } });
    const task = await db.followUpTask.findFirst({ where: { visitId } });
    expect(appointments).toHaveLength(1);
    expect(task?.appointmentVisitId).toBe(existingAppointment.id);
  });

  it("timeline merges visits and follow-ups newest-first", async () => {
    const { getPatientTimeline } = await import("@/server/services/patient-history-service");
    await visitWithBotox();
    await db.followUpTask.create({
      data: { customerId: w.customerId, assignedToId: w.doctor.id, type: "FOLLOW_UP", dueDate: new Date(Date.now() + 7 * 86400000), notes: "مراجعة بعد أسبوع" },
    });
    const timeline = await getPatientTimeline(main, { customerId: w.customerId });
    const kinds = timeline.map((e) => e.kind);
    expect(kinds).toContain("visit");
    expect(kinds).toContain("followup");
    const dates = timeline.map((e) => e.date.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
});
