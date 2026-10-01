import type { Role } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * Central server-side RBAC matrix (V3).
 * Every sensitive action checks requirePermission() — never UI only.
 * Owner/Main Doctor is the ONLY role that can apply/approve discounts.
 *
 * Granular permissions (the spec's minimum set) are the UI-level permission
 * vocabulary. Legacy keys remain for the existing services/actions; each
 * granular key belongs to a FAMILY that resolves to its legacy equivalent,
 * so checks are consistent whichever key is used.
 */

export const PERMISSIONS = {
  PATIENT_VIEW: "patients.view",
  PATIENT_CREATE: "patients.create",
  PATIENT_EDIT_CONTACT: "patients.edit_contact",
  PATIENT_VIEW_MEDICAL: "patients.view_medical",
  PATIENT_EDIT_MEDICAL: "patients.edit_medical",
  PATIENT_VIEW_FINANCIAL: "patients.view_financial",

  VISIT_MANAGE: "visits.manage",
  VISIT_ASSIGN_DOCTOR: "visits.assign_doctor",

  TREATMENT_RECORD: "treatments.record",
  TREATMENT_PRICE: "treatments.price",
  TREATMENT_SEND_TO_CASHIER: "treatments.send_to_cashier",
  TREATMENT_VIEW_FINANCIAL: "treatments.view_financial",

  BILLING_COLLECT: "billing.collect",
  BILLING_DISCOUNT: "billing.discount", // Owner ONLY
  BILLING_VOID: "billing.void",
  BILLING_VIEW: "billing.view",

  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_COUNT: "inventory.count",
  INVENTORY_COUNT_POST: "inventory.count_post",

  PURCHASE_OPERATIONAL_CREATE: "purchases.operational_create",
  PURCHASE_MEDICAL_CREATE: "purchases.medical_create",
  PURCHASE_APPROVE: "purchases.approve",
  PURCHASE_RECEIVE: "purchases.receive",
  PURCHASE_VIEW: "purchases.view",

  EXPENSE_MANAGE: "expenses.manage",
  EXPENSE_APPROVE: "expenses.approve",
  EXPENSE_VIEW: "expenses.view",

  PAYROLL_MANAGE: "payroll.manage",
  PAYROLL_VIEW: "payroll.view",

  USERS_MANAGE: "users.manage",
  AUDIT_VIEW: "audit.view",
  SETTINGS_MANAGE: "settings.manage",
  REPORTS_FINANCIAL: "reports.financial",
  REPORTS_VIEW: "reports.view",
  EXPORT: "reports.export",

  CRM_MANAGE: "crm.manage",
  MESSAGING_SEND: "crm.messaging_send",
  CLOSING_MANAGE: "closing.manage",
  CLOSING_VIEW: "closing.view",
  ATTACHMENT_VIEW: "attachments.view",
  ATTACHMENT_UPLOAD: "attachments.upload",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS] | (typeof GRANULAR_PERMISSIONS)[keyof typeof GRANULAR_PERMISSIONS];

/** Granular V3 permission vocabulary (what the Owner UI manages). */
export const GRANULAR_PERMISSIONS = {
  PATIENTS_READ: "patients.read",
  PATIENTS_CREATE: "patients.create",
  PATIENTS_EDIT_DEMOGRAPHICS: "patients.edit_demographics",
  PATIENTS_READ_MEDICAL: "patients.read_medical",
  PATIENTS_EDIT_MEDICAL: "patients.edit_medical",

  APPOINTMENTS_READ: "appointments.read",
  APPOINTMENTS_CREATE: "appointments.create",
  APPOINTMENTS_EDIT: "appointments.edit",
  APPOINTMENTS_CANCEL: "appointments.cancel",

  TREATMENTS_READ: "treatments.read",
  TREATMENTS_CREATE: "treatments.create",
  TREATMENTS_EDIT: "treatments.edit",
  TREATMENTS_COMPLETE: "treatments.complete",

  PAYMENTS_VIEW: "payments.view",
  PAYMENTS_COLLECT: "payments.collect",
  PAYMENTS_VIEW_HISTORY: "payments.view_history",
  PAYMENTS_VOID: "payments.void",

  INVENTORY_READ: "inventory.read",
  INVENTORY_ADD: "inventory.add",
  INVENTORY_ADD_STOCK: "inventory.add_stock",
  INVENTORY_EDIT_PRODUCT: "inventory.edit_product",
  INVENTORY_DELETE: "inventory.delete",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_COUNT: "inventory.count",

  PURCHASES_REQUEST: "purchases.request",
  PURCHASES_APPROVE: "purchases.approve",
  PURCHASES_RECEIVE: "purchases.receive",

  CLOSING_PREPARE: "closing.prepare",
  CLOSING_REVIEW: "closing.review",
  CLOSING_APPROVE: "closing.approve",

  FINANCIAL_DASHBOARD: "financial.dashboard",
  FINANCIAL_EXPENSES_VIEW: "financial.expenses.view",
  FINANCIAL_EXPENSES_CREATE: "financial.expenses.create",
  FINANCIAL_RECEIVABLES: "financial.receivables",
  FINANCIAL_PAYROLL: "financial.payroll",
  FINANCIAL_PAYROLL_EDIT: "financial.payroll.edit",
  FINANCIAL_PROFITS: "financial.profits",

  MESSAGES_READ: "messages.read",
  MESSAGES_SEND_TRANSACTIONAL: "messages.send_transactional",
  MESSAGES_CAMPAIGN_CREATE: "messages.campaign.create",
  MESSAGES_CAMPAIGN_SEND: "messages.campaign.send",

  SERVICES_READ: "services.read",
  SERVICES_CREATE: "services.create",
  SERVICES_EDIT: "services.edit",
  SERVICES_DISABLE: "services.disable",

  PRICING_DISCOUNT: "pricing.discount",

  USERS_MANAGE: "users.manage",
  PERMISSIONS_EDIT: "permissions.edit",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_READ: "audit.read",
} as const;

export type GranularPermission = (typeof GRANULAR_PERMISSIONS)[keyof typeof GRANULAR_PERMISSIONS];

/**
 * Family resolution: each granular key maps to the set of keys that must be
 * considered together (itself + legacy equivalents). Granting/denying any
 * member of a family toggles the whole family, so checks using legacy keys
 * and checks using granular keys can never disagree.
 */
const FAMILIES: Partial<Record<string, string[]>> = {
  [GRANULAR_PERMISSIONS.PATIENTS_READ]: [GRANULAR_PERMISSIONS.PATIENTS_READ, PERMISSIONS.PATIENT_VIEW],
  [GRANULAR_PERMISSIONS.PATIENTS_CREATE]: [GRANULAR_PERMISSIONS.PATIENTS_CREATE, PERMISSIONS.PATIENT_CREATE],
  [GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS]: [GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS, PERMISSIONS.PATIENT_EDIT_CONTACT],
  [GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL]: [GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL, PERMISSIONS.PATIENT_VIEW_MEDICAL],
  [GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL]: [GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL, PERMISSIONS.PATIENT_EDIT_MEDICAL],
  [GRANULAR_PERMISSIONS.APPOINTMENTS_READ]: [GRANULAR_PERMISSIONS.APPOINTMENTS_READ, PERMISSIONS.VISIT_MANAGE],
  [GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE]: [GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE, PERMISSIONS.VISIT_MANAGE],
  [GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT]: [GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT, PERMISSIONS.VISIT_MANAGE],
  [GRANULAR_PERMISSIONS.APPOINTMENTS_CANCEL]: [GRANULAR_PERMISSIONS.APPOINTMENTS_CANCEL, PERMISSIONS.VISIT_MANAGE],
  [GRANULAR_PERMISSIONS.TREATMENTS_READ]: [GRANULAR_PERMISSIONS.TREATMENTS_READ, PERMISSIONS.TREATMENT_VIEW_FINANCIAL],
  [GRANULAR_PERMISSIONS.TREATMENTS_CREATE]: [GRANULAR_PERMISSIONS.TREATMENTS_CREATE, PERMISSIONS.TREATMENT_RECORD],
  [GRANULAR_PERMISSIONS.TREATMENTS_EDIT]: [GRANULAR_PERMISSIONS.TREATMENTS_EDIT, PERMISSIONS.TREATMENT_PRICE],
  [GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE]: [GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE],
  [GRANULAR_PERMISSIONS.PAYMENTS_VIEW]: [GRANULAR_PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.BILLING_VIEW],
  [GRANULAR_PERMISSIONS.PAYMENTS_COLLECT]: [GRANULAR_PERMISSIONS.PAYMENTS_COLLECT, PERMISSIONS.BILLING_COLLECT],
  [GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY]: [GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY, PERMISSIONS.BILLING_VIEW],
  [GRANULAR_PERMISSIONS.PAYMENTS_VOID]: [GRANULAR_PERMISSIONS.PAYMENTS_VOID, PERMISSIONS.BILLING_VOID],
  [GRANULAR_PERMISSIONS.INVENTORY_READ]: [GRANULAR_PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_VIEW],
  [GRANULAR_PERMISSIONS.INVENTORY_ADD]: [GRANULAR_PERMISSIONS.INVENTORY_ADD, PERMISSIONS.PURCHASE_RECEIVE],
  [GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK]: [GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK, GRANULAR_PERMISSIONS.INVENTORY_ADD, PERMISSIONS.PURCHASE_RECEIVE],
  [GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT]: [GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT, PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.INVENTORY_ADJUST],
  [GRANULAR_PERMISSIONS.INVENTORY_DELETE]: [GRANULAR_PERMISSIONS.INVENTORY_DELETE, PERMISSIONS.INVENTORY_MANAGE],
  [GRANULAR_PERMISSIONS.INVENTORY_ADJUST]: [GRANULAR_PERMISSIONS.INVENTORY_ADJUST, PERMISSIONS.INVENTORY_ADJUST],
  [GRANULAR_PERMISSIONS.INVENTORY_COUNT]: [GRANULAR_PERMISSIONS.INVENTORY_COUNT, PERMISSIONS.INVENTORY_COUNT],
  [GRANULAR_PERMISSIONS.PURCHASES_REQUEST]: [GRANULAR_PERMISSIONS.PURCHASES_REQUEST, PERMISSIONS.PURCHASE_OPERATIONAL_CREATE],
  [GRANULAR_PERMISSIONS.PURCHASES_APPROVE]: [GRANULAR_PERMISSIONS.PURCHASES_APPROVE, PERMISSIONS.PURCHASE_APPROVE],
  [GRANULAR_PERMISSIONS.PURCHASES_RECEIVE]: [GRANULAR_PERMISSIONS.PURCHASES_RECEIVE, PERMISSIONS.PURCHASE_RECEIVE],
  [GRANULAR_PERMISSIONS.CLOSING_PREPARE]: [GRANULAR_PERMISSIONS.CLOSING_PREPARE, PERMISSIONS.CLOSING_MANAGE],
  [GRANULAR_PERMISSIONS.CLOSING_REVIEW]: [GRANULAR_PERMISSIONS.CLOSING_REVIEW, PERMISSIONS.CLOSING_VIEW],
  [GRANULAR_PERMISSIONS.CLOSING_APPROVE]: [GRANULAR_PERMISSIONS.CLOSING_APPROVE, PERMISSIONS.CLOSING_VIEW],
  [GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD]: [GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD, PERMISSIONS.REPORTS_FINANCIAL],
  [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW]: [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW, PERMISSIONS.EXPENSE_VIEW],
  [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE]: [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE, PERMISSIONS.EXPENSE_MANAGE, GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW],
  [GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES]: [GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES],
  [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL]: [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL, PERMISSIONS.PAYROLL_VIEW],
  [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT]: [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT, PERMISSIONS.PAYROLL_MANAGE, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL],
  [GRANULAR_PERMISSIONS.FINANCIAL_PROFITS]: [GRANULAR_PERMISSIONS.FINANCIAL_PROFITS, PERMISSIONS.REPORTS_FINANCIAL],
  [GRANULAR_PERMISSIONS.MESSAGES_READ]: [GRANULAR_PERMISSIONS.MESSAGES_READ],
  [GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL]: [GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL, PERMISSIONS.MESSAGING_SEND],
  [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE]: [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE],
  [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND]: [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND],
  [GRANULAR_PERMISSIONS.SERVICES_READ]: [GRANULAR_PERMISSIONS.SERVICES_READ],
  [GRANULAR_PERMISSIONS.SERVICES_CREATE]: [GRANULAR_PERMISSIONS.SERVICES_CREATE],
  [GRANULAR_PERMISSIONS.SERVICES_EDIT]: [GRANULAR_PERMISSIONS.SERVICES_EDIT],
  [GRANULAR_PERMISSIONS.SERVICES_DISABLE]: [GRANULAR_PERMISSIONS.SERVICES_DISABLE],
  [GRANULAR_PERMISSIONS.PRICING_DISCOUNT]: [GRANULAR_PERMISSIONS.PRICING_DISCOUNT, PERMISSIONS.BILLING_DISCOUNT],
  [GRANULAR_PERMISSIONS.USERS_MANAGE]: [GRANULAR_PERMISSIONS.USERS_MANAGE, PERMISSIONS.USERS_MANAGE],
  [GRANULAR_PERMISSIONS.PERMISSIONS_EDIT]: [GRANULAR_PERMISSIONS.PERMISSIONS_EDIT, PERMISSIONS.USERS_MANAGE],
  [GRANULAR_PERMISSIONS.SETTINGS_MANAGE]: [GRANULAR_PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE],
  [GRANULAR_PERMISSIONS.AUDIT_READ]: [GRANULAR_PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_VIEW],
};

export type RoleMatrix = Record<Role, readonly Permission[]>;

/** Shared clinical base for DOCTOR and MAIN_DOCTOR presets. */
const DOCTOR_BASE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.PATIENT_VIEW,
  PERMISSIONS.PATIENT_CREATE,
  PERMISSIONS.PATIENT_EDIT_CONTACT,
  PERMISSIONS.PATIENT_VIEW_MEDICAL,
  PERMISSIONS.PATIENT_EDIT_MEDICAL,
  PERMISSIONS.VISIT_MANAGE,
  PERMISSIONS.VISIT_ASSIGN_DOCTOR,
  PERMISSIONS.TREATMENT_RECORD,
  PERMISSIONS.TREATMENT_PRICE,
  PERMISSIONS.TREATMENT_SEND_TO_CASHIER,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.PURCHASE_VIEW,
  PERMISSIONS.PURCHASE_MEDICAL_CREATE,
  PERMISSIONS.CRM_MANAGE,
  PERMISSIONS.MESSAGING_SEND,
  PERMISSIONS.ATTACHMENT_VIEW,
  PERMISSIONS.ATTACHMENT_UPLOAD,
  PERMISSIONS.REPORTS_VIEW,
  GRANULAR_PERMISSIONS.PATIENTS_READ,
  GRANULAR_PERMISSIONS.PATIENTS_CREATE,
  GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS,
  GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL,
  GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL,
  GRANULAR_PERMISSIONS.APPOINTMENTS_READ,
  GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE,
  GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT,
  GRANULAR_PERMISSIONS.TREATMENTS_READ,
  GRANULAR_PERMISSIONS.TREATMENTS_CREATE,
  GRANULAR_PERMISSIONS.TREATMENTS_EDIT,
  GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE,
  GRANULAR_PERMISSIONS.PAYMENTS_VIEW,
  GRANULAR_PERMISSIONS.INVENTORY_READ,
  GRANULAR_PERMISSIONS.PURCHASES_REQUEST,
  GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL,
];

