import type { Role } from "@prisma/client";
import { getOptionalUser, requireUser } from "@/lib/auth/authorize";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBanner } from "@/components/ui/display";
import { effectivePermissions } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { UnauthorizedError } from "@/lib/errors";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const lang = await getLang().catch(() => "ar" as const);
    if (e instanceof UnauthorizedError) {
      return (
        <div className="max-w-md mx-auto py-16 px-4">
          <ErrorBanner title={t("app.unauthorizedTitle", lang)} description={t("app.unauthorizedDesc", lang)} />
        </div>
      );
    }
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <ErrorBanner title={t("app.dbErrorTitle", lang)} description={t("app.dbErrorDesc", lang)} />
      </div>
    );
  }

  const settings = await getSettings();

  return (
    <AppShell user={{ name: user.name, englishName: user.englishName, role: user.role as Role, username: user.username, permissions: effectivePermissions(user), jobTitle: user.jobTitle }} brand={{ name: settings.clinicName || "LOREEN BEAUTY CLINIC", nameAr: settings.clinicNameAr || "عيادة لورين للتجميل" }}>
      {children}
    </AppShell>
  );
}

export async function getCurrentUserOrLogin() {
  const user = await getOptionalUser();
  return user;
}
