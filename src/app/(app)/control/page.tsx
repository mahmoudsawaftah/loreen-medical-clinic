import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatDate, toDateKey } from "@/lib/time";
import { controlCenter } from "@/server/services/reporting-service";
import { Card, CardHeader, CardBody, Badge, PageHeader, StatCard } from "@/components/ui/display";
import Link from "next/link";
import { getLang } from "@/lib/i18n/server";
import { uiText } from "@/lib/i18n/entities";

export const dynamic = "force-dynamic";

export default async function ControlPage() {
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const cc = await controlCenter(user);
  const m = cc.month;

  return (
    <>
      <PageHeader
        title={uiText(lang, "مركز التحكم الإداري", "Control Center")}
        subtitle={`${uiText(lang, "لقطة شاملة ليوم", "Overview for")} ${cc.today.dateKey} ${uiText(lang, "وشهر", "and month")} ${toDateKey(new Date(), settings.timezone).slice(0, 7)} — ${uiText(lang, "يتم احتساب الربح من الإيراد مطروحًا تكلفة المواد المستهلكة والنفقات والرواتب", "Profit is calculated from revenue minus consumed materials, expenses, and payroll")}`}
        actions={cc.today.closingStatus ? <Badge tone={cc.today.closingStatus === "CLOSED" ? "success" : "warning"}>{uiText(lang, "إقفال اليوم", "Day closing")}: {cc.today.closingStatus === "CLOSED" ? uiText(lang, "مغلق", "Closed") : uiText(lang, "أعيد فتحه", "Reopened")}</Badge> : <Badge tone="neutral">{uiText(lang, "اليوم مفتوح", "Today is open")}</Badge>}
      />

      <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={uiText(lang, "اليوم — زيارات", "Today — visits")} value={cc.today.visits} hint={`${uiText(lang, "تاريخ اليوم", "Today's date")}: ${cc.today.dateKey}`} />
        <StatCard label={uiText(lang, "اليوم — محصل", "Today — collected")} value={formatMoney(cc.today.collected, settings.currency, lang)} hint={`${uiText(lang, "كاش", "Cash")} ${formatMoney(cc.today.collectedByMethod.CASH ?? 0, settings.currency, lang)} · CliQ ${formatMoney(cc.today.collectedByMethod.CLIQ ?? 0, settings.currency, lang)} · ${uiText(lang, "فيزا", "Visa")} ${formatMoney(cc.today.collectedByMethod.VISA ?? 0, settings.currency, lang)}`} tone={cc.today.collected > 0 ? "success" : "default"} />
        <StatCard label={uiText(lang, "شهر — إيراد", "Month — revenue")} value={formatMoney(m.revenue, settings.currency, lang)} hint={`${uiText(lang, "محصل", "Collected")} ${formatMoney(m.collected, settings.currency, lang)}`} />
        <StatCard label={uiText(lang, "شهر — صافي الربح", "Month — net profit")} value={formatMoney(m.netProfit, settings.currency, lang)} tone={m.netProfit >= 0 ? "success" : "danger"} hint={`${uiText(lang, "ربح إجمالي", "Gross profit")} ${formatMoney(m.grossProfit, settings.currency, lang)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={uiText(lang, "تقسيم الربح", "Profit breakdown")} subtitle={uiText(lang, "خدمات مقابل مواد (الهامش)", "Services versus materials (margin)")} />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "إيراد الخدمات (نصيب المالك)", "Service revenue (owner share)")}</span><span className="font-semibold tabular-nums">{formatMoney(m.serviceIncome, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "إيراد المواد", "Material revenue")}</span><span className="font-semibold tabular-nums">{formatMoney(m.materialIncome, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "تكلفة المواد المستهلكة", "Consumed material cost")}</span><span className="font-semibold tabular-nums text-red-600">- {formatMoney(m.materialCost, settings.currency, lang)}</span></div>
            <div className="flex justify-between border-t border-ink-100 pt-2"><span className="font-medium">{uiText(lang, "ربح المواد", "Material profit")}</span><span className={`font-bold tabular-nums ${m.materialProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatMoney(m.materialProfit, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="font-medium">{uiText(lang, "ربح الخدمات", "Service profit")}</span><span className="font-bold tabular-nums text-emerald-600">{formatMoney(m.serviceProfit, settings.currency, lang)}</span></div>
            <div className="flex justify-between border-t border-ink-100 pt-2"><span className="font-medium">{uiText(lang, "الربح الإجمالي", "Gross profit")}</span><span className="font-bold tabular-nums">{formatMoney(m.grossProfit, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "نفقات الشهر", "Monthly expenses")}</span><span className="font-semibold tabular-nums text-red-600">- {formatMoney(m.expenses, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "رواتب (توزيع يومي)", "Payroll (daily allocation)")}</span><span className="font-semibold tabular-nums text-red-600">- {formatMoney(m.payrollAlloc, settings.currency, lang)}</span></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={uiText(lang, "المؤشرات الشهرية", "Monthly metrics")} />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "فواتير الشهر", "Monthly invoices")}</span><span className="font-semibold tabular-nums">{cc.counts.invoicesInMonth}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "زيارات الشهر", "Monthly visits")}</span><span className="font-semibold tabular-nums">{cc.counts.visitsInMonth}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "عطلات/مستحق", "Outstanding")}</span><span className="font-semibold tabular-nums text-amber-600">{formatMoney(m.outstanding, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "ذمم عميلات", "Customer receivables")}</span><span className="font-semibold tabular-nums text-amber-600">{formatMoney(cc.receivables.totalOutstanding, settings.currency, lang)}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "مدينات", "Debtors")}</span><span className="font-semibold tabular-nums">{cc.receivables.debtors}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "عميلات نشطات", "Active customers")}</span><span className="font-semibold tabular-nums">{cc.counts.activeCustomers}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "زيارات مفتوحة الآن", "Open visits now")}</span><span className="font-semibold tabular-nums">{cc.counts.openVisits}</span></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={uiText(lang, "تنبيهات وموافقات", "Alerts and approvals")} />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "منتجات دون حد الطلب", "Products below reorder level")}</span><span className={`font-semibold tabular-nums ${cc.inventory.lowStock > 0 ? "text-red-600" : "text-emerald-600"}`}>{cc.inventory.lowStock}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "دفعات قرب الانتهاء (30 يوم)", "Batches expiring within 30 days")}</span><span className={`font-semibold tabular-nums ${cc.inventory.expiring > 0 ? "text-amber-600" : "text-emerald-600"}`}>{cc.inventory.expiring}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "مصروفات بانتظار الاعتماد", "Expenses awaiting approval")}</span><span className="font-semibold tabular-nums">{cc.approvals.pendingExpenses}</span></div>
            <div className="flex justify-between"><span className="text-ink-500">{uiText(lang, "طلبات شراء معلقة", "Pending purchase requests")}</span><span className="font-semibold tabular-nums">{cc.approvals.pendingPurchaseRequests}</span></div>
          </CardBody>
          {cc.lastClosing && (
            <CardBody className="pt-0">
              <p className="text-xs text-ink-500">{uiText(lang, "آخر إقفال", "Last closing")}: {formatDate(cc.lastClosing.closeDate!, settings.timezone)} — {uiText(lang, "فارق", "Variance")} {formatMoney(cc.lastClosing.totalVariance ?? 0, settings.currency, lang)}</p>
            </CardBody>
          )}
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/inventory-counts" className="text-primary-600 font-medium hover:underline">{uiText(lang, "الجرد الفيزيائي", "Physical inventory count")}</Link>
        <Link href="/receivables" className="text-primary-600 font-medium hover:underline">{uiText(lang, "ذمم العميلات", "Customer receivables")}</Link>
        <Link href="/closing" className="text-primary-600 font-medium hover:underline">{uiText(lang, "إغلاق اليوم", "End of day")}</Link>
        <Link href="/sources" className="text-primary-600 font-medium hover:underline">{uiText(lang, "مصادر التعريف", "Customer sources")}</Link>
      </div>
    </>
  );
}