/**
 * Role presets (defaults only — the Owner can grant/deny per user).
 * MAIN_DOCTOR is Dr. Sameh's role (a senior doctor); the Owner grants any
 * extra module explicitly. Service catalog management and discount are NOT
 * in the DOCTOR preset — blocked until the Owner grants them individually.
 * End-of-Day (closing.prepare/review/approve) is NOT in the MAIN_DOCTOR
 * preset: Dr. Sameh only sees the closing screen when the Owner explicitly
 * grants review/approve to his account.
 */
export const ROLE_PERMISSIONS: RoleMatrix = {
  OWNER: [...Object.values(PERMISSIONS), ...Object.values(GRANULAR_PERMISSIONS)] as Permission[],
  MAIN_DOCTOR: [
    ...DOCTOR_BASE_PERMISSIONS,
    PERMISSIONS.TREATMENT_PRICE,
    PERMISSIONS.BILLING_DISCOUNT,
    GRANULAR_PERMISSIONS.PRICING_DISCOUNT,
    GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY,
    GRANULAR_PERMISSIONS.AUDIT_READ,
  ],
  ACCOUNTANT: [
    PERMISSIONS.PATIENT_VIEW,
    PERMISSIONS.PATIENT_VIEW_MEDICAL,
    PERMISSIONS.PATIENT_VIEW_FINANCIAL,
    PERMISSIONS.TREATMENT_VIEW_FINANCIAL,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.BILLING_VOID,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.INVENTORY_COUNT,
    PERMISSIONS.INVENTORY_COUNT_POST,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.PURCHASE_RECEIVE,
    PERMISSIONS.EXPENSE_MANAGE,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.EXPORT,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.CRM_MANAGE,
    PERMISSIONS.CLOSING_VIEW,
    PERMISSIONS.ATTACHMENT_VIEW,
    PERMISSIONS.ATTACHMENT_UPLOAD,
    PERMISSIONS.VISIT_MANAGE,
    GRANULAR_PERMISSIONS.PATIENTS_READ,
    GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL,
    GRANULAR_PERMISSIONS.TREATMENTS_READ,
    GRANULAR_PERMISSIONS.PAYMENTS_VIEW,
    GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY,
    GRANULAR_PERMISSIONS.PAYMENTS_VOID,
    GRANULAR_PERMISSIONS.INVENTORY_READ,
    GRANULAR_PERMISSIONS.INVENTORY_ADD,
    GRANULAR_PERMISSIONS.INVENTORY_COUNT,
    GRANULAR_PERMISSIONS.PURCHASES_RECEIVE,
    GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD,
    GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW,
    GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE,
    GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES,
    GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL,
    GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT,
    GRANULAR_PERMISSIONS.FINANCIAL_PROFITS,
    GRANULAR_PERMISSIONS.CLOSING_PREPARE,
    GRANULAR_PERMISSIONS.AUDIT_READ,
  ],
  DOCTOR: [...DOCTOR_BASE_PERMISSIONS],
  SECRETARY: [
    PERMISSIONS.PATIENT_VIEW,
    PERMISSIONS.PATIENT_CREATE,
    PERMISSIONS.PATIENT_EDIT_CONTACT,
    PERMISSIONS.VISIT_MANAGE,
    PERMISSIONS.VISIT_ASSIGN_DOCTOR,
    PERMISSIONS.BILLING_COLLECT,
    PERMISSIONS.BILLING_VIEW,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.PURCHASE_OPERATIONAL_CREATE,
    PERMISSIONS.PURCHASE_VIEW,
    PERMISSIONS.EXPENSE_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.CRM_MANAGE,
    PERMISSIONS.MESSAGING_SEND,
    PERMISSIONS.CLOSING_MANAGE,
    PERMISSIONS.ATTACHMENT_VIEW,
    PERMISSIONS.ATTACHMENT_UPLOAD,
    GRANULAR_PERMISSIONS.PATIENTS_READ,
    GRANULAR_PERMISSIONS.PATIENTS_CREATE,
    GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS,
    GRANULAR_PERMISSIONS.APPOINTMENTS_READ,
    GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE,
    GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT,
    GRANULAR_PERMISSIONS.TREATMENTS_READ,
    GRANULAR_PERMISSIONS.PAYMENTS_VIEW,
    GRANULAR_PERMISSIONS.PAYMENTS_COLLECT,
    GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY,
    GRANULAR_PERMISSIONS.INVENTORY_READ,
    GRANULAR_PERMISSIONS.PURCHASES_REQUEST,
    GRANULAR_PERMISSIONS.MESSAGES_READ,
    GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL,
    GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE,
    GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND,
  ],
};

