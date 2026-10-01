"use client";

import Link from "next/link";
import { hasPermission, type Permission } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth/authorize";
import { useLang } from "@/components/i18n/lang-provider";
import type { I18nKey } from "@/lib/i18n/dict";

interface QuickAction {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
}

const BY_ROLE: Record<string, QuickAction[]> = {
  SECRETARY: [
    { href: "/today", label: "موعد جديد", icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", permission: "appointments.create" },
    { href: "/patients", label: "عميل جديد", icon: "M12 4v16m8-8H4", permission: "patients.create" },
    { href: "/ready-for-payment", label: "تحصيل", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", permission: "payments.collect" },
    { href: "/campaigns", label: "إرسال عرض", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", permission: "messages.campaign.create" },
  ],
  DOCTOR: [
    { href: "/visits", label: "المريض الحالي", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", permission: "treatments.read" },
    { href: "/visits", label: "تسجيل جلسة", icon: "M12 4v16m8-8H4", permission: "treatments.create" },
    { href: "/crm", label: "متابعة", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", permission: "messages.send_transactional" },
  ],
  OWNER: [
    { href: "/expenses", label: "إضافة مصروف", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a1 1 0 11-2 0 1 1 0 012 0z", permission: "financial.expenses.create" },
    { href: "/purchases", label: "تسجيل شراء", icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 4.6a1 1 0 00.9 1.4h12m-10 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm9 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z", permission: "purchases.receive" },
    { href: "/users", label: "إضافة موظف", icon: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4 0M16 7a4 4 0 11-8 0 4 4 0 018 0z", permission: "users.manage" },
    { href: "/inventory-counts", label: "جرد", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", permission: "inventory.count" },
  ],
  ACCOUNTANT: [
    { href: "/expenses", label: "إضافة مصروف", icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a1 1 0 11-2 0 1 1 0 012 0z", permission: "financial.expenses.create" },
    { href: "/receivables", label: "الذمم", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", permission: "financial.receivables" },
    { href: "/inventory-counts", label: "جرد", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", permission: "inventory.count" },
  ],
};

const QUICK_ACTION_KEYS: Partial<Record<string, I18nKey>> = {
  "موعد جديد": "quick.newAppointment",
  "عميل جديد": "quick.newCustomer",
  "تحصيل": "quick.collect",
  "إرسال عرض": "quick.sendOffer",
  "المريض الحالي": "quick.currentPatient",
  "تسجيل جلسة": "quick.recordTreatment",
  "متابعة": "quick.followUp",
  "إضافة مصروف": "quick.addExpense",
  "تسجيل شراء": "quick.recordPurchase",
  "إضافة موظف": "quick.addEmployee",
  "جرد": "quick.inventoryCount",
  "الذمم": "quick.receivables",
};

/** Role-aware quick actions; unauthorized/inapplicable actions are never rendered. */
export function QuickActions({ user }: { user: AuthUser }) {
  const { t } = useLang();
  const actions = (BY_ROLE[user.role] ?? []).filter((a) => hasPermission(user, a.permission));
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {actions.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-primary-700 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
          </svg>
          {QUICK_ACTION_KEYS[a.label] ? t(QUICK_ACTION_KEYS[a.label] as I18nKey) : a.label}
        </Link>
      ))}
    </div>
  );
}
