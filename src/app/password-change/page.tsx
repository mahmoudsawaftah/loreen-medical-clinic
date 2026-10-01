import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth/authorize";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function PasswordChangePage() {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  const lang = await getLang();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-primary-50 via-ink-50 to-ink-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-ink-200 p-8">
        <h1 className="text-lg font-bold text-ink-900 mb-6">{t("login.changePasswordTitle", lang)}</h1>
        <p className="text-xs text-ink-500 mb-4">{t("login.mustChangeMsg", lang).replace("{name}", user.name)}</p>
        <PasswordChangeForm />
      </div>
    </div>
  );
}