/** Business rules that override the generic matrix (confirmed in blueprint).
 * Discounts (pricing.discount), clinical record editing (treatments.*) and
 * medical-profile editing are NOT hard-blocked: the Owner can grant them to
 * any individual account explicitly (two-state model). */
const ROLE_HARD_BLOCKS: Partial<Record<Permission, Role[]>> = {
  [PERMISSIONS.PAYROLL_MANAGE]: ["SECRETARY", "DOCTOR", "MAIN_DOCTOR"],
  [PERMISSIONS.PAYROLL_VIEW]: ["SECRETARY", "DOCTOR", "MAIN_DOCTOR"],
  [PERMISSIONS.USERS_MANAGE]: ["ACCOUNTANT", "DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [PERMISSIONS.SETTINGS_MANAGE]: ["ACCOUNTANT", "DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [PERMISSIONS.REPORTS_FINANCIAL]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.PAYMENTS_VOID]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.FINANCIAL_PROFITS]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.PERMISSIONS_EDIT]: ["ACCOUNTANT", "DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.PURCHASES_APPROVE]: ["DOCTOR", "SECRETARY", "MAIN_DOCTOR"],
  [GRANULAR_PERMISSIONS.CLOSING_PREPARE]: ["DOCTOR"],
  [GRANULAR_PERMISSIONS.CLOSING_REVIEW]: ["DOCTOR", "SECRETARY"],
  [GRANULAR_PERMISSIONS.CLOSING_APPROVE]: ["ACCOUNTANT", "DOCTOR", "SECRETARY"],
  [GRANULAR_PERMISSIONS.SERVICES_CREATE]: ["ACCOUNTANT", "DOCTOR", "SECRETARY"],
  [GRANULAR_PERMISSIONS.SERVICES_EDIT]: ["ACCOUNTANT", "DOCTOR", "SECRETARY"],
  [GRANULAR_PERMISSIONS.SERVICES_DISABLE]: ["ACCOUNTANT", "DOCTOR", "SECRETARY"],
};

