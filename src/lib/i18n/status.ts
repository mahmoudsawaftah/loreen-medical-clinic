import { t, type I18nKey, type Lang } from "./dict";

/** Domain → status value → i18n key. Mirrors the Arabic label maps in components/status.tsx. */
export const STATUS_KEYS: Record<string, Record<string, I18nKey>> = {
  visit: {
    REGISTERED: "st.visit.registered",
    WAITING: "st.visit.waiting",
    WITH_DOCTOR: "st.visit.withDoctor",
    TREATMENT_COMPLETED: "st.visit.treatmentCompleted",
    READY_FOR_PAYMENT: "st.visit.readyForPayment",
    PARTIALLY_PAID: "st.visit.partiallyPaid",
    PAID: "st.visit.paid",
    CLOSED: "st.visit.closed",
    CANCELLED: "st.visit.cancelled",
  },
  invoice: {
    UNPAID: "st.invoice.unpaid",
    PARTIALLY_PAID: "st.visit.partiallyPaid",
    PAID: "st.visit.paid",
    VOID: "st.invoice.void",
  },
  purchase: {
    PENDING: "st.purchase.pending",
    APPROVED: "st.purchase.approved",
    REJECTED: "st.purchase.rejected",
    NEEDS_CHANGES: "st.purchase.needsChanges",
    RECEIVED: "st.purchase.received",
    CANCELLED: "st.purchase.cancelled",
  },
  requestType: {
    OPERATIONAL: "st.requestType.operational",
    MEDICAL: "st.requestType.medical",
  },
  expense: {
    PENDING: "st.expense.pending",
    APPROVED: "st.expense.approved",
    REJECTED: "st.expense.rejected",
    VOID: "st.expense.void",
  },
  followUp: {
    PENDING: "st.followup.pending",
    CONTACTED: "st.followup.contacted",
    BOOKED: "st.followup.booked",
    NO_ANSWER: "st.followup.noAnswer",
    CLOSED: "st.followup.closed",
  },
  followUpType: {
    FOLLOW_UP: "st.followup.type.followUp",
    BIRTHDAY: "st.followup.type.birthday",
    REMINDER: "st.followup.type.reminder",
    OTHER: "st.followup.type.other",
  },
  stockMovement: {
    PURCHASE_RECEIPT: "st.stock.purchaseReceipt",
    TREATMENT_USAGE: "st.stock.treatmentUsage",
    WASTE: "st.stock.waste",
    EXPIRED: "st.stock.expired",
    ADJUSTMENT: "st.stock.adjustment",
    RETURN_TO_SUPPLIER: "st.stock.returnToSupplier",
    REVERSAL: "st.stock.reversal",
    PHYSICAL_COUNT_ADJUSTMENT: "st.stock.physicalCount",
  },
  closing: {
    OPEN: "st.closing.open",
    SUBMITTED: "st.closing.submitted",
    REVIEW_REQUIRED: "st.closing.reviewRequired",
    APPROVED: "st.closing.approved",
    CLOSED: "st.closing.closed",
    REOPENED: "st.closing.reopened",
  },
  paymentMethod: {
    CASH: "pay.cash",
    CLIQ: "pay.cliq",
    VISA: "pay.visa",
  },
};

/** Translated { value: label } record for a domain, e.g. statusLabels("visit", "en"). */
export function statusLabels(domain: string, lang: Lang): Record<string, string> {
  const map = STATUS_KEYS[domain] ?? {};
  const out: Record<string, string> = {};
  for (const [value, key] of Object.entries(map)) out[value] = t(key, lang);
  return out;
}

/** English/region locale per UI language (for date/number formatting). */
export function localeFor(lang: Lang): string {
  return lang === "ar" ? "ar-JO" : "en-GB";
}

/** Badge tone for a closing status (server-safe). */
export function closingTone(status: string): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "APPROVED":
    case "CLOSED":
      return "success";
    case "REVIEW_REQUIRED":
      return "danger";
    case "SUBMITTED":
    case "REOPENED":
      return "warning";
    default:
      return "neutral";
  }
}