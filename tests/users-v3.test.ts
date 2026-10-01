import { beforeEach, describe, expect, it } from "vitest";
import { seedWorld, db, fakeUser, type SeedWorld } from "./setup";
import {
  GRANULAR_PERMISSIONS,
  hasPermission,
  effectivePermissions,
  effectiveMapFor,
  permissionCounts,
  entriesFromMap,
  materializePreset,
  PRESETS,
  PRESET_LABELS,
  type GranularPermission,
} from "@/lib/permissions";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let w: SeedWorld;

beforeEach(async () => {
  w = await seedWorld();
});

async function usersSvc() {
  return import("@/server/services/user-service");
}

async function setUserPermissionsValidated(userId: string, granted: string[], denied: string[]) {
  const { setUserPermissions } = await usersSvc();
  await setUserPermissions(w.owner, userId, { granted, denied });
}

const ALL_GRANULAR = Object.values(GRANULAR_PERMISSIONS) as GranularPermission[];

function entries(user: { permissionOverrides: string[] }) {
  return user.permissionOverrides;
}

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTs(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("users-v3: owner-managed staff accounts", () => {
  it("owner creates an account with a role preset and forces a first password change", async () => {
    const { createUser, listUsers } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "lina", name: "لينا", role: "SECRETARY", password: "secret-123" });
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.role).toBe("SECRETARY");
    expect(row?.mustChangePassword).toBe(true);
    expect(row?.status).toBe("ACTIVE");

    const list = await listUsers(w.owner);
    expect(list.some((u) => u.id === id && u.role === "SECRETARY")).toBe(true);
  });

  it("password shorter than 8 chars is rejected and usernames must be unique", async () => {
    const { createUser } = await usersSvc();
    await expect(createUser(w.owner, { username: "aa", name: "ع", role: "SECRETARY", password: "secret-123" })).rejects.toThrow();
    await createUser(w.owner, { username: "lina", name: "لينا", role: "SECRETARY", password: "secret-123" });
    await expect(createUser(w.owner, { username: "lina", name: "لينا 2", role: "SECRETARY", password: "secret-456" })).rejects.toThrow("موجود");
  });

  it("changing a role updates the preset (role_change audit) and the owner role cannot be downgraded", async () => {
    const { createUser, updateUser } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "rzan", name: "رزان", role: "SECRETARY", password: "secret-123" });
    await updateUser(w.owner, id, { role: "DOCTOR" });
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.role).toBe("DOCTOR");
    const audit = await db.auditLog.findFirst({ where: { action: "user.role_change", entityId: id } });
    expect(audit).toBeTruthy();

    const ownerRow = await db.user.findUnique({ where: { id: w.owner.id } });
    await expect(updateUser(w.owner, w.owner.id, { role: "SECRETARY" })).rejects.toThrow("المالك");
    expect((await db.user.findUnique({ where: { id: w.owner.id } }))?.role).toBe(ownerRow?.role);
  });

  it("preset mapping matches the spec names (MAIN_DOCTOR/FINANCE/DOCTOR/SECRETARY)", () => {
    expect(PRESETS.OWNER).toBe("MAIN_DOCTOR");
    expect(PRESETS.ACCOUNTANT).toBe("FINANCE");
    expect(PRESETS.DOCTOR).toBe("DOCTOR");
    expect(PRESETS.SECRETARY).toBe("SECRETARY");
    expect(PRESET_LABELS.MAIN_DOCTOR).toBeTruthy();
  });

  it("grant/deny overrides toggle granular permissions and are reflected in the effective set", async () => {
    const { createUser, setUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "samira", name: "سميرة", role: "SECRETARY", password: "secret-123" });
    const user = fakeUser("s3", "سميرة", "SECRETARY", id);

    const effective0 = effectivePermissions(user);
    expect(effective0.includes(GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)).toBe(false);
    expect(effective0.includes(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND)).toBe(true);

    await setUserPermissions(w.owner, id, {
      granted: [GRANULAR_PERMISSIONS.INVENTORY_ADJUST],
      denied: [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND],
    });
    const affected: Parameters<typeof hasPermission>[0] = {
      role: "SECRETARY",
      permissionOverrides: ["GRANT:inventory.adjust", "DENY:messages.campaign.send"],
    };
    expect(hasPermission(affected, GRANULAR_PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(hasPermission(affected, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND)).toBe(false);
    expect(effectivePermissions(affected)).toContain(GRANULAR_PERMISSIONS.INVENTORY_ADJUST);
    expect(effectivePermissions(affected)).not.toContain(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
  });

  it("an owner grant overrides the role default, and an explicit Block wins too (two-state model)", async () => {
    const { createUser, setUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "s4test", name: "سارة", role: "SECRETARY", password: "secret-123" });
    await setUserPermissions(w.owner, id, { granted: [GRANULAR_PERMISSIONS.USERS_MANAGE], denied: [] });
    let row = await db.user.findUnique({ where: { id } });
    expect(row?.permissionOverrides).toContain("GRANT:users.manage");
    expect(hasPermission({ role: "SECRETARY", permissionOverrides: row!.permissionOverrides }, GRANULAR_PERMISSIONS.USERS_MANAGE)).toBe(true);

    await setUserPermissions(w.owner, id, { granted: [], denied: [GRANULAR_PERMISSIONS.USERS_MANAGE] });
    row = await db.user.findUnique({ where: { id } });
    expect(row?.permissionOverrides).toContain("DENY:users.manage");
    expect(hasPermission({ role: "SECRETARY", permissionOverrides: row!.permissionOverrides }, GRANULAR_PERMISSIONS.USERS_MANAGE)).toBe(false);
  });

  it("new accounts materialize the role preset into explicit Grant/Block entries (SECRETARY)", async () => {
    const { createUser } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "preset1", name: "بريسيت", role: "SECRETARY", password: "secret-123" });
    const row = await db.user.findUnique({ where: { id } });
    const granted = new Set(entries(row!).filter((e) => e.startsWith("GRANT:")).map((e) => e.slice(6)));
    const denied = new Set(entries(row!).filter((e) => e.startsWith("DENY:")).map((e) => e.slice(5)));
    expect(row?.permissionOverrides.length).toBe(ALL_GRANULAR.length);
    for (const code of ALL_GRANULAR) {
      expect(granted.has(code) || denied.has(code)).toBe(true);
    }
    expect(granted.has(GRANULAR_PERMISSIONS.PATIENTS_READ)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.PATIENTS_CREATE)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.APPOINTMENTS_READ)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.PAYMENTS_COLLECT)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE)).toBe(true);
    expect(granted.has(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.USERS_MANAGE)).toBe(true);
    expect(denied.has(GRANULAR_PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it("new Doctor accounts get the explicit DOCTOR preset", async () => {
    const { createUser } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "preset2", name: "دكتورة", role: "DOCTOR", password: "secret-123" });
    const row = await db.user.findUnique({ where: { id } });
    const map = effectiveMapFor({ role: row!.role, permissionOverrides: row!.permissionOverrides });
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.TREATMENTS_CREATE]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.APPOINTMENTS_READ]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.INVENTORY_READ]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.USERS_MANAGE]).toBe(false);
  });

  it("new Finance accounts get the explicit FINANCE (ACCOUNTANT) preset", async () => {
    const { createUser } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "preset3", name: "محاسبة", role: "ACCOUNTANT", password: "secret-123" });
    const row = await db.user.findUnique({ where: { id } });
    const map = effectiveMapFor({ role: row!.role, permissionOverrides: row!.permissionOverrides });
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.FINANCIAL_PROFITS]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PAYMENTS_VOID]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.INVENTORY_COUNT]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PURCHASES_RECEIVE]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.AUDIT_READ]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.TREATMENTS_CREATE]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.PERMISSIONS_EDIT]).toBe(false);
  });

  it("the Main Doctor (OWNER) preset grants every permission (unrestricted super admin)", () => {
    expect(PRESETS.OWNER).toBe("MAIN_DOCTOR");
    for (const code of ALL_GRANULAR) {
      expect(hasPermission({ role: "OWNER", permissionOverrides: [] }, code)).toBe(true);
    }
  });

  it("manual Grant override persists across saves (full explicit map stored)", async () => {
    const { createUser, setUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "grant1", name: "منى", role: "SECRETARY", password: "secret-123" });
    await setUserPermissions(w.owner, id, { granted: [GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL], denied: [] });
    const row = await db.user.findUnique({ where: { id } });
    expect(entries(row!).filter((e) => e.startsWith("GRANT:"))).toContain("GRANT:patients.read_medical");
    const map = effectiveMapFor({ role: row!.role, permissionOverrides: row!.permissionOverrides });
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL]).toBe(true);
    expect(permissionCounts(map).granted).toBeGreaterThan(0);
  });

  it("manual Block override persists across saves", async () => {
    const { createUser, setUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "block1", name: "بلسم", role: "SECRETARY", password: "secret-123" });
    await setUserPermissions(w.owner, id, { granted: [], denied: [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND] });
    const row = await db.user.findUnique({ where: { id } });
    expect(entries(row!)).toContain("DENY:messages.campaign.send");
    expect(hasPermission({ role: row!.role, permissionOverrides: row!.permissionOverrides }, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND)).toBe(false);
  });

  it("a role change re-materializes the new role preset explicitly", async () => {
    const { createUser, updateUser } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "change1", name: "تغية", role: "SECRETARY", password: "secret-123" });
    await setUserPermissionsValidated(id, [GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL], []);
    await updateUser(w.owner, id, { role: "DOCTOR" });
    const row = await db.user.findUnique({ where: { id } });
    const map = effectiveMapFor({ role: row!.role, permissionOverrides: row!.permissionOverrides });
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL]).toBe(true);
    expect(map[GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE]).toBe(false);
    expect(map[GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL] && !map[GRANULAR_PERMISSIONS.USERS_MANAGE]).toBe(true);
  });

  it("role reset re-applies the explicit preset (custom grants disappear)", async () => {
    const { createUser, setUserPermissions, resetUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "reset1", name: "ريتا", role: "SECRETARY", password: "secret-123" });
    await setUserPermissions(w.owner, id, { granted: [GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL, GRANULAR_PERMISSIONS.INVENTORY_ADJUST], denied: [] });
    await resetUserPermissions(w.owner, id);
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.permissionOverrides).toEqual(entriesFromMap(materializePreset("SECRETARY")));
    expect(hasPermission({ role: row!.role, permissionOverrides: row!.permissionOverrides }, GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL)).toBe(false);
    expect(hasPermission({ role: row!.role, permissionOverrides: row!.permissionOverrides }, GRANULAR_PERMISSIONS.INVENTORY_ADJUST)).toBe(false);
  });

  it("every account resolves to exactly two explicit states — no third state in storage", async () => {
    const { createUser, setUserPermissions } = await usersSvc();
    for (const role of ["SECRETARY", "DOCTOR", "ACCOUNTANT"] as const) {
      const { id } = await createUser(w.owner, { username: `states-${role}`, name: role, role, password: "secret-123" });
      const row = await db.user.findUnique({ where: { id } });
      expect(row?.permissionOverrides.length).toBe(ALL_GRANULAR.length);
      for (const entry of row!.permissionOverrides) {
        expect(entry.startsWith("GRANT:") || entry.startsWith("DENY:")).toBe(true);
      }
      expect(row?.permissionOverrides.filter((e) => e.startsWith("GRANT:")).length).toBeGreaterThanOrEqual(0);
    }
    const { id } = await createUser(w.owner, { username: "states-x", name: "حالة", role: "SECRETARY", password: "secret-123" });
    const allBlocked = ALL_GRANULAR.map((c) => c);
    await setUserPermissions(w.owner, id, { granted: [], denied: allBlocked });
    const row = await db.user.findUnique({ where: { id } });
    for (const entry of row!.permissionOverrides) expect(entry.startsWith("DENY:")).toBe(true);
  });

  it("no UI source contains the removed third state (حسب الدور as a permission state / inherit)", () => {
    const srcRoot = join(process.cwd(), "src");
    const forbidden = ["حسب الدور", "INHERIT", "inherited", "role default selectors"];
    // The ONLY sanctioned occurrence is the reset button mandated by the spec
    // («إعادة ضبط حسب الدور») — every other use of the phrase is banned.
    const files = walkTs(srcRoot);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      let content = readFileSync(file, "utf8");
      const resets = content.split("إعادة ضبط حسب الدور").length - 1;
      content = content.split("إعادة ضبط حسب الدور").join("");
      for (const token of forbidden) {
        expect(content).not.toContain(token);
      }
      if (resets > 0) {
        expect(file.replace(/\\/g, "/").endsWith("src/components/users/user-manager.tsx")).toBe(true);
      }
    }
  });

  it("navigation follows the explicit state: blocked modules disappear, granted modules appear", async () => {
    const { navItemsFor } = await import("@/lib/navigation");
    const { createUser, setUserPermissions } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "nav1", name: "نافذة", role: "SECRETARY", password: "secret-123" });
    let row = await db.user.findUnique({ where: { id } });
    let items = navItemsFor({ role: row!.role, permissions: effectivePermissions({ role: row!.role, permissionOverrides: row!.permissionOverrides }) });
    expect(items.some((n) => n.href === "/messages")).toBe(true);
    expect(items.some((n) => n.href === "/campaigns")).toBe(true);

    await setUserPermissions(w.owner, id, { granted: [], denied: [GRANULAR_PERMISSIONS.MESSAGES_READ] });
    row = await db.user.findUnique({ where: { id } });
    items = navItemsFor({ role: row!.role, permissions: effectivePermissions({ role: row!.role, permissionOverrides: row!.permissionOverrides }) });
    expect(items.some((n) => n.href === "/messages")).toBe(false);
    expect(items.some((n) => n.href === "/campaigns")).toBe(true);

    await setUserPermissions(w.owner, id, { granted: [], denied: [GRANULAR_PERMISSIONS.MESSAGES_READ, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND] });
    row = await db.user.findUnique({ where: { id } });
    items = navItemsFor({ role: row!.role, permissions: effectivePermissions({ role: row!.role, permissionOverrides: row!.permissionOverrides }) });
    expect(items.some((n) => n.href === "/campaigns")).toBe(false);
  });

  it("every sidebar route has a matching server-side route guard", async () => {
    const { NAV, CLOSING_ITEM, ROUTE_GUARDS } = await import("@/lib/navigation");
    for (const item of [...NAV, CLOSING_ITEM]) {
      expect(ROUTE_GUARDS[item.href]).toBeTruthy();
    }
  });

  it("secretary/doctor can never reach owner financial modules (financialMetrics, expenses, payroll)", async () => {
    const { financialMetrics } = await import("@/server/services/reporting-service");
    const { createExpense } = await import("@/server/services/expense-service");
    const { payrollCostForPeriod } = await import("@/server/services/payroll-service");
    const day = { start: new Date("2026-08-16T00:00:00Z"), end: new Date("2026-08-16T23:59:59Z") };
    await expect(financialMetrics(w.secretary, day)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(payrollCostForPeriod(w.secretary, 2026, 8)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createExpense(w.doctor, { categoryId: w.categoryId, amount: 10, date: "2026-08-16", description: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a disabled account cannot log in, and its historical name stays visible in listings", async () => {
    const { createUser, deactivateUser, reactivateUser } = await usersSvc();
    const { login } = await import("@/server/services/auth-service");
    const { id } = await createUser(w.owner, { username: "lina", name: "لينا", role: "SECRETARY", password: "secret-123" });

    await deactivateUser(w.owner, id, "ترك العمل");
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.status).toBe("INACTIVE");
    expect(row?.deactivatedAt).toBeTruthy();
    const result = await login("lina", "secret-123");
    expect(result.ok).toBe(false);

    const { listUsers } = await usersSvc();
    const list = await listUsers(w.owner);
    expect(list.some((u) => u.id === id && u.status === "INACTIVE" && u.name === "لينا")).toBe(true);

    await reactivateUser(w.owner, id);
    const reactivated = await db.user.findUnique({ where: { id } });
    expect(reactivated?.status).toBe("ACTIVE");
    expect(reactivated?.deactivatedAt).toBeNull();
  });

  it("a user cannot deactivate or delete their own account", async () => {
    const { deactivateUser, deleteUser } = await usersSvc();
    await expect(deactivateUser(w.owner, w.owner.id, "")).rejects.toThrow();
    await expect(deleteUser(w.owner, w.owner.id)).rejects.toThrow();
  });

  it("an account with no historical references can be deleted permanently", async () => {
    const { createUser, deleteUser, listUsers } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "temp", name: "مؤقت", role: "SECRETARY", password: "secret-123" });
    await deleteUser(w.owner, id);
    expect(await db.user.findUnique({ where: { id } })).toBeNull();
    expect((await listUsers(w.owner)).some((u) => u.id === id)).toBe(false);
  });

  it("an account with historical references cannot be deleted and the exact Arabic guidance is returned", async () => {
    const { createUser, deleteUser } = await usersSvc();
    const { createPatient } = await import("@/server/services/patient-service");
    const { id } = await createUser(w.owner, { username: "haneen", name: "هانين", role: "SECRETARY", password: "secret-123" });
    const actor = fakeUser("haneen", "هانين", "SECRETARY", id);
    await createPatient(actor, { fullName: "عميلة هانين", phone: "0781234567", marketingConsent: false });

    await expect(deleteUser(w.owner, id)).rejects.toThrow("لا يمكن حذف الحساب لوجود عمليات سابقة مرتبطة به. يمكنك تعطيل الحساب للحفاظ على السجل.");
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.status).toBe("ACTIVE");
  });

  it("reset password flags must-change on next login", async () => {
    const { createUser, resetPassword } = await usersSvc();
    const { id } = await createUser(w.owner, { username: "p1test", name: "بترا", role: "DOCTOR", password: "secret-123" });
    await resetPassword(w.owner, id, "new-secret-999");
    const row = await db.user.findUnique({ where: { id } });
    expect(row?.mustChangePassword).toBe(true);
    expect(row?.passwordHash).not.toBe("secret-123");
  });

  it("user-management mutations are owner-only (service-level gate)", async () => {
    const { createUser, deactivateUser, deleteUser } = await usersSvc();
    await expect(
      createUser(w.secretary, { username: "attacker", name: "محاولة", role: "SECRETARY", password: "secret-123" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deactivateUser(w.secretary, w.doctor.id, "")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteUser(w.secretary, w.doctor.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});