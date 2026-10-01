import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { customRange, thisMonthRange, todayRange, formatMoney } from "@/lib/time";
import { financialMetrics, revenueReport, collectionsByMethodReport, expensesReport, purchasesReport, inventoryUsageReport, servicesReport, doctorActivityReport, discountsReport, patientsReport } from "@/server/services/reporting-service";
import { Card, CardHeader, CardBody, StatCard } from "@/components/ui/display";
import { CsvExportButton } from "@/components/csv-export-button";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { localeFor } from "@/lib/i18n/status";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const canFinancial = hasPermission(user, PERMISSIONS.REPORTS_FINANCIAL);
  const settings = await getSettings();
  const lang = await getLang();

  let range;
  if (sp.from && sp.to) {
    range = customRange(new Date(sp.from), new Date(sp.to), settings.timezone);
  } else if (sp.from || sp.to) {
    range = sp.from ? customRange(new Date(sp.from), new Date(sp.from), settings.timezone) : todayRange(settings.timezone);
  } else {
    range = thisMonthRange(settings.timezone);
  }

  const m = await financialMetrics(user, range);
  const rangeLabel = `${new Date(range.start).toLocaleDateString(localeFor(lang))} → ${new Date(range.end).toLocaleDateString(localeFor(lang))}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("reports.financialTitle", lang)}</h1>
          <p className="text-sm text-ink-500">{rangeLabel}</p>
        </div>
        <form className="flex items-center gap-2" method="get">
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="h-9 rounded-lg border border-ink-300 px-3 text-sm" />
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="h-9 rounded-lg border border-ink-300 px-3 text-sm" />
          <button className="h-9 px-3 rounded-lg bg-primary-600 text-white text-sm font-medium">{t("reports.view", lang)}</button>
        </form>
      </div>

      {!canFinancial ? (
        <Card><CardBody><p className="text-sm text-ink-500">{t("reports.noPermission", lang)}</p></CardBody></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <StatCard label={t("reports.generatedRevenue", lang)} value={formatMoney(m.revenue, settings.currency, lang)} />
            <StatCard label={t("reports.collected", lang)} value={formatMoney(m.collected, settings.currency, lang)} tone="success" />
            <StatCard label={t("reports.outstanding", lang)} value={formatMoney(m.outstanding, settings.currency, lang)} tone={m.outstanding > 0 ? "danger" : "default"} />
            <StatCard label={t("reports.netProfit", lang)} value={formatMoney(m.netProfit, settings.currency, lang)} tone={m.netProfit >= 0 ? "success" : "danger"} />
            <StatCard label={t("reports.materialCost", lang)} value={formatMoney(m.materialCost, settings.currency, lang)} />
            <StatCard label={t("reports.approvedExpenses", lang)} value={formatMoney(m.expenses, settings.currency, lang)} hint={`${m.expensesByCategory.length} ${lang === "ar" ? "تصنيف" : "categories"}`} />
            <StatCard label={t("reports.cashPurchases", lang)} value={formatMoney(m.cashOut, settings.currency, lang)} />
            <StatCard label={t("reports.cashFlow", lang)} value={formatMoney(m.cashFlow, settings.currency, lang)} tone={m.cashFlow >= 0 ? "success" : "danger"} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.visits", lang)}</p><p className="text-xl font-bold">{m.visitCount}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.newPatients", lang)}</p><p className="text-xl font-bold">{m.newPatients}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.returningPatients", lang)}</p><p className="text-xl font-bold">{m.returningPatients}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.paidInvoices", lang)}</p><p className="text-xl font-bold">{m.invoicesPaid} / {m.invoicesCount}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.discounts", lang)}</p><p className="text-xl font-bold tabular-nums">{formatMoney(m.discountsTotal, settings.currency, lang)}</p></CardBody></Card>
            <Card><CardBody><p className="text-xs text-ink-500">{t("reports.monthlyPayroll", lang)}</p><p className="text-xl font-bold tabular-nums">{formatMoney(m.payrollMonthly, settings.currency, lang)}</p></CardBody></Card>
          </div>

          <ReportSection title={t("reports.revenueLog", lang)} range={range} settings={settings} build={(r) => revenueReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.collectionsByMethod", lang)} range={range} settings={settings} build={(r) => collectionsByMethodReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.expenses", lang)} range={range} settings={settings} build={(r) => expensesReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.purchases", lang)} range={range} settings={settings} build={(r) => purchasesReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.inventoryUsage", lang)} range={range} settings={settings} build={(r) => inventoryUsageReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.services", lang)} range={range} settings={settings} build={(r) => servicesReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.doctorActivity", lang)} range={range} settings={settings} build={(r) => doctorActivityReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.discountLog", lang)} range={range} settings={settings} build={(r) => discountsReport(user, r)} lang={lang} />
          <ReportSection title={t("reports.patientSummary", lang)} range={range} settings={settings} build={(r) => patientsReport(user, r)} lang={lang} />
        </>
      )}
    </>
  );
}

async function ReportSection({ title, range, build, lang }: { title: string; range: { start: Date; end: Date }; settings: Awaited<ReturnType<typeof getSettings>>; build: (r: { start: Date; end: Date }) => Promise<Record<string, string | number>[]>; lang: "ar" | "en" }) {
  const rows = await build(range);
  return (
    <Card className="mb-4">
      <CardHeader title={title} actions={<CsvExportButton filename={title.replace(/\s+/g, "_")} rows={rows} />} />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-xs text-ink-400 text-center">{t("reports.noData", lang)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-ink-50 text-ink-500">
                <tr>{Object.keys(rows[0]).map((h) => <th key={h} className="px-3 py-2 text-right font-medium whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rows.slice(0, 50).map((r, i) => (
                  <tr key={i}>{Object.entries(r).map(([k, v]) => <td key={k} className="px-3 py-2 whitespace-nowrap tabular-nums">{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
