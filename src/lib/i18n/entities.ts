import type { Lang } from "./dict";

export function uiText(lang: Lang, ar: string, en: string): string {
  return lang === "en" ? en : ar;
}

/** Picks the stored name that matches the language selected by the user. */
export function localizedName(name: string, englishName: string | null | undefined, lang: Lang): string {
  return lang === "en" ? (englishName?.trim() || name) : name;
}

/** Safe fallback for older rows created before bilingual fields were added. */
export function localizedText(value: string | null | undefined, englishValue: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  return localizedName(value, englishValue, lang);
}

const INVENTORY_TERMS: Record<string, string> = {
  "مستحضرات": "Cosmetics",
  "مستلزمات طبية": "Medical supplies",
  "حقن": "Injections",
  "تنظيف": "Cleansing",
  "تقشير": "Peel",
  "ليزر": "Laser",
  "علاج": "Treatment",
  "وحدة": "unit",
  "مل": "ml",
  "سرنجة": "syringe",
  "عبوة": "pack",
  "حبة": "piece",
  "قطعة": "piece",
  "زجاجة": "bottle",
  "أنبوب": "tube",
};

export function localizedInventoryTerm(value: string | null | undefined, lang: Lang): string {
  if (!value || lang === "ar") return value ?? "";
  return INVENTORY_TERMS[value] ?? value;
}
