import type { I18nKey } from "./dict";

/** Map exact Arabic server messages (asserted by tests) to i18n keys for the UI. */
export const SERVER_ERROR_KEYS: Record<string, I18nKey> = {
  // auth
  "اسم المستخدم أو كلمة المرور غير صحيحة": "login.invalid",
  "هذا الحساب موقوف، يرجى مراجعة الإدارة": "login.disabled",
  "كلمة المرور الجديدة يجب ألا تقل عن 8 أحرف": "login.passwordTooShort",
  "كلمة المرور الحالية غير صحيحة": "login.invalid",
  "اسم المستخدم مطلوب": "login.required",
  "كلمة المرور مطلوبة": "login.required",
  "فشل تسجيل الدخول": "login.invalid",
  // validation fallback
  "VALIDATION": "common.none",
};

/** Translate a server-returned message when known; otherwise pass through. */
export function translateServerError(msg: string | null | undefined, t: (k: I18nKey) => string): string | null {
  if (!msg) return null;
  const key = SERVER_ERROR_KEYS[msg];
  return key ? t(key) : msg;
}