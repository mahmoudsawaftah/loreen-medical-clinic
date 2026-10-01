"use client";

import Link from "next/link";
import { ErrorBanner } from "@/components/ui/display";
import { useLang } from "@/components/i18n/lang-provider";

export function AccessDenied() {
  const { t } = useLang();
  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center">
      <ErrorBanner title={t("app.unauthorizedTitle")} description={t("app.unauthorizedDesc")} />
      <Link href="/dashboard" className="inline-block mt-4 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700">
        {t("nav.dashboard")}
      </Link>
    </div>
  );
}
