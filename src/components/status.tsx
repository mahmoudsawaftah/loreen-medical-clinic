import { Badge } from "@/components/ui/display";

export const VISIT_STATUS_LABELS: Record<string, string> = {
  REGISTERED: "مسجلة",
  WAITING: "بانتظار",
  WITH_DOCTOR: "مع الدكتور",
  TREATMENT_COMPLETED: "اكتمل العلاج",
  READY_FOR_PAYMENT: "بانتظار الدفع",
  PARTIALLY_PAID: "دفع جزئي",
  PAID: "مدفوعة",
  CLOSED: "مغلقة",
  CANCELLED: "ملغاة",
};

export const VISIT_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  REGISTERED: "neutral",
  WAITING: "warning",
  WITH_DOCTOR: "info",
  TREATMENT_COMPLETED: "info",
  READY_FOR_PAYMENT: "warning",
  PARTIALLY_PAID: "purple",
  PAID: "success",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "كاش",
  CLIQ: "CliQ",
  VISA: "فيزا",
};

export const PAYMENT_METHOD_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  CASH: "success",
  CLIQ: "info",
  VISA: "purple",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: "غير مدفوعة",
  PARTIALLY_PAID: "دفع جزئي",
  PAID: "مدفوعة",
  VOID: "ملغاة",
};

export const INVOICE_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  UNPAID: "warning",
  PARTIALLY_PAID: "purple",
  PAID: "success",
  VOID: "danger",
};

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "معتمدة",
  REJECTED: "مرفوضة",
  NEEDS_CHANGES: "تحتاج تعديل",
  RECEIVED: "تم الاستلام",
  CANCELLED: "ملغاة",
};

export const PURCHASE_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDING: "warning",
  APPROVED: "info",
  REJECTED: "danger",
  NEEDS_CHANGES: "purple",
  RECEIVED: "success",
  CANCELLED: "danger",
};

export const REQUEST_TYPE_LABELS: Record<string, string> = {
  OPERATIONAL: "تشغيلي",
  MEDICAL: "طبي",
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  PENDING: "قيد الاعتماد",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  VOID: "ملغى",
};

export const FOLLOW_UP_STATUS_LABELS: Record<string, string> = {
  PENDING: "معلقة",
  CONTACTED: "تم التواصل",
  BOOKED: "تم الحجز",
  NO_ANSWER: "لا رد",
  CLOSED: "مغلقة",
};

export const FOLLOW_UP_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PENDING: "warning",
  CONTACTED: "info",
  BOOKED: "success",
  NO_ANSWER: "danger",
  CLOSED: "neutral",
};

export const FOLLOW_UP_TYPE_LABELS: Record<string, string> = {
  FOLLOW_UP: "متابعة",
  BIRTHDAY: "عيد ميلاد",
  REMINDER: "تذكير",
  OTHER: "أخرى",
};

export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "شراء / استلام",
  TREATMENT_USAGE: "جلسة علاجية",
  WASTE: "تالف",
  EXPIRED: "انتهاء صلاحية",
  ADJUSTMENT: "تسوية جرد",
  RETURN_TO_SUPPLIER: "مرجع للمورد",
  REVERSAL: "عكس حركة",
  PHYSICAL_COUNT_ADJUSTMENT: "جرد فعلي",
};

export const STOCK_MOVEMENT_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  PURCHASE_RECEIPT: "success",
  TREATMENT_USAGE: "info",
  WASTE: "warning",
  EXPIRED: "danger",
  ADJUSTMENT: "purple",
  RETURN_TO_SUPPLIER: "warning",
  REVERSAL: "danger",
  PHYSICAL_COUNT_ADJUSTMENT: "purple",
};

export const CLOSING_STATUS_LABELS: Record<string, string> = {
  OPEN: "مفتوح",
  SUBMITTED: "بانتظار المراجعة",
  REVIEW_REQUIRED: "إعادة للمراجعة",
  APPROVED: "معتمد",
  CLOSED: "مغلق",
  REOPENED: "أعيد فتحه",
};

export const CLOSING_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = {
  OPEN: "neutral",
  SUBMITTED: "warning",
  REVIEW_REQUIRED: "danger",
  APPROVED: "success",
  CLOSED: "success",
  REOPENED: "warning",
};

export function StatusBadge({ status, labels, tones }: { status: string; labels: Record<string, string>; tones?: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> }) {
  return <Badge tone={tones?.[status] ?? "neutral"}>{labels[status] ?? status}</Badge>;
}