import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatDate, toDateKey } from "@/lib/time";
import { getClosingForDate, listClosings, dayActivityFor } from "@/server/services/closing-service";
import { financialMetrics } from "@/server/services/reporting-service";
import { dailyPayrollCost } from "@/server/services/payroll-service";
import { todayRange } from "@/lib/time";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { SubmitClosingForm, ReviewClosingPanel, ReopenDayButton } from "@/components/closing/closing-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { statusLabels, closingTone } from "@/lib/i18n/status";

export default async function ClosingPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const isOwner = user.role === "OWNER";
  const canPrepare = hasPermission(user, GRANULAR_PERMISSIONS.CLOSING_PREPARE);
  const canReview = hasPermission(user, GRANULAR_PERMISSIONS.CLOSING_REVIEW);
  const canApprove = hasPermission(user, GRANULAR_PERMISSIONS.CLOSING_APPROVE);
  const today = await getClosingForDate(user, new Date());
  const activity = await dayActivityFor(new Date());
  const history = await listClosings(user, { pageSize: 50 });
  const todayKey = toDateKey(new Date(), settings.timezone);
  const status = today.closing?.status ?? "OPEN";
  const statusLabel = statusLabels("closing", lang)[status];

  const canSubmit = canPrepare && ["OPEN", "REOPENED", "REVIEW_REQUIRED"].includes(status);
  const canReviewPanel = canReview && status === "SUBMITTED";

  const dayResult = canReview || canApprove
    ? await financialMetrics(user, todayRange(settings.timezone)).catch(() => null)
    : null;
  const payroll = canReview || canApprove ? await dailyPayrollCost(user, todayRange(settings.timezone).start.getUTCFullYear(), todayRange(settings.timezone).start.getUTCMonth() + 1).catch(() => null) : null;
  const rentShare = dayResult ? dayResult.expensesByCategory.filter((c) => c.name.includes("إيجار")).reduce((a, c) => a + c.amount, 0) : 0;
  const utilitiesShare = dayResult ? dayResult.expensesByCategory.filter((c) => c.name.includes("كهرباء") || c.name.includes("خدمات")).reduce((a, c) => a + c.amount, 0) : 0;
  const fmt = (n: number) => formatMoney(n, settings.currency, lang);

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("closing.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{t("closing.pageSub", lang)}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`${t("closing.day", lang)}: ${formatDate(today.day, settings.timezone)}`}
            actions={<Badge tone={closingTone(status)}>{statusLabel}</Badge>}
          />
          <CardBody>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm text-center">
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.cashExpected", lang)}</p><p className="font-bold tabular-nums">{formatMoney(today.expected.expectedCash, settings.currency, lang)}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.cliqExpected", lang)}</p><p className="font-bold tabular-nums">{formatMoney(today.expected.expectedCliq, settings.currency, lang)}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.visaExpected", lang)}</p><p className="font-bold tabular-nums">{formatMoney(today.expected.expectedVisa, settings.currency, lang)}</p></div>
              </div>

              {canSubmit && (
                <SubmitClosingForm
                  dateKey={todayKey}
                  totals={{ cash: Number(today.expected.expectedCash), cliq: Number(today.expected.expectedCliq), visa: Number(today.expected.expectedVisa) }}
                />
              )}

              {canReviewPanel && today.closing && (
                <ReviewClosingPanel
                  dateKey={todayKey}
                  expected={{ cash: Number(today.expected.expectedCash), cliq: Number(today.expected.expectedCliq), visa: Number(today.expected.expectedVisa) }}
                  closing={{
                    actualCash: Number(today.closing.actualCash),
                    actualCliq: Number(today.closing.actualCliq),
                    actualVisa: Number(today.closing.actualVisa),
                    varianceCash: Number(today.closing.varianceCash),
                    varianceCliq: Number(today.closing.varianceCliq),
                    varianceVisa: Number(today.closing.varianceVisa),
                    totalActual: Number(today.closing.totalActual),
                    totalExpected: Number(today.closing.totalExpected),
                    totalVariance: Number(today.closing.totalVariance),
                    varianceExplanation: today.closing.varianceExplanation,
                    notes: today.closing.notes,
                    submittedBy: today.closing.submittedBy,
                  }}
                />
              )}

              {(status === "SUBMITTED" || status === "REVIEW_REQUIRED") && !canReviewPanel && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {status === "SUBMITTED" ? t("closing.awaitingReview", lang) : t("closing.returnedForCorrection", lang)}
                </p>
              )}

              {status === "APPROVED" && today.closing && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-emerald-800">{t("closing.approvedMatched", lang)} {today.closing.approvedBy?.name ?? t("common.you", lang)}</p>
                  <div className="flex justify-between text-xs"><span>{t("closing.varianceBreakdown", lang)}</span><span className="tabular-nums">{formatMoney(today.closing.varianceCash, settings.currency, lang)} / {formatMoney(today.closing.varianceCliq, settings.currency, lang)} / {formatMoney(today.closing.varianceVisa, settings.currency, lang)}</span></div>
                  {today.closing.notes && <p className="text-xs text-ink-500">{today.closing.notes}</p>}
                  {isOwner && <ReopenDayButton dateKey={todayKey} />}
                </div>
              )}

              {status === "REOPENED" && today.closing && isOwner && <ReopenDayButton dateKey={todayKey} />}

              {!canSubmit && !canReviewPanel && !["APPROVED", "SUBMITTED", "REVIEW_REQUIRED"].includes(status) && (
                <p className="text-xs text-ink-500">{t("closing.noPermission", lang)}</p>
              )}
            </div>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title={t("closing.dayActivity", lang)} actions={<Badge tone="neutral">{activity.visits} {t("visits.count", lang)}</Badge>} />
            <CardBody>
              <div className="grid grid-cols-5 gap-2 text-sm text-center">
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.invoicesCount", lang)}</p><p className="font-bold tabular-nums">{activity.invoices}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.paymentsCount", lang)}</p><p className="font-bold tabular-nums">{activity.payments}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.treatmentsCount", lang)}</p><p className="font-bold tabular-nums">{activity.treatments}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.expensesCount", lang)}</p><p className="font-bold tabular-nums">{activity.expenses}</p></div>
                <div className="rounded-xl bg-ink-50 py-3"><p className="text-[11px] text-ink-500">{t("closing.visitsCount", lang)}</p><p className="font-bold tabular-nums">{activity.visits}</p></div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("closing.dayResult", lang)} actions={dayResult ? <Badge tone={dayResult.netProfit >= 0 ? "success" : "danger"}>{t("closing.netProfit", lang)} {fmt(dayResult.netProfit)}</Badge> : undefined} />
            <CardBody>
              {!dayResult ? (
                <p className="text-xs text-ink-400">{t("closing.financialPermissionNeeded", lang)}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-ink-50 p-3"><p className="text-[11px] text-ink-500">{t("closing.revenue", lang)}</p><p className="font-bold tabular-nums">{fmt(dayResult.revenue)}</p></div>
                    <div className="rounded-xl bg-ink-50 p-3"><p className="text-[11px] text-ink-500">{t("closing.collected", lang)}</p><p className="font-bold tabular-nums">{fmt(dayResult.collected)}</p></div>
                    <div className="rounded-xl bg-ink-50 p-3"><p className="text-[11px] text-ink-500">{t("closing.materialCostUsed", lang)}</p><p className="font-bold tabular-nums">{fmt(dayResult.materialCost)}</p></div>
                    <div className="rounded-xl bg-ink-50 p-3"><p className="text-[11px] text-ink-500">{t("closing.cashFlow", lang)}</p><p className="font-bold tabular-nums">{fmt(dayResult.cashFlow)}</p></div>
                  </div>
                  <div className="rounded-xl border border-ink-100 p-3 space-y-1.5">
                    <p className="text-[11px] font-semibold text-ink-500">{t("closing.dailyCostShare", lang)}</p>
                    <div className="flex justify-between"><span className="text-ink-500">{t("closing.payrollByRecord", lang)}</span><span className="font-bold tabular-nums">{fmt(payroll?.dailyShare ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">{t("closing.rent", lang)}</span><span className="font-bold tabular-nums">{fmt(rentShare)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">{t("closing.utilities", lang)}</span><span className="font-bold tabular-nums">{fmt(utilitiesShare)}</span></div>
                    <div className="flex justify-between"><span className="text-ink-500">{t("closing.otherExpenses", lang)}</span><span className="font-bold tabular-nums">{fmt(dayResult.expenses - rentShare - utilitiesShare)}</span></div>
                  </div>
                  <div className="flex justify-between text-sm font-bold border-t border-ink-100 pt-2">
                    <span>{t("closing.netProfit", lang)}</span>
                    <span className={"tabular-nums " + (dayResult.netProfit >= 0 ? "text-emerald-700" : "text-red-600")}>{fmt(dayResult.netProfit)}</span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("closing.historyTitle", lang)} actions={<Badge tone="neutral">{history.total}</Badge>} />
            <CardBody className="p-0">
              {history.items.length === 0 ? (
                <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("closing.noHistoryYet", lang)}</p>
              ) : (
                <div className="divide-y divide-ink-50">
                  {history.items.map((c) => {
                    const meta = statusLabels("closing", lang)[c.status];
                    return (
                      <div key={c.id} className="px-4 sm:px-5 py-3">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-medium">{formatDate(c.closeDate, settings.timezone)}</span>
                          <Badge tone={closingTone(c.status)}>{meta}</Badge>
                          <span className="mr-auto text-xs tabular-nums">
                            {formatMoney(Number(c.actualCash) + Number(c.actualCliq) + Number(c.actualVisa), settings.currency, lang)} ({t("closing.differenceShort", lang)} {formatMoney(Number(c.varianceCash) + Number(c.varianceCliq) + Number(c.varianceVisa), settings.currency, lang)})
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-400 mt-1">
                          {t("closing.submittedBy", lang)}: {c.submittedBy?.name ?? "—"}
                          {c.reviewedBy?.name ? ` • ${t("closing.reviewedBy2", lang)}: ${c.reviewedBy.name}` : ""}
                          {c.approvedBy?.name ? ` • ${t("closing.approvedBy2", lang)}: ${c.approvedBy.name}` : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
