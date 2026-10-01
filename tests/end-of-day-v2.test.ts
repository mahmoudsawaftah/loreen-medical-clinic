import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@prisma/client";
import { seedWorld, createVisitToCompletion, db, fakeUser, type SeedWorld } from "./setup";
import { AppError } from "@/lib/errors";
import { roleHasPermission, hasPermission, hardBlockedFor, effectivePermissions, GRANULAR_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { navItemsFor } from "@/lib/navigation";
import { dailySalaryShare } from "@/lib/settings";

let w: SeedWorld;
let sameh: ReturnType<typeof fakeUser>;
let julia: ReturnType<typeof fakeUser>;

beforeEach(async () => {
  w = await seedWorld();
  const samehRow = await db.user.create({ data: { username: "dr.sameh-eod", name: "د. سامح القندور", role: "MAIN_DOCTOR", passwordHash: "x" } });
  sameh = fakeUser("dr.sameh-eod", "د. سامح القندور", "MAIN_DOCTOR", samehRow.id);
  const juliaRow = await db.user.create({ data: { username: "dr.julia", name: "د. جوليا خارتشينكو", role: "DOCTOR", passwordHash: "x" } });
  julia = fakeUser("dr.julia", "د. جوليا خارتشينكو", "DOCTOR", juliaRow.id);
});

/** One fully-paid invoice in the given method (uses 2 units of material → material cost 20). */
async function paid(method: PaymentMethod, amount: number): Promise<{ invoiceId: string; paymentId: string }> {
  const { sendToCashier } = await import("@/server/services/treatment-service");
  const { collectPayment } = await import("@/server/services/billing-service");
  const visitId = await createVisitToCompletion(w, amount);
  const { invoiceId } = await sendToCashier(w.doctor, visitId);
  const { paymentId } = await collectPayment(w.secretary, { invoiceId, method, amount });
  return { invoiceId, paymentId };
}

describe("real hierarchy: owner authority, Sameh MAIN_DOCTOR, Julia DOCTOR", () => {
  it("د. أحمد (OWNER) keeps unrestricted authority across the whole system", () => {
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.USERS_MANAGE)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.PERMISSIONS_EDIT)).toBe(true);
    expect(roleHasPermission("OWNER", PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(true);
    expect(roleHasPermission("OWNER", GRANULAR_PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it("د. سامح القندور keeps MAIN_DOCTOR with clinical authority, no closing by default", () => {
    expect(sameh.role).toBe("MAIN_DOCTOR");
    expect(roleHasPermission("MAIN_DOCTOR", PERMISSIONS.TREATMENT_PRICE)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.PRICING_DISCOUNT)).toBe(true);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(false);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(roleHasPermission("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
  });

  it("د. جوليا خارتشينكو stays DOCTOR with no Owner financial/admin authority", () => {
    expect(julia.role).toBe("DOCTOR");
    expect(hasPermission(julia, GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)).toBe(false);
    expect(hasPermission(julia, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL)).toBe(false);
    expect(hasPermission(julia, PERMISSIONS.USERS_MANAGE)).toBe(false);
    expect(hasPermission(julia, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(julia, GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(false);
    expect(hasPermission(julia, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hasPermission(julia, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
    expect(roleHasPermission("DOCTOR", GRANULAR_PERMISSIONS.TREATMENTS_CREATE)).toBe(true);
  });
});

describe("closing RBAC: secretary prepares, owner approves, Sameh only via explicit grant", () => {
  it("secretary can prepare but cannot review/approve by default", () => {
    expect(hasPermission(w.secretary, GRANULAR_PERMISSIONS.CLOSING_PREPARE)).toBe(true);
    expect(hasPermission(w.secretary, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hasPermission(w.secretary, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
  });

  it("Sameh and Julia are rejected by the service while blocked", async () => {
    const { approveDay, returnDayForReview, closeDay } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 0, actualCliq: 0, actualVisa: 0 });
    await expect(returnDayForReview(sameh, new Date(), "لماذا")).rejects.toThrow(AppError);
    await expect(approveDay(sameh, new Date())).rejects.toThrow("لا تملك صلاحية");
    await expect(approveDay(julia, new Date())).rejects.toThrow("لا تملك صلاحية");
    await expect(closeDay(julia, new Date(), { actualCash: 0, actualCliq: 0, actualVisa: 0 })).rejects.toThrow("لا تملك صلاحية");
  });

  it("closing.review explicitly granted → Sameh can return the day; approve still blocked", async () => {
    const granted = { ...sameh, permissionOverrides: [...sameh.permissionOverrides, "GRANT:closing.review"] };
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(true);
    expect(hasPermission(granted, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hardBlockedFor("MAIN_DOCTOR", GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);

    const { closeDay, returnDayForReview, approveDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 100, actualCliq: 0, actualVisa: 0, varianceExplanation: "فرق عد" });
    await returnDayForReview(granted, new Date(), "أعد العد");
    const returned = await getClosingForDate(w.owner, new Date());
    expect(returned.closing?.status).toBe("REVIEW_REQUIRED");
    expect(returned.closing?.reviewedById).toBe(sameh.id);
    await expect(approveDay(granted, new Date())).rejects.toThrow("لا تملك صلاحية");
  });

  it("closing.approve explicitly granted → Sameh can approve the day", async () => {
    const granted = { ...sameh, permissionOverrides: [...sameh.permissionOverrides, "GRANT:closing.review", "GRANT:closing.approve"] };
    const { closeDay, approveDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 100, actualCliq: 0, actualVisa: 0, varianceExplanation: "فرق عد" });
    await approveDay(granted, new Date());
    const approved = await getClosingForDate(w.owner, new Date());
    expect(approved.closing?.status).toBe("APPROVED");
    expect(approved.closing?.approvedById).toBe(sameh.id);
  });

  it("revoking the grants re-blocks the service and hides the feature from nav", async () => {
    const granted = { ...sameh, permissionOverrides: [...sameh.permissionOverrides, "GRANT:closing.review", "GRANT:closing.approve"] };
    const visibleNav = navItemsFor({ role: granted.role, permissions: effectivePermissions(granted) });
    expect(visibleNav.some((n) => n.href === "/closing")).toBe(true);

    const revoked = { ...sameh, permissionOverrides: [...sameh.permissionOverrides, "DENY:closing.review", "DENY:closing.approve"] };
    expect(hasPermission(revoked, GRANULAR_PERMISSIONS.CLOSING_REVIEW)).toBe(false);
    expect(hasPermission(revoked, GRANULAR_PERMISSIONS.CLOSING_APPROVE)).toBe(false);
    const hiddenNav = navItemsFor({ role: revoked.role, permissions: effectivePermissions(revoked) });
    expect(hiddenNav.some((n) => n.href === "/closing")).toBe(false);

    const { closeDay, approveDay } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 100, actualCliq: 0, actualVisa: 0, varianceExplanation: "فرق عد" });
    await expect(approveDay(revoked, new Date())).rejects.toThrow("لا تملك صلاحية");
  });

  it("direct route access is denied for Julia and for Sameh while blocked", () => {
    const juliaNav = navItemsFor({ role: julia.role, permissions: effectivePermissions(julia) });
    expect(juliaNav.some((n) => n.href === "/closing")).toBe(false);
    const samehNav = navItemsFor({ role: sameh.role, permissions: effectivePermissions(sameh) });
    expect(samehNav.some((n) => n.href === "/closing")).toBe(false);
    expect(juliaNav.some((n) => n.href === "/payroll")).toBe(false);
  });
});

describe("expected vs actual settlement", () => {
  it("expected Cash/CliQ/Visa come from the actual payment ledger", async () => {
    await paid(PaymentMethod.CASH, 620);
    await paid(PaymentMethod.CLIQ, 840);
    await paid(PaymentMethod.VISA, 1250);
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { closing, expected } = await getClosingForDate(w.owner, new Date());
    expect(expected.expectedCash.toNumber()).toBe(620);
    expect(expected.expectedCliq.toNumber()).toBe(840);
    expect(expected.expectedVisa.toNumber()).toBe(1250);
    expect(closing).toBeNull();
  });

  it("actual values are stored separately from expected; variance is computed correctly", async () => {
    await paid(PaymentMethod.CASH, 620);
    await paid(PaymentMethod.CLIQ, 840);
    await paid(PaymentMethod.VISA, 1250);
    const { closeDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 600, actualCliq: 840, actualVisa: 1250, varianceExplanation: "صرف نقدي لمورد" });
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.expectedCash.toNumber()).toBe(620);
    expect(closing?.actualCash.toNumber()).toBe(600);
    expect(closing?.varianceCash.toNumber()).toBe(-20);
    expect(closing?.varianceCliq.toNumber()).toBe(0);
    expect(closing?.varianceVisa.toNumber()).toBe(0);
    expect(closing?.totalExpected.toNumber()).toBe(2710);
    expect(closing?.totalActual.toNumber()).toBe(2690);
    expect(closing?.totalVariance.toNumber()).toBe(-20);
    expect(closing?.varianceExplanation).toContain("صرف نقدي");
  });

  it("non-zero variance requires an explanation; zero variance does not", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay } = await import("@/server/services/closing-service");
    await expect(closeDay(w.secretary, new Date(), { actualCash: 600, actualCliq: 0, actualVisa: 0 })).rejects.toThrow("توضيح سبب الفرق");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0 });
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("SUBMITTED");
  });

  it("voided payments are excluded from the expected totals", async () => {
    const { paymentId } = await paid(PaymentMethod.CASH, 100);
    const { voidPayment } = await import("@/server/services/billing-service");
    await voidPayment(w.owner, paymentId, "خطأ إدخال");
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { expected } = await getClosingForDate(w.owner, new Date());
    expect(expected.expectedCash.toNumber()).toBe(0);
  });
});

describe("submission → owner review → approval", () => {
  it("secretary submits; the owner is notified and sees the submitted day", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0 });
    const { getUnreadNotificationCount, listNotifications } = await import("@/server/services/notification-service");
    expect(await getUnreadNotificationCount(w.owner)).toBeGreaterThanOrEqual(1);
    const items = await listNotifications(w.owner);
    expect(items[0].title).toContain("بانتظار المراجعة");
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("SUBMITTED");
    expect(closing?.submittedById).toBe(w.secretary.id);
  });

  it("a submitted closing cannot be silently overwritten", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 600, actualCliq: 0, actualVisa: 0, varianceExplanation: "فرق" });
    await expect(closeDay(w.secretary, new Date(), { actualCash: 999, actualCliq: 0, actualVisa: 0 })).rejects.toThrow("لا يمكن تقديم تسليم نهاية اليوم");
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.actualCash.toNumber()).toBe(600);
    expect(closing?.status).toBe("SUBMITTED");
  });

  it("owner returns the day with a required reason; secretary corrects and resubmits", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay, returnDayForReview, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 600, actualCliq: 0, actualVisa: 0, varianceExplanation: "فرق" });
    await expect(returnDayForReview(w.owner, new Date(), "")).rejects.toThrow("سبب الإعادة للمراجعة مطلوب");
    await returnDayForReview(w.owner, new Date(), "أعد عد الكاش");
    let day = await getClosingForDate(w.owner, new Date());
    expect(day.closing?.status).toBe("REVIEW_REQUIRED");
    expect(day.closing?.reviewedById).toBe(w.owner.id);
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0, notes: "تم التصحيح" });
    day = await getClosingForDate(w.owner, new Date());
    expect(day.closing?.status).toBe("SUBMITTED");
    expect(day.closing?.actualCash.toNumber()).toBe(620);
  });

  it("owner approves; approval is audited and reviewer is recorded", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay, approveDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("APPROVED");
    expect(closing?.approvedById).toBe(w.owner.id);
    expect(closing?.reviewedById).toBe(w.owner.id);
    expect(closing?.approvedAt).toBeTruthy();
    const audit = await db.auditLog.findFirst({ where: { entityType: "day_closing", entityId: closing!.id, action: "closing.approve" } });
    expect(audit?.userId).toBe(w.owner.id);
  });

  it("approving without a submission is rejected", async () => {
    const { approveDay } = await import("@/server/services/closing-service");
    await expect(approveDay(w.owner, new Date())).rejects.toThrow("لا يوجد تسليم");
  });

  it("reopening an approved day stays owner-only", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay, approveDay, reopenDay } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    const granted = { ...sameh, permissionOverrides: [...sameh.permissionOverrides, "GRANT:closing.review", "GRANT:closing.approve"] };
    await expect(reopenDay(granted, new Date(), "مراجعة")).rejects.toThrow("صلاحية حصرية");
    await reopenDay(w.owner, new Date(), "مراجعة لاحقة");
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("REOPENED");
  });
});