/** Preset roles (spec names). MAIN_DOCTOR/FINANCE are aliases of OWNER/ACCOUNTANT. */
export const PRESETS: Record<Role, string> = {
  OWNER: "MAIN_DOCTOR",
  MAIN_DOCTOR: "MAIN_DOCTOR",
  ACCOUNTANT: "FINANCE",
  DOCTOR: "DOCTOR",
  SECRETARY: "SECRETARY",
};

export const PRESET_LABELS: Record<string, string> = {
  MAIN_DOCTOR: "دكتور رئيسي (د. سامح)",
  FINANCE: "المالية",
  DOCTOR: "دكتور",
  SECRETARY: "سكرتيرة",
};

export interface PermissionUser {
  role: Role;
  permissionOverrides: string[];
}

/**
 * Full explicit check (V3 two-state model — Grant/Block only, no inheritance):
 * - Owner is unrestricted.
 * - Explicit GRANT:/DENY: entries (the materialized per-account map) win over
 *   everything, including role hard blocks: the Owner can Grant or Block any
 *   individual permission for any non-owner account.
 * - Accounts without explicit entries resolve to their role preset defaults
 *   (preset minus business hard blocks).
 */
export function hasPermission(user: PermissionUser, permission: Permission): boolean {
  if (user.role === "OWNER") return true; // حساب المالك يحمل كل الصلاحيات دائمًا
  const family = FAMILIES[permission] ?? [permission];
  const base = ROLE_PERMISSIONS[user.role] ?? [];
  let explicitGrant = false;
  let explicitDeny = false;
  let presetGrant = false;
  for (const f of family) {
    explicitGrant ||= user.permissionOverrides.includes(`GRANT:${f}`);
    explicitDeny ||= user.permissionOverrides.includes(`DENY:${f}`);
    presetGrant ||= base.includes(f as Permission);
  }
  if (explicitDeny) return false;
  if (explicitGrant) return true;
  return presetGrant && !(ROLE_HARD_BLOCKS[permission]?.includes(user.role) ?? false);
}

