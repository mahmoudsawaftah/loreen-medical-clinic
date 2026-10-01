import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/time";
import { payrollCostForPeriod, dailyPayrollCost, listPayrollPeriods } from "@/server/services/payroll-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { PayrollPeriodButton } from "@/components/hr/employee-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function PayrollPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const [monthlyCost, daily, periods] = await Promise.all([
    payrollCostForPeriod(user, currentMonth, currentYear),
    dailyPayrollCost(user, currentYear, currentMonth),
    listPayrollPeriods(user),
  ]);
  const period = periods.find((p) => p.month === currentMonth && p.year === currentYear) ?? null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("payroll.title", lang)}</h1>
          <p className="text-sm text-ink-500">{t("payroll.subtitle", lang)}</p>
        </div>
        <PayrollPeriodButton currentPeriod={period ? { id: period.id, month: period.month, year: period.year, status: period.status, total: formatMoney(period.items.reduce((a, i) => a + Number(i.finalSalary), 0), settings.currency, lang) } : null} currentCost={formatMoney(daily.totalMonthly, settings.currency, lang)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card><CardBody><p className="text-xs text-ink-500">{t("payroll.totalMonthly", lang)}</p><p className="text-xl font-bold tabular-nums">{formatMoney(monthlyCost, settings.currency, lang)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-ink-500">{t("payroll.dailyShare", lang)} ({daily.mode === "CALENDAR_DAYS" ? (lang === "ar" ? "أيام تقويمية" : "Calendar days") : (lang === "ar" ? "أيام عمل" : "Working days")})</p><p className="text-xl font-bold tabular-nums">{formatMoney(daily.dailyShare, settings.currency, lang)}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-ink-500">{t("payroll.currentMonth", lang)}: {currentMonth}/{currentYear}</p><p className="text-xl font-bold tabular-nums">{formatMoney(daily.totalMonthly, settings.currency, lang)}</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title={t("payroll.periods", lang)} actions={<Badge tone="neutral">{periods.length}</Badge>} />
        <CardBody className="p-0">
          {periods.length === 0 ? (
            <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("payroll.noPeriods", lang)}</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {periods.map((p) => {
                const total = p.items.reduce((a, i) => a + Number(i.finalSalary), 0);
                return (
                  <div key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-bold">{p.month}/{p.year}</span>
                    <span className="text-xs font-bold tabular-nums">{formatMoney(total, settings.currency, lang)}</span>
                    <span className="text-[11px] text-ink-400">{p.items.length} {t("payroll.employeeCount", lang)}</span>
                    <span className="mr-auto"><Badge tone={p.status === "DRAFT" ? "info" : "success"}>{p.status === "DRAFT" ? t("payroll.draft", lang) : t("payroll.approved", lang)}</Badge></span>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