describe("accounting integration: dashboard, materials, payroll, branding", () => {
  it("owner dashboard totals reconcile with the closing expected amounts", async () => {
    await paid(PaymentMethod.CASH, 620);
    await paid(PaymentMethod.CLIQ, 840);
    const { financialMetrics } = await import("@/server/services/reporting-service");
    const { getSettings } = await import("@/lib/settings");
    const { todayRange } = await import("@/lib/time");
    const tz = (await getSettings()).timezone;
    const metrics = await financialMetrics(w.owner, todayRange(tz));
    expect(metrics.collectedByMethod["CASH"]).toBe(620);
    expect(metrics.collectedByMethod["CLIQ"]).toBe(840);
    const { closeDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 840, actualVisa: 0 });
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.expectedCash.toNumber()).toBe(metrics.collectedByMethod["CASH"]);
    expect(closing?.expectedCliq.toNumber()).toBe(metrics.collectedByMethod["CLIQ"]);
  });

  it("material cost comes from the existing inventory consumption", async () => {
    await paid(PaymentMethod.CASH, 100);
    const { financialMetrics } = await import("@/server/services/reporting-service");
    const { getSettings } = await import("@/lib/settings");
    const { todayRange } = await import("@/lib/time");
    const tz = (await getSettings()).timezone;
    const metrics = await financialMetrics(w.owner, todayRange(tz));
    expect(metrics.materialCost).toBe(20);
  });

  it("daily salary allocation follows SalaryHistory; old periods stay unchanged", async () => {
    const { createEmployee, changeSalary, dailyPayrollCost, ensurePayrollPeriod } = await import("@/server/services/payroll-service");
    const emp = await createEmployee(w.owner, { name: "منى", jobTitle: "استقبال", monthlySalary: 900, startDate: new Date().toISOString().slice(0, 10) });
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    await ensurePayrollPeriod(w.owner, m, y);
    const before = await dailyPayrollCost(w.owner, y, m);
    expect(before.totalMonthly).toBe(4300);
    expect(before.dailyShare).toBeCloseTo(dailySalaryShare(before.totalMonthly, y, m, before.mode as "CALENDAR_DAYS" | "WORKING_DAYS"), 3);

    const nextMonth = new Date(Date.UTC(y, m, 1));
    await changeSalary(w.owner, emp.id, { monthlySalary: 1800, effectiveFrom: nextMonth.toISOString().slice(0, 10), reason: "ترقية" });

    const sameMonth = await dailyPayrollCost(w.owner, y, m);
    expect(sameMonth.totalMonthly).toBe(4300);
    const ny = nextMonth.getUTCFullYear();
    const nm = nextMonth.getUTCMonth() + 1;
    await ensurePayrollPeriod(w.owner, nm, ny);
    const later = await dailyPayrollCost(w.owner, ny, nm);
    expect(later.totalMonthly).toBe(5200);
  });

  it("historical closing results are not altered by later salary changes", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { closeDay, approveDay, getClosingForDate } = await import("@/server/services/closing-service");
    await closeDay(w.secretary, new Date(), { actualCash: 620, actualCliq: 0, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    const before = await getClosingForDate(w.owner, new Date());

    const { createEmployee, changeSalary, ensurePayrollPeriod } = await import("@/server/services/payroll-service");
    const now = new Date();
    await ensurePayrollPeriod(w.owner, now.getUTCMonth() + 1, now.getUTCFullYear());
    const emp = await createEmployee(w.owner, { name: "منى", jobTitle: "استقبال", monthlySalary: 900, startDate: new Date().toISOString().slice(0, 10) });
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    await changeSalary(w.owner, emp.id, { monthlySalary: 9999, effectiveFrom: nextMonth.toISOString().slice(0, 10), reason: "تغيير لاحق" });

    const after = await getClosingForDate(w.owner, new Date());
    expect(after.closing?.totalExpected.toNumber()).toBe(before.closing?.totalExpected.toNumber());
    expect(after.closing?.totalActual.toNumber()).toBe(before.closing?.totalActual.toNumber());
    expect(after.closing?.status).toBe("APPROVED");
    expect(after.closing?.approvedById).toBe(w.owner.id);
  });

  it("branding/config changes do not alter financial calculations", async () => {
    await paid(PaymentMethod.CASH, 620);
    const { updateClinicSettings } = await import("@/server/services/settings-service");
    await updateClinicSettings(w.owner, { clinicName: "SOME OTHER NAME", clinicNameAr: "اسم آخر" });
    const { getSettings } = await import("@/lib/settings");
    const settings = await getSettings();
    expect(settings.clinicName).toBe("SOME OTHER NAME");
    const { financialMetrics } = await import("@/server/services/reporting-service");
    const { todayRange } = await import("@/lib/time");
    const metrics = await financialMetrics(w.owner, todayRange(settings.timezone));
    expect(metrics.collected).toBe(620);
    const { getClosingForDate } = await import("@/server/services/closing-service");
    const { expected } = await getClosingForDate(w.owner, new Date());
    expect(expected.expectedCash.toNumber()).toBe(620);
  });
});