/** The effective permission set (legacy + granular) for a user — used by the UI shell. */
export function effectivePermissions(user: PermissionUser): string[] {
  const all = new Set<string>([...Object.values(PERMISSIONS), ...Object.values(GRANULAR_PERMISSIONS)]);
  return [...all].filter((p) => hasPermission(user, p as Permission)).sort();
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return hasPermission({ role, permissionOverrides: [] }, permission);
}

/** Permission keys a role does NOT get from its preset (modelled as a hard block for the default path). */
export function hardBlockedFor(role: Role, permission: Permission): boolean {
  return ROLE_HARD_BLOCKS[permission]?.includes(role) ?? false;
}

/**
 * Explicit defaults for a role preset: every granular permission resolves to
 * GRANTED (true) or BLOCKED (false). This is the ONLY role-derived state; it is
 * materialized into per-account entries on create / role change / reset.
 */
export function materializePreset(role: Role): Record<GranularPermission, boolean> {
  const map = {} as Record<GranularPermission, boolean>;
  for (const code of Object.values(GRANULAR_PERMISSIONS)) {
    if (role === "OWNER") {
      map[code] = true;
      continue;
    }
    const family = FAMILIES[code] ?? [code];
    const inPreset = family.some((f) => (ROLE_PERMISSIONS[role] ?? []).includes(f as Permission));
    map[code] = inPreset && !hardBlockedFor(role, code);
  }
  return map;
}

