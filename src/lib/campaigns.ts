export type AudienceType = "ALL" | "BOTOX" | "FILLER" | "NEW" | "RETURNING" | "INACTIVE" | "BIRTHDAY" | "DOCTOR" | "MANUAL";

export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  ALL: "جميع العملاء المؤهلين",
  BOTOX: "عملاء البوتوكس",
  FILLER: "عملاء الفيلر",
  NEW: "عملاء جدد",
  RETURNING: "عملاء متكررون",
  INACTIVE: "عملاء غير نشطين",
  BIRTHDAY: "أعياد الميلاد القادمة",
  DOCTOR: "عملاء دكتور محدد",
  MANUAL: "اختيار يدوي",
};

export interface CampaignInput {
  name: string;
  audienceType: AudienceType;
  doctorId?: string | null;
  customerIds?: string[];
  messageTemplate: string;
}

export const VALID_PHONE_RE = /\d{7,}/;

export function hasValidPhone(phone: string): boolean {
  return VALID_PHONE_RE.test(phone.replace(/[\s+()-]/g, ""));
}

export interface CampaignPreview {
  matched: number;
  validPhone: number;
  optedOut: number;
  final: number;
  sample: string;
}

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  SCHEDULED: "مجدولة",
  SENDING: "جارٍ الإرسال",
  COMPLETED: "مكتملة",
  PARTIAL_FAILURE: "فشل جزئي",
  CANCELLED: "ملغاة",
};