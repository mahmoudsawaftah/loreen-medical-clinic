import { redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { todayRange, yesterdayRange, formatDate, formatDateTime, formatMoney } from "@/lib/time";
import { financialMetrics } from "@/server/services/reporting-service";
import { getTodayQueue } from "@/server/services/visit-service";
import { stockAlerts } from "@/server/services/inventory-service";
import { listPurchaseRequests } from "@/server/services/purchase-service";
import { getReadyForPaymentQueue } from "@/server/services/treatment-service";
import { followUpQueue } from "@/server/services/crm-service";
import { dailyPayrollCost } from "@/server/services/payroll-service";
import { getClosingForDate } from "@/server/services/closing-service";
import { db } from "@/lib/db";
import { StatCard, Card, CardHeader, CardBody, Badge, PageHeader, EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { StatusBadge, VISIT_STATUS_TONES, PAYMENT_METHOD_TONES } from "@/components/status";
import { Table, Td } from "@/components/ui/table";
import { QuickActions } from "@/components/layout/quick-actions";
import { SendMessageModal } from "@/components/crm/crm-forms";
import { getLang } from "@/lib/i18n/server";
import { t, type Lang } from "@/lib/i18n/dict";
import { statusLabels, localeFor } from "@/lib/i18n/status";
import { localizedName, localizedInventoryTerm } from "@/lib/i18n/entities";

export default async function DashboardPage() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/password-change");
  const settings = await getSettings();
  const tz = settings.timezone;
  const lang = await getLang();

  if (user.role === "DOCTOR" || user.role === "MAIN_DOCTOR") return <DoctorDashboard user={user} tz={tz} settingsCurrency={settings.currency} lang={lang} />;
  if (user.role === "SECRETARY") return <SecretaryDashboard user={user} tz={tz} settingsCurrency={settings.currency} messagingChannel={settings.messagingChannel} lang={lang} />;
  if (user.role === "ACCOUNTANT") return <AccountantDashboard user={user} tz={tz} settingsCurrency={settings.currency} lang={lang} />;
  return <OwnerDashboard user={user} tz={tz} settingsCurrency={settings.currency} lang={lang} />;
}

async function OwnerDashboard({ user, tz, settingsCurrency, lang }: { user: Awaited<ReturnType<typeof requireUser>>; tz: string; settingsCurrency: string; lang: Lang }) {
  const [today, yesterday, queue, alerts, payroll, closing, followUps, adjustments, reversals, pendingCounts, postedCounts] = await Promise.all([
    financialMetrics(user, todayRange(tz)),
    financialMetrics(user, yesterdayRange(tz)),
    getReadyForPaymentQueue(user),
    stockAlerts(user),
    dailyPayrollCost(user, todayRange(tz).start.getUTCFullYear(), todayRange(tz).start.getUTCMonth() + 1),
    getClosingForDate(user, new Date()),
    followUpQueue(user, { daysAhead: 14 }).catch(() => ({ tasks: [] })),
    db.stockMovement.findMany({ where: { type: "ADJUSTMENT", createdAt: { gte: todayRange(tz).start, lte: todayRange(tz).end } }, include: { product: { select: { name: true, englishName: true } } }, orderBy: { createdAt: "desc" } }),
    db.payment.findMany({ where: { status: "VOID", voidedAt: { gte: todayRange(tz).start, lte: todayRange(tz).end } }, include: { invoice: { select: { invoiceNo: true } } }, orderBy: { voidedAt: "desc" } }),
    Promise.all([db.expense.count({ where: { status: "PENDING" } }), db.purchaseRequest.count({ where: { status: "PENDING" } })]),
    db.inventoryCount.findMany({ where: { status: "POSTED", postedAt: { gte: todayRange(tz).start, lte: todayRange(tz).end } }, include: { lines: { select: { difference: true } } } }),
  ]);
  const [pendingExpenses, pendingRequests] = pendingCounts;
  const fmt = (n: number) => formatMoney(n, settingsCurrency, lang);
  const paymentLabels = statusLabels("paymentMethod", lang);
  const purchaseLabels = statusLabels("purchase", lang);

  const rentShare = today.expensesByCategory.filter((c) => c.name.includes("إيجار")).reduce((a, c) => a + c.amount, 0);
  const utilitiesShare = today.expensesByCategory.filter((c) => c.name.includes("كهرباء") || c.name.includes("خدمات")).reduce((a, c) => a + c.amount, 0);
  const countVarianceLines = postedCounts.flatMap((c) => c.lines).filter((l) => l.difference.toNumber() !== 0).length;

  return (
    <>
      <PageHeader title={t("nav.dashboard", lang)} subtitle={`${t("dash.todayView", lang)} ${new Date().toLocaleDateString(localeFor(lang))}`} />
      <QuickActions user={user} />

      {closing.closing?.status === "SUBMITTED" && (
        <Link href="/closing" className="block mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 hover:bg-amber-100 transition-colors">
          <p className="font-semibold text-amber-900 text-sm">{t("nav.closing", lang)} — {t("dash.awaitingYourReview", lang)}</p>
          <p className="text-xs text-amber-700 mt-0.5">{t("dash.closingSubmittedBy", lang)} {closing.closing.submittedBy?.name ?? t("role.secretary", lang)} ({closing.closing.submittedAt?.toLocaleTimeString(localeFor(lang), { hour: "2-digit", minute: "2-digit" })})</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-lg bg-white/70 px-3 py-2"><span className="text-amber-800/70 block">{t("closing.expected", lang)}</span><span className="font-bold tabular-nums text-amber-900">{fmt(closing.closing.totalExpected.toNumber())}</span></div>
            <div className="rounded-lg bg-white/70 px-3 py-2"><span className="text-amber-800/70 block">{t("closing.actual", lang)}</span><span className="font-bold tabular-nums text-amber-900">{fmt(closing.closing.totalActual.toNumber())}</span></div>
            <div className="rounded-lg bg-white/70 px-3 py-2"><span className="text-amber-800/70 block">{t("closing.difference", lang)}</span><span className={"font-bold tabular-nums " + (closing.closing.totalVariance.toNumber() !== 0 ? "text-red-700" : "text-emerald-700")}>{fmt(closing.closing.totalVariance.toNumber())}</span></div>
          </div>
          <p className="mt-2 text-xs font-semibold text-amber-900">{t("dash.reviewClosing", lang)} ←</p>
        </Link>
      )}

      {closing.closing?.status === "APPROVED" && closing.closing.totalVariance.toNumber() === 0 && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-800 text-sm">{t("dash.closingMatched", lang)} {t("common.by", lang)} {closing.closing.approvedBy?.name ?? t("common.you", lang)}</p>
          <p className="text-xs text-emerald-700 mt-0.5">{t("dash.closingMatchedSub", lang).replace("{amount}", fmt(closing.closing.totalActual.toNumber()))}</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label={t("dash.netProfitToday", lang)} value={fmt(today.netProfit)} tone={today.netProfit >= 0 ? "success" : "danger"} hint={`${t("dash.totalHint", lang)} ${fmt(today.grossProfit)}`} />
        <StatCard label={t("dash.incomeToday", lang)} value={fmt(today.revenue)} hint={`${t("dash.yesterdayHint", lang)}: ${fmt(yesterday.revenue)}`} />
        <StatCard label={t("dash.collectedToday", lang)} value={fmt(today.collected)} />
        <StatCard label={t("dash.expensesToday", lang)} value={fmt(today.expenses)} tone={today.expenses > 0 ? "warning" : "default"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label={t("dash.cashFlow", lang)} value={fmt(today.cashFlow)} hint={t("dash.cashFlowHint", lang)} />
        <StatCard label={t("dash.receivables", lang)} value={fmt(today.outstanding)} hint={t("dash.receivablesHint", lang)} />
        <StatCard label={t("dash.newPatients", lang)} value={String(today.newPatients)} />
        <StatCard label={t("dash.visitsToday", lang)} value={String(today.visitCount)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label={t("dash.materialCost", lang)} value={fmt(today.materialCost)} />
        <StatCard label={t("dash.payrollToday", lang)} value={fmt(payroll.dailyShare)} />
        <StatCard label={t("dash.rentShare", lang)} value={fmt(rentShare)} />
        <StatCard label={t("dash.utilitiesShare", lang)} value={fmt(utilitiesShare)} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.keys(today.collectedByMethod) as string[]).map((m) => (
          <div key={m} className="text-center p-4 rounded-xl bg-ink-50 border border-ink-100">
            <Badge tone={PAYMENT_METHOD_TONES[m]}>{paymentLabels[m] ?? m}</Badge>
            <p className="mt-2 text-lg font-bold tabular-nums">{fmt(today.collectedByMethod[m] ?? 0)}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader title={t("dash.control", lang)} actions={<Link href="/closing"><Button variant="ghost" size="sm">{t("nav.closing", lang)}</Button></Link>} />
          <CardBody className="space-y-2 text-sm">
            {closing.closing && Math.abs(closing.closing.totalVariance.toNumber()) > 0 && (
              <Link href="/closing" className="flex justify-between items-center hover:bg-amber-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.dayClosingVariance", lang)}</span>
                <Badge tone="warning">{fmt(closing.closing.totalVariance.toNumber())}</Badge>
              </Link>
            )}
            {closing.closing?.status === "SUBMITTED" && (
              <Link href="/closing" className="flex justify-between items-center hover:bg-amber-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.dayClosingSubmit", lang)}</span>
                <Badge tone="warning">{t("dash.awaitingYourReview", lang)}</Badge>
              </Link>
            )}
            {closing.closing?.status === "REVIEW_REQUIRED" && (
              <Link href="/closing" className="flex justify-between items-center hover:bg-amber-50 rounded-lg p-2 -mx-2">
                <span>{t("nav.closing", lang)}</span>
                <Badge tone="danger">{t("dash.returnedForResubmit", lang)}</Badge>
              </Link>
            )}
            {(closing.closing?.status === "OPEN" || closing.closing?.status === "REOPENED") && (
              <Link href="/closing" className="flex justify-between items-center hover:bg-amber-50 rounded-lg p-2 -mx-2">
                <span>{t("nav.closing", lang)}</span>
                <Badge tone="neutral">{t("dash.notSubmitted", lang)}</Badge>
              </Link>
            )}
            {closing.closing?.status === "APPROVED" && (
              <div className="flex justify-between items-center">
                <span>{t("nav.closing", lang)}</span>
                <Badge tone="success">{closing.closing.totalVariance.toNumber() === 0 ? t("dash.approvedMatched", lang) : t("dash.approvedVariance", lang)}</Badge>
              </div>
            )}
            {postedCounts.length > 0 && (
              <Link href="/inventory-counts" className="flex justify-between items-center hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.postedCounts", lang)}</span>
                <Badge tone={countVarianceLines > 0 ? "warning" : "success"}>{countVarianceLines > 0 ? t("dash.countVarianceLines", lang).replace("{n}", String(countVarianceLines)) : t("dash.noVariance", lang)}</Badge>
              </Link>
            )}
            {adjustments.length > 0 && (
              <Link href="/audit" className="flex justify-between items-center hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.manualAdjustments", lang)}</span>
                <Badge tone="warning">{adjustments.length}</Badge>
              </Link>
            )}
            {reversals.length > 0 && (
              <Link href="/audit" className="flex justify-between items-center hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.paymentVoids", lang)}</span>
                <Badge tone="danger">{reversals.length}</Badge>
              </Link>
            )}
            {followUps.tasks.length > 0 && (
              <Link href="/crm" className="flex justify-between items-center hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.followUps", lang)}</span>
                <Badge tone="warning">{followUps.tasks.length}</Badge>
              </Link>
            )}
            {pendingExpenses + pendingRequests > 0 && (
              <Link href="/control" className="flex justify-between items-center hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span>{t("dash.pendingApprovals", lang)}</span>
                <Badge tone="warning">{t("dash.pendingApprovalsVal", lang).replace("{e}", String(pendingExpenses)).replace("{p}", String(pendingRequests))}</Badge>
              </Link>
            )}
            {alerts.lowStock.length + alerts.expiring.length === 0 && closing.closing?.status === "APPROVED" && adjustments.length === 0 && reversals.length === 0 && <p className="text-xs text-ink-400">{t("dash.noAnomalies", lang)}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dash.stockAlerts", lang)} actions={<Link href="/inventory"><Button variant="ghost" size="sm">{t("dash.inventoryLink", lang)}</Button></Link>} />
          <CardBody className="space-y-2">
            {alerts.lowStock.length === 0 && alerts.expiring.length === 0 ? (
              <p className="text-xs text-ink-400">{t("dash.noStockAlerts", lang)}</p>
            ) : (
              <>
                {alerts.lowStock.slice(0, 5).map(({ product, onHand }) => (
                  <div key={product.id} className="flex justify-between items-center text-sm">
                    <span>{localizedName(product.name, product.englishName, lang)}</span>
                    <Badge tone="danger">{t("dash.lowStockVal", lang).replace("{q}", onHand.toNumber().toString()).replace("{u}", localizedInventoryTerm(product.stockUnit, lang))}</Badge>
                  </div>
                ))}
                {alerts.expiring.slice(0, 5).map(({ product, batch }) => (
                  <div key={batch.id} className="flex justify-between items-center text-sm">
                    <span>{localizedName(product.name, product.englishName, lang)} — {t("dash.batchLabel", lang)} {batch.batchNo}</span>
                    <Badge tone="warning">{t("dash.expiringVal", lang).replace("{d}", batch.expiryDate!.toLocaleDateString(localeFor(lang)))}</Badge>
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("dash.readyToCollect", lang)} actions={<Link href="/ready-for-payment"><Button variant="outline" size="sm">{t("common.all", lang)}</Button></Link>} />
        <CardBody className="p-0">
          {queue.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-400 text-center">{t("dash.noReadyToCollect", lang)}</p>
          ) : (
            <Table headers={["#", t("visits.customer", lang), t("visits.doctor", lang), t("dash.finalCol", lang)]}>
              {queue.slice(0, 8).map((q) => (
                <tr key={q.visitId}>
                  <Td>{q.visitNo}</Td>
                  <Td>{q.customer.fullName}</Td>
                  <Td>{q.doctor?.name ?? "—"}</Td>
                  <Td className="font-bold">{fmt(q.finalAmount.toNumber())}</Td>
                </tr>
              ))}
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

async function AccountantDashboard({ user, tz, settingsCurrency, lang }: { user: Awaited<ReturnType<typeof requireUser>>; tz: string; settingsCurrency: string; lang: Lang }) {
  if (!hasPermission(user, GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)) {
    return (
      <>
        <PageHeader title={t("dash.financeBoard", lang)} subtitle={t("dash.financeSub", lang)} />
        <QuickActions user={user} />
        <Card>
          <CardBody>
            <p className="text-sm text-ink-500">{t("dash.financeBlocked", lang)}</p>
          </CardBody>
        </Card>
      </>
    );
  }
  const [today, month] = await Promise.all([
    financialMetrics(user, todayRange(tz)),
    (async () => {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return financialMetrics(user, { start, end: new Date() });
    })(),
  ]);
  const fmt = (n: number) => formatMoney(n, settingsCurrency, lang);
  const paymentLabels = statusLabels("paymentMethod", lang);

  return (
    <>
      <PageHeader title={t("dash.financeBoard", lang)} subtitle={t("dash.financeSub", lang)} />
      <QuickActions user={user} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t("dash.incomeToday", lang)} value={fmt(today.revenue)} />
        <StatCard label={t("dash.collectedToday", lang)} value={fmt(today.collected)} />
        <StatCard label={t("dash.monthSales", lang)} value={fmt(month.revenue)} />
        <StatCard label={t("dash.monthCollected", lang)} value={fmt(month.collected)} />
        <StatCard label={t("dash.monthExpenses", lang)} value={fmt(month.expenses)} tone={month.expenses > 0 ? "warning" : "default"} />
        <StatCard label={t("dash.monthPurchases", lang)} value={fmt(month.purchases)} />
        <StatCard label={t("dash.monthGrossProfit", lang)} value={fmt(month.grossProfit)} tone={month.grossProfit >= 0 ? "success" : "danger"} />
        <StatCard label={t("dash.monthNetProfit", lang)} value={fmt(month.netProfit)} tone={month.netProfit >= 0 ? "success" : "danger"} hint={t("dash.materialPayrollHint", lang).replace("{m}", fmt(month.materialCost)).replace("{r}", fmt(month.payrollMonthly))} />
      </div>
      <Card>
        <CardHeader title={t("dash.collectedByMethod", lang)} />
        <CardBody className="grid grid-cols-3 gap-4">
          {(Object.keys(today.collectedByMethod) as string[]).map((m) => (
            <div key={m} className="text-center p-4 rounded-xl bg-ink-50 border border-ink-100">
              <Badge tone={PAYMENT_METHOD_TONES[m]}>{paymentLabels[m] ?? m}</Badge>
              <p className="mt-2 text-xl font-bold tabular-nums">{fmt(today.collectedByMethod[m] ?? 0)}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </>
  );
}

/** Financial widgets on non-finance dashboards appear only when explicitly granted. */
async function FinancialSummaryGrid({ user, tz, settingsCurrency, lang }: { user: Awaited<ReturnType<typeof requireUser>>; tz: string; settingsCurrency: string; lang: Lang }) {
  if (!hasPermission(user, GRANULAR_PERMISSIONS.FINANCIAL_DASHBOARD)) return null;
  const range = todayRange(tz);
  const payrollAllowed = hasPermission(user, GRANULAR_PERMISSIONS.FINANCIAL_PAYROLL);
  const [today, yesterday, payroll] = await Promise.all([
    financialMetrics(user, range),
    financialMetrics(user, yesterdayRange(tz)),
    payrollAllowed ? dailyPayrollCost(user, range.start.getUTCFullYear(), range.start.getUTCMonth() + 1) : Promise.resolve({ dailyShare: 0, totalMonthly: 0, mode: "" }),
  ]);
  const fmt = (n: number) => formatMoney(n, settingsCurrency, lang);
  return (
    <div className="mb-6 space-y-3">
      <h2 className="text-sm font-semibold text-ink-700">{t("dash.financialSummary", lang)}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t("dash.incomeToday", lang)} value={fmt(today.revenue)} hint={`${t("dash.yesterdayHint", lang)}: ${fmt(yesterday.revenue)}`} />
        <StatCard label={t("dash.collectedToday", lang)} value={fmt(today.collected)} />
        <StatCard label={t("dash.expensesToday", lang)} value={fmt(today.expenses)} tone={today.expenses > 0 ? "warning" : "default"} />
        <StatCard label={t("dash.netProfitToday", lang)} value={fmt(today.netProfit)} tone={today.netProfit >= 0 ? "success" : "danger"} />
      </div>
      {payrollAllowed && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={t("dash.materialCost", lang)} value={fmt(today.materialCost)} />
          <StatCard label={t("dash.payrollToday", lang)} value={fmt(payroll.dailyShare)} />
          <StatCard label={t("dash.rentShare", lang)} value={fmt(today.expensesByCategory.filter((c) => c.name.includes("إيجار")).reduce((a, c) => a + c.amount, 0))} />
          <StatCard label={t("dash.utilitiesShare", lang)} value={fmt(today.expensesByCategory.filter((c) => c.name.includes("كهرباء") || c.name.includes("خدمات")).reduce((a, c) => a + c.amount, 0))} />
        </div>
      )}
    </div>
  );
}

async function DoctorDashboard({ user, tz, settingsCurrency, lang }: { user: Awaited<ReturnType<typeof requireUser>>; tz: string; settingsCurrency: string; lang: Lang }) {
  const [queue, followUps] = await Promise.all([
    getTodayQueue(user),
    followUpQueue(user, { daysAhead: 14, assignedToMe: true }),
  ]);
  const myVisits = queue.filter((v) => v.doctorId === user.id);
  const visitLabels = statusLabels("visit", lang);
  const waitingVisits = myVisits.filter((v) => v.status === "REGISTERED" || v.status === "WAITING");
  const needsCompletion = myVisits.filter((v) => v.status === "WITH_DOCTOR" || v.status === "TREATMENT_COMPLETED");
  const sentVisits = myVisits.filter((v) => ["READY_FOR_PAYMENT", "PARTIALLY_PAID", "PAID"].includes(v.status));
  const nextVisit = myVisits.find((v) => v.status === "WITH_DOCTOR")
    ?? myVisits.find((v) => v.status === "TREATMENT_COMPLETED")
    ?? myVisits.find((v) => v.status === "WAITING")
    ?? myVisits.find((v) => v.status === "REGISTERED")
    ?? null;
  const priceFor = (visit: (typeof myVisits)[number]) => visit.treatment?.basePrice && visit.treatment.basePrice.gt(0)
    ? formatMoney(visit.treatment.basePrice, settingsCurrency, lang)
    : null;

  return (
    <>
      <PageHeader title={t("dash.doctorBoard", lang)} subtitle={t("dash.doctorSub", lang)} />
      <QuickActions user={user} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatCard label={t("dash.doctorNextPatient", lang)} value={nextVisit ? 1 : 0} tone={nextVisit ? "warning" : "default"} />
        <StatCard label={t("dash.doctorWaitingPatients", lang)} value={waitingVisits.length} tone={waitingVisits.length > 0 ? "warning" : "default"} />
        <StatCard label={t("dash.doctorNeedsCompletion", lang)} value={needsCompletion.length} tone={needsCompletion.length > 0 ? "warning" : "default"} />
      </div>
      {nextVisit ? (
        <Card className="mb-6 border-primary-200 shadow-sm">
          <CardHeader
            title={t("dash.doctorCurrentPatient", lang)}
            subtitle={t("dash.doctorCurrentPatientSub", lang)}
            actions={<StatusBadge status={nextVisit.status} labels={visitLabels} tones={VISIT_STATUS_TONES} />}
          />
          <CardBody>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-primary-50/70 border border-primary-100 p-4">
              <div className="min-w-0">
                <p className="text-xl font-bold text-ink-900 truncate">{nextVisit.customer.fullName}</p>
                <p className="mt-1 text-sm text-ink-600"><span dir="ltr">{nextVisit.customer.phone ?? t("today.noPhone", lang)}</span> · #{nextVisit.visitNo}</p>
                <p className="mt-1 text-xs text-ink-500">{formatDateTime(nextVisit.scheduledAt ?? nextVisit.createdAt, tz)}</p>
              </div>
              <Link href={`/visits/${nextVisit.id}`} className="shrink-0"><Button size="sm">{t("dash.continueVisit", lang)}</Button></Link>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardBody><EmptyState title={t("dash.noPatientsToWork", lang)} description={t("dash.noVisitsDesc", lang)} /></CardBody>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader title={t("dash.doctorNeedsCompletionTitle", lang)} subtitle={t("dash.doctorNeedsCompletionSub", lang)} />
          <CardBody className="space-y-2">
            {needsCompletion.slice(0, 8).map((v) => {
              const price = priceFor(v);
              return (
                <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 hover:bg-amber-50">
                  <span className="min-w-0 truncate"><span className="block font-medium text-sm truncate">{v.customer.fullName}</span><span className="block text-[11px] text-ink-500">#{v.visitNo} · {v.status === "TREATMENT_COMPLETED" ? t("dash.addPriceAndSend", lang) : t("dash.recordTreatmentNext", lang)}</span></span>
                  <span className="shrink-0 text-end">{price ? <span className="block text-xs font-semibold text-emerald-700">{price}</span> : <span className="block text-xs font-semibold text-amber-700">{t("dash.priceMissing", lang)}</span>}<span className="text-[11px] text-primary-700">{t("dash.openVisit", lang)}</span></span>
                </Link>
              );
            })}
            {needsCompletion.length === 0 && <p className="py-4 text-xs text-ink-400">{t("dash.noPendingDoctorVisits", lang)}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("dash.doctorWaitingTitle", lang)} subtitle={t("dash.doctorWaitingSub", lang)} actions={<Link href="/today"><Button variant="ghost" size="sm">{t("common.all", lang)}</Button></Link>} />
          <CardBody className="space-y-2">
            {waitingVisits.slice(0, 8).map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 p-3 hover:bg-ink-50">
                <span className="min-w-0 truncate"><span className="block font-medium text-sm truncate">{v.customer.fullName}</span><span className="block text-[11px] text-ink-500">#{v.visitNo} · {formatDateTime(v.scheduledAt ?? v.createdAt, tz)}</span></span>
                <StatusBadge status={v.status} labels={visitLabels} tones={VISIT_STATUS_TONES} />
              </Link>
            ))}
            {waitingVisits.length === 0 && <p className="py-4 text-xs text-ink-400">{t("dash.noWaitingDoctorPatients", lang)}</p>}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader title={t("dash.doctorSentTitle", lang)} subtitle={t("dash.doctorSentSub", lang)} />
        <CardBody className="space-y-2">
          {sentVisits.slice(0, 8).map((v) => (
            <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 hover:bg-emerald-50">
              <span className="min-w-0 truncate"><span className="block font-medium text-sm truncate">{v.customer.fullName}</span><span className="block text-[11px] text-ink-500">#{v.visitNo}</span></span>
              <StatusBadge status={v.status} labels={visitLabels} tones={VISIT_STATUS_TONES} />
            </Link>
          ))}
          {sentVisits.length === 0 && <p className="py-4 text-xs text-ink-400">{t("dash.noSentDoctorVisits", lang)}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("dash.myPendingFollowUps", lang)} actions={<Link href="/crm"><Button variant="ghost" size="sm">{t("dash.followUp", lang)}</Button></Link>} />
        <CardBody className="space-y-2">
          {followUps.tasks.filter((task) => task.status === "PENDING").slice(0, 8).map((task) => (
            <div key={task.id} className="flex justify-between text-sm">
              <span>{task.customer.fullName} — {task.notes || t("st.followup.type.followUp", lang)}</span>
              <Badge tone="warning">{task.dueDate.toLocaleDateString(localeFor(lang))}</Badge>
            </div>
          ))}
          {followUps.tasks.filter((t) => t.status === "PENDING").length === 0 && <p className="text-xs text-ink-400">{t("dash.noPendingFollowUps", lang)}</p>}
        </CardBody>
      </Card>
    </>
  );
}

async function SecretaryDashboard({ user, tz, settingsCurrency, messagingChannel, lang }: { user: Awaited<ReturnType<typeof requireUser>>; tz: string; settingsCurrency: string; messagingChannel: string; lang: Lang }) {
  const [queue, todayVisits, crm, requests] = await Promise.all([
    getReadyForPaymentQueue(user),
    getTodayQueue(user),
    followUpQueue(user, { daysAhead: 7 }),
    listPurchaseRequests(user, {}),
  ]);
  const fmt = (n: number) => formatMoney(n, settingsCurrency, lang);
  const purchaseLabels = statusLabels("purchase", lang);
  const pending = queue.filter((q) => q.finalAmount.gt(q.paidAmount));
  const inClinic = todayVisits.filter((v) => v.status === "WAITING" || v.status === "WITH_DOCTOR");
  const newVisits = todayVisits.filter((v) => v.status === "REGISTERED");
  const waitingVisits = todayVisits.filter((v) => v.status === "WAITING");
  const activeVisits = todayVisits.filter((v) => v.status === "WITH_DOCTOR");
  const nextVisit = newVisits[0] ?? waitingVisits[0] ?? null;
  const dueFollowUps = crm.tasks.filter((task) => task.status === "PENDING" && task.dueDate <= new Date());
  const visitLabels = statusLabels("visit", lang);

  return (
    <>
      <PageHeader title={t("dash.secretaryBoard", lang)} subtitle={t("dash.secretarySub", lang)} />
      <QuickActions user={user} />
      <FinancialSummaryGrid user={user} tz={tz} settingsCurrency={settingsCurrency} lang={lang} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label={t("dash.todayAppointments", lang)} value={todayVisits.length} />
        <StatCard label={t("dash.inClinic", lang)} value={inClinic.length} tone={inClinic.length > 0 ? "success" : "default"} />
        <StatCard label={t("dash.awaitingPayment", lang)} value={pending.length} tone={pending.length > 0 ? "warning" : "default"} />
        <StatCard label={t("dash.todayFollowUps", lang)} value={dueFollowUps.length} />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader
            title={t("dash.workCenter", lang)}
            subtitle={t("dash.workCenterSub", lang)}
            actions={<Link href="/today"><Button variant="ghost" size="sm">{t("common.all", lang)}</Button></Link>}
          />
          <CardBody className="space-y-4">
            {nextVisit ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/70 p-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-primary-800">{t("dash.nextStep", lang)}</p>
                  <p className="mt-1 text-base font-bold text-ink-900 truncate">{nextVisit.customer.fullName}</p>
                  <p className="mt-1 text-xs text-ink-600">{nextVisit.doctor?.name ?? t("visits.withoutDoctor", lang)} · {formatDateTime(nextVisit.scheduledAt ?? nextVisit.createdAt, tz)}</p>
                </div>
                <Link href={`/visits/${nextVisit.id}`} className="shrink-0"><Button size="sm">{t("dash.openNext", lang)}</Button></Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50/60 p-4 text-sm text-ink-500">{t("dash.noNextStep", lang)}</div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-primary-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-ink-900">{t("dash.newPatientsToday", lang)}</h3>
                  <Badge tone={newVisits.length > 0 ? "warning" : "neutral"}>{newVisits.length}</Badge>
                </div>
                <div className="space-y-2">
                  {newVisits.slice(0, 5).map((v, index) => (
                    <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-3 py-2 hover:bg-primary-50">
                      <span className="min-w-0 truncate text-sm"><span className="font-semibold">{index + 1}. {v.customer.fullName}</span><span className="block text-[11px] text-ink-500">{v.doctor?.name ?? t("visits.withoutDoctor", lang)}</span></span>
                      <span className="shrink-0 text-[11px] font-medium text-primary-800">{t("dash.newStatus", lang)}</span>
                    </Link>
                  ))}
                  {newVisits.length === 0 && <p className="py-3 text-xs text-ink-400">{t("dash.noNewPatients", lang)}</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-ink-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-ink-900">{t("dash.activeVisits", lang)}</h3>
                  <Badge tone={waitingVisits.length + activeVisits.length > 0 ? "info" : "neutral"}>{waitingVisits.length + activeVisits.length}</Badge>
                </div>
                <div className="space-y-2">
                  {[...waitingVisits, ...activeVisits].slice(0, 5).map((v) => (
                    <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 hover:bg-ink-50">
                      <span className="min-w-0 truncate text-sm"><span className="font-medium">{v.customer.fullName}</span><span className="block text-[11px] text-ink-500">{v.doctor?.name ?? t("visits.withoutDoctor", lang)}</span></span>
                      <StatusBadge status={v.status} labels={visitLabels} />
                    </Link>
                  ))}
                  {waitingVisits.length + activeVisits.length === 0 && <p className="py-3 text-xs text-ink-400">{t("dash.noActiveVisits", lang)}</p>}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("dash.readyToCollect", lang)} actions={<Link href="/ready-for-payment"><Button variant="outline" size="sm">{t("dash.collect", lang)}</Button></Link>} />
          <CardBody className="space-y-2">
            {pending.slice(0, 6).map((q) => (
              <Link key={q.visitId} href={`/ready-for-payment#${q.visitId}`} className="flex justify-between items-center text-sm hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span className="truncate">{q.customer.fullName} <span className="text-ink-400">({q.doctor?.name})</span></span>
                <span className="font-bold tabular-nums">{fmt(q.finalAmount.toNumber())}</span>
              </Link>
            ))}
            {pending.length === 0 && <p className="text-xs text-ink-400">{t("dash.noAccounts", lang)}</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("dash.latestPurchases", lang)} actions={<Link href="/purchases"><Button variant="ghost" size="sm">{t("common.all", lang)}</Button></Link>} />
          <CardBody className="space-y-2">
            {requests.items.slice(0, 6).map((r) => (
              <Link key={r.id} href="/purchases" className="flex justify-between items-center text-sm hover:bg-ink-50 rounded-lg p-2 -mx-2">
                <span className="truncate">{r.description || `${t("purchases.request", lang)} #${r.requestNo}`} — {r.requester.name}</span>
                <StatusBadge status={r.status} labels={purchaseLabels} />
              </Link>
            ))}
            {requests.items.length === 0 && <p className="text-xs text-ink-400">{t("dash.noRequests", lang)}</p>}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title={t("dash.secretaryTasks", lang)} actions={<Link href="/crm"><Button variant="ghost" size="sm">{t("common.all", lang)}</Button></Link>} />
        <CardBody className="space-y-2">
          {dueFollowUps.slice(0, 8).map((task) => (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm">
              <Link href={`/patients/${task.customer.id}`} className="font-medium text-primary-800 hover:underline">{task.customer.fullName}</Link>
              <span className="text-xs text-ink-500">{task.notes || t("crm.reminder", lang)}</span>
              <span className="text-xs tabular-nums text-amber-800">{formatDate(task.dueDate, tz)}</span>
              {task.appointmentVisit?.scheduledAt && <span className="text-xs tabular-nums text-primary-700">{t("crm.appointment", lang)}: {formatDate(task.appointmentVisit.scheduledAt, tz)}</span>}
              <SendMessageModal customerId={task.customer.id} customerName={task.customer.fullName} phone={task.customer.phone ?? ""} channelDefault={messagingChannel} taskId={task.id} />
            </div>
          ))}
          {dueFollowUps.length === 0 && <p className="text-xs text-ink-400">{t("dash.noSecretaryTasks", lang)}</p>}
        </CardBody>
      </Card>
    </>
  );
}
