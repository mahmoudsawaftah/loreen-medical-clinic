import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function LoginPage() {
  const user = await getOptionalUser();
  if (user) redirect("/dashboard");
  const settings = await getSettings();
  const lang = await getLang();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-primary-100 via-primary-50 to-ink-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-ink-200 p-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-50 shadow-[0_0_0_4px_rgba(200,161,90,0.08)]">
                <Image src="/loreen-logo.svg" alt="" width={48} height={48} unoptimized priority className="h-12 w-12" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-ink-900">{settings.clinicName || "LOREEN BEAUTY CLINIC"}</h1>
                <p className="text-xs text-primary-700">{settings.clinicNameAr || t("app.brandFallback", lang)} — {t("login.subtitle", lang)}</p>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-[11px] text-ink-400 text-center">{t("login.demoHint", lang)}</p>
        </div>
      </div>
    </div>
  );
}
