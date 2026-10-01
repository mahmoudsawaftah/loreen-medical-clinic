"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { EmployeeActions, type EmployeeItem, type AccountItem } from "@/components/hr/employee-forms";
import { UserRowActions } from "@/components/users/user-manager";
import { useLang } from "@/components/i18n/lang-provider";
import { localizedName } from "@/lib/i18n/entities";

export function EmployeesTabs({
  employees,
  accounts,
  canEdit,
  presetLabels,
  selfId,
}: {
  employees: EmployeeItem[];
  accounts: AccountItem[];
  canEdit: boolean;
  presetLabels: Record<AccountItem["role"], string>;
  selfId: string;
}) {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<"employees" | "accounts">("employees");
  const tabCls = (active: boolean) =>
    cn(
      "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
      active ? "bg-primary-600 text-white" : "text-ink-500 hover:bg-ink-50",
    );

  return (
    <>
      <div className="flex gap-1 mb-4 bg-ink-50/70 rounded-xl p-1 w-fit" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "employees"} onClick={() => setTab("employees")} className={tabCls(tab === "employees")}>
          {t("employees.tabs")} ({employees.length})
        </button>
        <button type="button" role="tab" aria-selected={tab === "accounts"} onClick={() => setTab("accounts")} className={tabCls(tab === "accounts")}>
          {t("employees.accountTab")} ({accounts.length})
        </button>
      </div>

      {tab === "employees" && (
        <Card>
          <CardHeader title={t("employees.tabs")} actions={<Badge tone="neutral">{employees.length}</Badge>} />
          <CardBody className="p-0 overflow-x-auto">
            {employees.length === 0 ? (
              <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("employees.noEmployees")}</p>
            ) : (
              <Table headers={[t("common.name"), t("payroll.jobTitle"), lang === "ar" ? "الراتب الحالي" : "Current salary", t("payroll.startDate"), lang === "ar" ? "نهاية الخدمة" : "End date", lang === "ar" ? "الحساب المرتبط" : "Linked account", t("common.status"), ""]}>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <Td>
                      <span className="font-medium">{localizedName(e.name, e.englishName, lang)}</span>
                      {e.notes && <span className="block text-[11px] text-ink-400">{e.notes}</span>}
                    </Td>
                    <Td className="text-xs">{e.jobTitle}</Td>
                    <Td><span className="text-sm font-bold tabular-nums">{e.monthlySalary} JOD <span className="text-[11px] font-normal text-ink-400">/ {lang === "ar" ? "شهر" : "month"}</span></span></Td>
                    <Td className="text-xs whitespace-nowrap">{e.startDate}</Td>
                    <Td className="text-xs whitespace-nowrap">{e.endDate ?? "—"}</Td>
                    <Td className="text-xs">{e.user ? <span dir="ltr">{e.user.username}</span> : (lang === "ar" ? "بدون حساب" : "No account")}</Td>
                    <Td><Badge tone={e.active ? "success" : "neutral"}>{e.active ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "خارج الخدمة" : "Inactive")}</Badge></Td>
                    <Td>{canEdit && <EmployeeActions employee={e} canEdit />}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "accounts" && (
        <Card>
          <CardHeader title={t("employees.accountTab")} actions={<Badge tone="neutral">{accounts.length}</Badge>} />
          <CardBody className="p-0 overflow-x-auto">
            {accounts.length === 0 ? (
              <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("employees.noAccounts")}</p>
            ) : (
              <Table headers={[lang === "ar" ? "الموظف" : "Employee", t("users.username"), t("users.role"), t("common.status"), ""]}>
                {accounts.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <span className="font-medium">{localizedName(u.linkedEmployeeName ?? u.name, u.englishName, lang)}</span>
                      {u.id === selfId && <Badge tone="purple">{t("common.you")}</Badge>}
                      <span className="block text-[11px] text-ink-400">{u.linkedEmployeeName ? (lang === "ar" ? "مرتبط بموظف" : "Linked to employee") : (lang === "ar" ? "حساب مستقل" : "Standalone account")}</span>
                    </Td>
                    <Td className="text-right"><span dir="ltr">{u.username}</span></Td>
                    <Td>
                      <span className="text-sm">{presetLabels[u.role] ?? u.role}</span>
                    </Td>
                    <Td><Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status === "ACTIVE" ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "موقوف" : "Inactive")}</Badge></Td>
                    <Td><UserRowActions user={u} selfId={selfId} /></Td>
                  </tr>
                ))}
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
