"use client";

import { cn } from "@/lib/cn";
import { useLang } from "./lang-provider";
import type { Lang } from "@/lib/i18n/dict";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "ar", label: "عربي" },
  { value: "en", label: "EN" },
];

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={cn("inline-flex items-center rounded-lg border border-ink-200 bg-white p-0.5", className)}
      role="group"
      aria-label="Language"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLang(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
            lang === o.value ? "bg-primary-600 text-white shadow-sm" : "text-ink-500 hover:bg-ink-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}