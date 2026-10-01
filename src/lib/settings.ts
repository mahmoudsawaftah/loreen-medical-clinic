import { db } from "./db";
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE, daysInMonth } from "./time";
import { money, moneyDiv } from "./money";

/**
 * Central settings store (Setting table, JSON values).
 * TBD business policies are exposed here as configuration — disabled/safe defaults,
 * never invented clinic policy. See IMPLEMENTATION_REPORT.md for the full TBD list.
 */

export interface ClinicSettings {
  clinicName: string;
  clinicNameAr: string;
  clinicPhone: string;
  timezone: string;
  currency: string;
  sessionTtlMinutes: number;

  // --- TBD / configurable business policies (disabled by default) ---
  /** TBD: is daily closing mandatory before starting a new day? (default: false) */
  closingMandatory: boolean;
  /** TBD: split payment (multi-method per invoice) allowed? (default: false) */
  splitPaymentEnabled: boolean;
  /** TBD: partial payment / outstanding debts enabled? (default: false) */
  partialPaymentEnabled: boolean;
  /** TBD: allow refunds of paid invoices? (default: false) */
  refundEnabled: boolean;
  /** TBD: is discount reason mandatory? (default: false) */
  discountReasonRequired: boolean;
  /** TBD: when to deduct inventory: TREATMENT_COMPLETED (default) | READY_FOR_PAYMENT | PAYMENT */
  inventoryDeductAt: "TREATMENT_COMPLETED" | "READY_FOR_PAYMENT" | "PAYMENT";
  /** TBD: salary daily allocation mode (default: CALENDAR_DAYS) */
  salaryAllocationMode: "CALENDAR_DAYS" | "WORKING_DAYS";
  /** TBD: owner-created purchase requests are auto-approved? (default: true) */
  ownerPurchaseAutoApproved: boolean;
  /** TBD: do expenses require owner approval before counting? (default: true) */
  expensesRequireApproval: boolean;
  /** TBD: can accountants create expenses? (default: true) */
  accountantCanCreateExpenses: boolean;
  /** TBD: commissions for doctors/employees (default: false — not configured) */
  commissionsEnabled: boolean;
  /** TBD: allow negative stock? (default: false) */
  allowNegativeStock: boolean;
  /** TBD: export format (default: csv) */
  exportFormat: "csv" | "excel" | "pdf";
  /** TBD: messaging channel default (default: mock) */
  messagingChannel: "whatsapp" | "sms" | "manual" | "mock";
  /** TBD: before/after photos on patient files (default: false) */
  beforeAfterPhotosEnabled: boolean;
  /** TBD: appointments module (default: false — walk-in check-in only) */
  appointmentsEnabled: boolean;

  // --- operational toggles ---
  doctorsCanCreateMedicalPurchaseRequests: boolean;
  doctorsCanCreateOperationalPurchaseRequests: boolean;
  doctorsCanSeeFinancialReports: boolean;
  doctorsCanRecordWaste: boolean;
}

export const DEFAULT_SETTINGS: ClinicSettings = {
  clinicName: "LOREEN BEAUTY CLINIC",
  clinicNameAr: "عيادة لورين للتجميل",
  clinicPhone: "",
  timezone: DEFAULT_TIMEZONE,
  currency: DEFAULT_CURRENCY,
  sessionTtlMinutes: 720,
  closingMandatory: false,
  splitPaymentEnabled: false,
  partialPaymentEnabled: false,
  refundEnabled: false,
  discountReasonRequired: false,
  inventoryDeductAt: "TREATMENT_COMPLETED",
  salaryAllocationMode: "CALENDAR_DAYS",
  ownerPurchaseAutoApproved: true,
  expensesRequireApproval: true,
  accountantCanCreateExpenses: true,
  commissionsEnabled: false,
  allowNegativeStock: false,
  exportFormat: "csv",
  messagingChannel: "mock",
  beforeAfterPhotosEnabled: false,
  appointmentsEnabled: false,
  doctorsCanCreateMedicalPurchaseRequests: false,
  doctorsCanCreateOperationalPurchaseRequests: false,
  doctorsCanSeeFinancialReports: false,
  doctorsCanRecordWaste: false,
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof ClinicSettings)[];

function parseValue(key: keyof ClinicSettings, raw: string): ClinicSettings[keyof ClinicSettings] {
  const def = DEFAULT_SETTINGS[key];
  switch (typeof def) {
    case "boolean":
      return (String(raw) === "true") as never;
    case "number":
      return (Number(raw) || 0) as never;
    default:
      return (String(raw)) as never;
  }
}

export async function getSettings(): Promise<ClinicSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: SETTING_KEYS as string[] } } });
  const out: ClinicSettings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    const key = r.key as keyof ClinicSettings;
    if (key in DEFAULT_SETTINGS) {
      try {
        const parsed = JSON.parse(r.value);
        out[key] = parsed as never;
      } catch {
        (out as unknown as Record<string, unknown>)[key] = parseValue(key, r.value);
      }
    }
  }
  return out;
}

export async function setSetting(key: keyof ClinicSettings, value: unknown, updatedById?: string | null): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value: JSON.stringify(value), updatedById: updatedById ?? null },
    create: { key, value: JSON.stringify(value), updatedById: updatedById ?? null },
  });
}

export async function updateSettings(partial: Partial<ClinicSettings>, updatedById?: string): Promise<ClinicSettings> {
  const tx = await db.$transaction(
    Object.entries(partial).map(([key, value]) =>
      db.setting.upsert({
        where: { key },
        update: { value: JSON.stringify(value), updatedById: updatedById ?? null },
        create: { key, value: JSON.stringify(value), updatedById: updatedById ?? null },
      }),
    ),
  );
  void tx;
  return getSettings();
}

/** Daily salary share per employee for a given month, per configured allocation mode. */
export function dailySalaryShare(monthlySalary: number, year: number, month: number, mode: ClinicSettings["salaryAllocationMode"]): number {
  // month: 1-12
  const days = daysInMonth(year, month);
  // WORKING_DAYS: 30-day assumption documented; adjustable via settings when business decides.
  const divisor = mode === "WORKING_DAYS" ? 30 : days;
  return moneyDiv(money(monthlySalary), money(divisor)).toNumber();
}