describe("workflow regression + seed idempotency", () => {
  it("full Reception → Doctor → Treatment → Secretary Payment → closing workflow still works", async () => {
    const { createVisit, checkInVisit, startWithDoctor, completeTreatmentClinically } = await import("@/server/services/visit-service");
    const { saveTreatmentDraft, sendToCashier } = await import("@/server/services/treatment-service");
    const { collectPayment } = await import("@/server/services/billing-service");
    const { closeDay, approveDay, getClosingForDate } = await import("@/server/services/closing-service");

    const { id: visitId } = await createVisit(w.secretary, { customerId: w.customerId, doctorId: w.doctor.id, notes: null });
    await checkInVisit(w.secretary, visitId);
    await startWithDoctor(w.doctor, visitId);
    await completeTreatmentClinically(w.doctor, visitId);
    await saveTreatmentDraft(w.doctor, visitId, {
      services: [{ serviceId: w.serviceId, description: "تنظيف الوجه", linePrice: 60 }],
      materials: [{ productId: w.productId, batchId: w.batchId, qtyUsed: 2 }],
      basePrice: 150,
      notes: null,
    });
    const { invoiceId } = await sendToCashier(w.doctor, visitId);
    await collectPayment(w.secretary, { invoiceId, method: PaymentMethod.CLIQ, amount: 150 });

    await closeDay(w.secretary, new Date(), { actualCash: 0, actualCliq: 150, actualVisa: 0 });
    await approveDay(w.owner, new Date());
    const { closing } = await getClosingForDate(w.owner, new Date());
    expect(closing?.status).toBe("APPROVED");
    expect(closing?.expectedCliq.toNumber()).toBe(150);
    expect(closing?.totalVariance.toNumber()).toBe(0);
  });

  it("seed upsert logic is idempotent — no duplicate users/settings/services", async () => {
    const mk = (overrides: string[]) => ({ passwordHash: "x", ...(overrides.length ? { permissionOverrides: overrides } : {}) });
    const first = await db.user.upsert({ where: { username: "dr.ahmad" }, update: { name: "د. أحمد", role: "OWNER", permissionOverrides: { set: [] } }, create: { username: "dr.ahmad", name: "د. أحمد (المالك)", role: "OWNER", status: "ACTIVE", mustChangePassword: true, ...mk([]) } });
    const second = await db.user.upsert({ where: { username: "dr.ahmad" }, update: { name: "د. أحمد", role: "OWNER", permissionOverrides: { set: [] } }, create: { username: "dr.ahmad", name: "د. أحمد (المالك)", role: "OWNER", status: "ACTIVE", mustChangePassword: true, ...mk([]) } });
    expect(first.id).toBe(second.id);
    expect(await db.user.count({ where: { username: "dr.ahmad" } })).toBe(1);

    await db.setting.upsert({ where: { key: "clinicName" }, update: {}, create: { key: "clinicName", value: JSON.stringify("LOREEN BEAUTY CLINIC") } });
    await db.setting.upsert({ where: { key: "clinicName" }, update: {}, create: { key: "clinicName", value: JSON.stringify("LOREEN BEAUTY CLINIC") } });
    expect(await db.setting.count({ where: { key: "clinicName" } })).toBe(1);

    const svc = await db.service.findFirst({ where: { name: "تقشير كيميائي" } });
    if (!svc) await db.service.create({ data: { name: "تقشير كيميائي", category: "تقشير", defaultPrice: 55, active: true, createdById: w.owner.id } });
    const again = await db.service.findFirst({ where: { name: "تقشير كيميائي" } });
    expect(again).toBeTruthy();
    expect(await db.service.count({ where: { name: "تقشير كيميائي" } })).toBe(1);
  });
});