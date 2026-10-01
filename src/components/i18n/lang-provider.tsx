"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, t, type I18nKey, type Lang } from "@/lib/i18n/dict";

type LangCtx = {
  lang: Lang;
  t: (key: I18nKey) => string;
  setLang: (l: Lang) => void;
};

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Lang>(lang);

  const setLang = useCallback(
    (l: Lang) => {
      if (l === current) return;
      setCurrent(l);
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      try {
        localStorage.setItem(LANG_COOKIE, l);
      } catch {
        /* ignore */
      }
      router.refresh();
    },
    [router, current],
  );

  const value = useMemo<LangCtx>(() => {
    const translate = (key: I18nKey) => t(key, current);
    return { lang: current, t: translate, setLang };
  }, [current, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang must be used within a <LangProvider>");
  return ctx;
}