/** Serialize an explicit Grant/Block map into stored entries (GRANT:/DENY: per granular code). */
export function entriesFromMap(map: Record<GranularPermission, boolean>): string[] {
  return (Object.keys(map) as GranularPermission[])
    .map((code) => (map[code] ? `GRANT:${code}` : `DENY:${code}`))
    .sort();
}

/** The explicit Grant/Block map as the UI and save flows see it (every granular permission included). */
export function effectiveMapFor(user: PermissionUser): Record<GranularPermission, boolean> {
  const map = {} as Record<GranularPermission, boolean>;
  for (const code of Object.values(GRANULAR_PERMISSIONS)) {
    map[code] = hasPermission(user, code);
  }
  return map;
}

/** Counts of the two explicit states — shown in the permission editor summary. */
export function permissionCounts(map: Record<GranularPermission, boolean>): { granted: number; blocked: number } {
  let granted = 0;
  let blocked = 0;
  for (const v of Object.values(map)) {
    if (v) granted++;
    else blocked++;
  }
  return { granted, blocked };
}

/**
 * Pure (session-free) service-level gate: throws FORBIDDEN when the actor does
 * not hold the permission. Services call this themselves so server-side
 * enforcement never depends on the UI or the action layer.
 */
export function assertPermission(actor: PermissionUser, permission: Permission): void {
  if (!hasPermission(actor, permission)) {
    throw new AppError("لا تملك صلاحية تنفيذ هذا الإجراء", "FORBIDDEN");
  }
}

