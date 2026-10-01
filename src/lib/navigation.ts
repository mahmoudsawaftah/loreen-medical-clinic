import type { Role } from "@prisma/client";
import { GRANULAR_PERMISSIONS, type Permission } from "@/lib/permissions";
import type { I18nKey } from "@/lib/i18n/dict";

/**
 * Pure navigation source of truth (no server-only, no next deps).
 * The sidebar, bottom bar, quick actions and the per-route guard layouts all
 * derive from this module so hidden UI and page-level enforcement never drift.
 *
 * UX rule: an item is visible only when the role is allowed AND (if
 * `anyOf` is set) the user holds at least one of the listed permissions.
 * Unauthorized items simply do not render — no disabled placeholders.
 */

export interface NavItem {
  href: string;
  label: string;
  /** i18n dictionary key for the translated label. */
  labelKey?: I18nKey;
  roles: Role[];
  icon: string;
  /** Show when the user holds ANY of these permissions (undefined = role-based only). */
  anyOf?: Permission[];
  /** Keep detail routes available without adding duplicate daily-work links to the sidebar. */
  showInSidebar?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "مركز العمل", labelKey: "nav.workspace", roles: ["OWNER", "ACCOUNTANT", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { href: "/today", label: "مواعيد اليوم", labelKey: "nav.today", roles: ["OWNER", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.APPOINTMENTS_READ], showInSidebar: false, icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { href: "/visits", label: "الاستقبال / الجلسات", labelKey: "nav.visits", roles: ["OWNER", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.TREATMENTS_READ], showInSidebar: false, icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
  { href: "/services", label: "كتالوج الخدمات", labelKey: "nav.services", roles: ["OWNER", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.SERVICES_READ], icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" },
  { href: "/ready-for-payment", label: "بانتظار التحصيل", labelKey: "nav.readyForPayment", roles: ["OWNER", "SECRETARY", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.PAYMENTS_VIEW], showInSidebar: false, icon: "M9 8h6m-6 4h6m-6 4h3m8-3a9 9 0 11-18 0 9 9 0 0118 0zm-9 5v1" },
  { href: "/patients", label: "العملاء", labelKey: "nav.patients", roles: ["OWNER", "ACCOUNTANT", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.PATIENTS_READ], icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/crm", label: "المتابعات", labelKey: "nav.crm", roles: ["OWNER", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.MESSAGES_SEND_TRANSACTIONAL], icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/campaigns", label: "الرسائل والعروض", labelKey: "nav.campaigns", roles: ["OWNER", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE, GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND], icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
  { href: "/messages", label: "سجل الرسائل", labelKey: "nav.messages", roles: ["OWNER", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.MESSAGES_READ], icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/invoices", label: "الفواتير", labelKey: "nav.invoices", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.PAYMENTS_VIEW_HISTORY], icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/inventory", label: "المخزون", labelKey: "nav.inventory", roles: ["OWNER", "ACCOUNTANT", "MAIN_DOCTOR", "DOCTOR", "SECRETARY"], anyOf: [GRANULAR_PERMISSIONS.INVENTORY_READ], icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { href: "/purchases", label: "طلبات الشراء", labelKey: "nav.purchases", roles: ["OWNER", "ACCOUNTANT", "SECRETARY", "MAIN_DOCTOR", "DOCTOR"], anyOf: [GRANULAR_PERMISSIONS.PURCHASES_REQUEST, GRANULAR_PERMISSIONS.PURCHASES_APPROVE, GRANULAR_PERMISSIONS.PURCHASES_RECEIVE], icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 4.6a1 1 0 00.9 1.4h12m-10 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm9 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" },
  { href: "/expenses", label: "المصاريف", labelKey: "nav.expenses", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.FINANCIAL_EXPENSES_VIEW], icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a1 1 0 11-2 0 1 1 0 012 0z" },
  { href: "/receivables", label: "الذمم", labelKey: "nav.receivables", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.FINANCIAL_RECEIVABLES], icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/sources", label: "مصادر التعريف", labelKey: "nav.sources", roles: ["OWNER", "ACCOUNTANT"], icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/payroll", label: "الرواتب", labelKey: "nav.payroll", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL], icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/employees", label: "الموظفون والرواتب", labelKey: "nav.employees", roles: ["OWNER"], icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/inventory-counts", label: "الجرد", labelKey: "nav.inventoryCounts", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.INVENTORY_COUNT], icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/control", label: "مركز التحكم", labelKey: "nav.control", roles: ["OWNER", "ACCOUNTANT"], icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/reports", label: "التقارير", labelKey: "nav.reports", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.FINANCIAL_PROFITS], icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/audit", label: "سجل التدقيق", labelKey: "nav.audit", roles: ["OWNER", "ACCOUNTANT"], anyOf: [GRANULAR_PERMISSIONS.AUDIT_READ], icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/users", label: "المستخدمون والصلاحيات", labelKey: "nav.users", roles: ["OWNER"], anyOf: [GRANULAR_PERMISSIONS.USERS_MANAGE], icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a4 4 0 11-8 0 4 4 0 018 0zM13 7a4 4 0 11-8 0 4 4 0 018 0z" },
  { href: "/settings", label: "الإعدادات", labelKey: "nav.settings", roles: ["OWNER"], anyOf: [GRANULAR_PERMISSIONS.SETTINGS_MANAGE], icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export const CLOSING_ITEM: NavItem = { href: "/closing", label: "نهاية اليوم", labelKey: "nav.closing", roles: ["OWNER", "ACCOUNTANT", "SECRETARY", "MAIN_DOCTOR", "DOCTOR"], anyOf: [GRANULAR_PERMISSIONS.CLOSING_PREPARE, GRANULAR_PERMISSIONS.CLOSING_REVIEW, GRANULAR_PERMISSIONS.CLOSING_APPROVE], icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" };

/** Daily-work priority per role (spec lists). Items not listed follow NAV order. */
export const NAV_ORDER: Partial<Record<Role, string[]>> = {
  SECRETARY: ["/dashboard", "/patients", "/crm", "/campaigns", "/inventory", "/purchases", "/closing", "/messages"],
  DOCTOR: ["/dashboard", "/patients", "/crm", "/inventory", "/purchases"],
  MAIN_DOCTOR: ["/dashboard", "/today", "/visits", "/patients", "/crm", "/inventory", "/purchases", "/reports", "/audit", "/closing", "/services"],
  ACCOUNTANT: ["/dashboard", "/expenses", "/receivables", "/payroll", "/invoices", "/purchases", "/inventory", "/inventory-counts", "/control", "/reports", "/audit", "/closing"],
  OWNER: ["/dashboard", "/expenses", "/inventory", "/invoices", "/receivables", "/payroll", "/purchases", "/employees", "/inventory-counts", "/patients", "/reports", "/control", "/closing", "/users", "/settings", "/audit", "/campaigns", "/messages"],
};

/** Sidebar groups keep the daily workspace visible and tuck away infrequent tools. */
export const NAV_GROUPS = [
  { key: "daily", labelKey: "nav.groupDaily", hrefs: ["/dashboard", "/today", "/visits", "/patients", "/crm"] },
  { key: "operations", labelKey: "nav.groupOperations", hrefs: ["/ready-for-payment", "/services", "/inventory", "/purchases", "/campaigns", "/messages"] },
  { key: "finance", labelKey: "nav.groupFinance", hrefs: ["/invoices", "/receivables", "/expenses", "/payroll", "/reports", "/control", "/closing"] },
  { key: "management", labelKey: "nav.groupManagement", hrefs: ["/employees", "/inventory-counts", "/sources", "/users", "/settings", "/audit"] },
] as const satisfies ReadonlyArray<{ key: string; labelKey: I18nKey; hrefs: readonly string[] }>;

export interface NavUser {
  role: Role;
  permissions: string[];
}

/** True when the nav item may render for this user (role + any-permission). */
export function itemVisible(item: NavItem, user: NavUser): boolean {
  if (!item.roles.includes(user.role)) return false;
  if (item.anyOf && !item.anyOf.some((p) => user.permissions.includes(p))) return false;
  return true;
}

/** Ordered, permission-filtered nav items for a user (no disabled placeholders). */
export function navItemsFor(user: NavUser): NavItem[] {
  const visible = [...NAV, CLOSING_ITEM].filter((n) => n.showInSidebar !== false && itemVisible(n, user));
  const order = NAV_ORDER[user.role] ?? [];
  return [...visible].sort((a, b) => {
    const ia = order.indexOf(a.href);
    const ib = order.indexOf(b.href);
    if (ia === -1 && ib === -1) return NAV.indexOf(a) - NAV.indexOf(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/** Route-level enforcement: the same data the sidebar uses (roles + any-of). */
export const ROUTE_GUARDS: Record<string, { roles?: Role[]; anyOf?: Permission[] }> = Object.fromEntries(
  [...NAV, CLOSING_ITEM].map((n) => [n.href, { roles: n.roles, anyOf: n.anyOf }] as const),
);
