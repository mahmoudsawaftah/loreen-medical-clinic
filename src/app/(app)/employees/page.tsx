import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { hasPermission, GRANULAR_PERMISSIONS, PRESET_LABELS, PRESETS } from "@/lib/permissions";
import { listEmployees } from "@/server/services/payroll-service";
import { listUsers } from "@/server/services/user-service";
import { EmployeeModal, type EmployeeItem, type AccountItem } from "@/components/hr/employee-forms";
import { EmployeesTabs } from "@/components/hr/employees-tabs";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export async function generateMetadata() {
  const lang = await getLang();
  return { title: t("employees.title", lang) };
}

export default async function EmployeesPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const canEdit = hasPermission(user, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL_EDIT);
  const [employees, accounts] = await Promise.all([listEmployees(user), listUsers(user)]);
  const userPicks = accounts.map((u) => ({ id: u.id, name: u.name }));

  const items: EmployeeItem[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    englishName: e.englishName,
    jobTitle: e.jobTitle,
    monthlySalary: Number(e.monthlySalary),
    startDate: formatDate(e.startDate, settings.timezone),
    endDate: e.endDate ? formatDate(e.endDate, settings.timezone) : null,
    active: e.active,
    notes: e.notes,
    userId: e.userId,
    user: e.user ? { id: e.user.id, username: e.user.username, role: e.user.role, status: e.user.status, englishName: e.user.englishName } : null,
  }));

  const accountRows: AccountItem[] = accounts.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    englishName: u.englishName,
    role: u.role,
    status: u.status,
    permissionOverrides: u.permissionOverrides,
    employeeSalary: u.employeeSalary,
    linkedEmployeeName: employees.find((e) => e.userId === u.id)?.name ?? null,
  }));

  const presetLabels: Record<AccountItem["role"], string> = {
    OWNER: lang === "en" ? "Owner" : PRESET_LABELS[PRESETS.OWNER],
    MAIN_DOCTOR: lang === "en" ? "Main Doctor" : PRESET_LABELS[PRESETS.MAIN_DOCTOR],
    DOCTOR: lang === "en" ? "Doctor" : PRESET_LABELS[PRESETS.DOCTOR],
    SECRETARY: lang === "en" ? "Receptionist" : PRESET_LABELS[PRESETS.SECRETARY],
    ACCOUNTANT: lang === "en" ? "Accountant" : PRESET_LABELS[PRESETS.ACCOUNTANT],
  };

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("employees.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{items.length} {t("employees.subtitle", lang).split(" · ")[0]} · {accountRows.length} {lang === "ar" ? "حساب دخول" : "login accounts"} — {lang === "ar" ? "مع سجل رواتب مستقل لكل موظف" : "with an independent payroll record for each employee"}</p>

      {canEdit && (
        <div className="mb-5 flex gap-2">
          <EmployeeModal userIds={userPicks.filter((u) => !employees.some((e) => e.userId === u.id))} />
        </div>
      )}

      <EmployeesTabs
        employees={items}
        accounts={accountRows}
        canEdit={canEdit}
        presetLabels={presetLabels}
        selfId={user.id}
      />
    </>
  );
}