/** UI grouping for the Owner permission editor. */
export interface PermissionGroupItem {
  code: GranularPermission;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionGroupItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "customers",
    label: "العملاء",
    permissions: [
      { code: GRANULAR_PERMISSIONS.PATIENTS_READ, label: "عرض العملاء" },
      { code: GRANULAR_PERMISSIONS.PATIENTS_CREATE, label: "إضافة عميل" },
      { code: GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS, label: "تعديل البيانات الأساسية" },
      { code: GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL, label: "عرض السجل الطبي" },
      { code: GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL, label: "تعديل السجل الطبي" },
    ],
  },
  {
    key: "appointments",
    label: "المواعيد",
    permissions: [
      { code: GRANULAR_PERMISSIONS.APPOINTMENTS_READ, label: "عرض المواعيد" },
      { code: GRANULAR_PERMISSIONS.APPOINTMENTS_CREATE, label: "إنشاء موعد" },
      { code: GRANULAR_PERMISSIONS.APPOINTMENTS_EDIT, label: "تعديل موعد" },
      { code: GRANULAR_PERMISSIONS.APPOINTMENTS_CANCEL, label: "إلغاء موعد" },
    ],
  },
  {
    key: "treatments",
    label: "الجلسات",
    permissions: [
      { code: GRANULAR_PERMISSIONS.TREATMENTS_READ, label: "عرض الجلسات" },
      { code: GRANULAR_PERMISSIONS.TREATMENTS_CREATE, label: "تسجيل جلسة" },
      { code: GRANULAR_PERMISSIONS.TREATMENTS_EDIT, label: "تعديل جلسة" },
      { code: GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE, label: "إنهاء جلسة" },
    ],
  },
  {
    key: "payments",
    label: "التحصيل",
    permissions: [
      { code: GRANULAR_PERMISSIONS.PAYMENTS_VIEW, label: "عرض المبالغ المطلوبة" },
      { code: GRANULAR_PERMISSIONS.PAYMENTS_COLLECT, label: "تحصيل دفعة" },
      { code: GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY, label: "عرض سجل الدفعات" },
      { code: GRANULAR_PERMISSIONS.PAYMENTS_VOID, label: "عكس/إلغاء دفعة" },
    ],
  },
  {
    key: "inventory",
    label: "المخزون",
    permissions: [
      { code: GRANULAR_PERMISSIONS.INVENTORY_READ, label: "عرض المخزون" },
      { code: GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK, label: "إضافة كمية (استلام مخزون)" },
      { code: GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT, label: "تعديل بيانات المنتج" },
      { code: GRANULAR_PERMISSIONS.INVENTORY_ADJUST, label: "تسوية مخزون" },
      { code: GRANULAR_PERMISSIONS.INVENTORY_COUNT, label: "تنفيذ جرد" },
      { code: GRANULAR_PERMISSIONS.INVENTORY_DELETE, label: "حذف منتج" },
    ],
  },
  {
    key: "purchases",
    label: "المشتريات",
    permissions: [
      { code: GRANULAR_PERMISSIONS.PURCHASES_REQUEST, label: "إنشاء طلب شراء" },
      { code: GRANULAR_PERMISSIONS.PURCHASES_APPROVE, label: "اعتماد طلب شراء" },
      { code: GRANULAR_PERMISSIONS.PURCHASES_RECEIVE, label: "تسجيل استلام شراء" },
    ],
  },
  {
    key: "messages",
    label: "الرسائل",
    permissions: [
      { code: GRANULAR_PERMISSIONS.MESSAGES_READ, label: "عرض سجل الرسائل" },
      { code: GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL, label: "إرسال رسالة فردية" },
      { code: GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE, label: "إنشاء حملة" },
      { code: GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND, label: "إرسال حملة ترويجية" },
    ],
  },
  {
    key: "services",
    label: "كتالوج الخدمات",
    permissions: [
      { code: GRANULAR_PERMISSIONS.SERVICES_READ, label: "عرض كتالوج الخدمات" },
      { code: GRANULAR_PERMISSIONS.SERVICES_CREATE, label: "إضافة خدمة" },
      { code: GRANULAR_PERMISSIONS.SERVICES_EDIT, label: "تعديل خدمة" },
      { code: GRANULAR_PERMISSIONS.SERVICES_DISABLE, label: "تعطيل خدمة" },
    ],
  },
  {
    key: "pricing",
    label: "التسعير والخصم",
    permissions: [
      { code: GRANULAR_PERMISSIONS.PRICING_DISCOUNT, label: "منح خصم على الجلسة/الفاتورة" },
    ],
  },
  {
    key: "finance",
    label: "المالية",
    permissions: [
      { code: GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD, label: "عرض Dashboard المالي" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW, label: "عرض المصاريف" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_CREATE, label: "إضافة مصروف" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL, label: "عرض الرواتب" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT, label: "تعديل الرواتب" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES, label: "عرض الذمم" },
      { code: GRANULAR_PERMISSIONS.FINANCIAL_PROFITS, label: "عرض الأرباح" },
    ],
  },
  {
    key: "closing",
    label: "نهاية اليوم",
    permissions: [
      { code: GRANULAR_PERMISSIONS.CLOSING_PREPARE, label: "تحضير تسليم نهاية اليوم" },
      { code: GRANULAR_PERMISSIONS.CLOSING_REVIEW, label: "مراجعة نهاية اليوم" },
      { code: GRANULAR_PERMISSIONS.CLOSING_APPROVE, label: "اعتماد نهاية اليوم" },
    ],
  },
  {
    key: "administration",
    label: "الإدارة",
    permissions: [
      { code: GRANULAR_PERMISSIONS.USERS_MANAGE, label: "إدارة المستخدمين" },
      { code: GRANULAR_PERMISSIONS.PERMISSIONS_EDIT, label: "تعديل الصلاحيات" },
      { code: GRANULAR_PERMISSIONS.AUDIT_READ, label: "عرض سجل التدقيق" },
      { code: GRANULAR_PERMISSIONS.SETTINGS_MANAGE, label: "تعديل الإعدادات" },
    ],
  },
];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "الدكتور الرئيسي / المالك",
  MAIN_DOCTOR: "دكتور رئيسي (د. سامح)",
  ACCOUNTANT: "المحاسب المالي",
  DOCTOR: "دكتور",
  SECRETARY: "السكرتيرة",
};

export const ROLE_LABELS_EN: Record<Role, string> = {
  OWNER: "Owner / Main Doctor",
  MAIN_DOCTOR: "Main Doctor",
  ACCOUNTANT: "Accountant",
  DOCTOR: "Doctor",
  SECRETARY: "Secretary",
};
