import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { auditReport } from "@/server/services/reporting-service";
import { Card, CardBody, EmptyState } from "@/components/ui/display";
import { Pagination } from "@/components/ui/table";
import { getLang } from "@/lib/i18n/server";
import { localizedName, uiText } from "@/lib/i18n/entities";
import { t } from "@/lib/i18n/dict";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; entity?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const page = Math.max(1, Number(sp.page ?? 1));
  const result = await auditReport(user, { action: sp.q ?? null, entityType: sp.entity ?? null, page, pageSize: 50 });

  function renderJson(s: string | null): string {
    if (!s) return "—";
    try {
      return JSON.stringify(JSON.parse(s)).slice(0, 160);
    } catch {
      return s.slice(0, 160);
    }
  }

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{uiText(lang, "سجل التدقيق", "Audit log")}</h1>
      <p className="text-sm text-ink-500 mb-5">{uiText(lang, "كل عملية حساسة مسجلة بوقتها ومنفذها — لا حذف أبدًا", "Every sensitive action is recorded with its time and actor — never deleted")}</p>

      <form className="flex flex-wrap gap-2 mb-5" method="get">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={uiText(lang, "بحث في الإجراءات (مثل payment.collect)", "Search actions (e.g. payment.collect)")} className="h-10 rounded-lg border border-ink-300 px-3 text-sm w-72" dir="ltr" />
        <select name="entity" defaultValue={sp.entity ?? ""} className="h-10 rounded-lg border border-ink-300 px-2 text-sm bg-white">
          <option value="">{uiText(lang, "كل الكيانات", "All entities")}</option>
          <option value="payment">{uiText(lang, "مدفوعات", "Payments")}</option>
          <option value="invoice">{uiText(lang, "فواتير", "Invoices")}</option>
          <option value="visit">{uiText(lang, "زيارات", "Visits")}</option>
          <option value="treatment">{uiText(lang, "جلسات", "Treatments")}</option>
          <option value="product">{uiText(lang, "منتجات", "Products")}</option>
          <option value="expense">{uiText(lang, "مصروفات", "Expenses")}</option>
          <option value="purchase">{uiText(lang, "مشتريات", "Purchases")}</option>
          <option value="purchase_request">{uiText(lang, "طلبات شراء", "Purchase requests")}</option>
          <option value="user">{uiText(lang, "مستخدمون", "Users")}</option>
          <option value="settings">{uiText(lang, "إعدادات", "Settings")}</option>
          <option value="follow_up">{uiText(lang, "متابعات", "Follow-ups")}</option>
          <option value="communication_log">{uiText(lang, "تواصل", "Communications")}</option>
          <option value="day_closing">{uiText(lang, "إقفالات", "Closings")}</option>
          <option value="payroll_period">{uiText(lang, "رواتب", "Payroll")}</option>
        </select>
        <button className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium">{t("common.search", lang)}</button>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title={uiText(lang, "لا سجلات مطابقة", "No matching records")} />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-ink-50 text-ink-500">
                  <tr>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "الوقت", "Time")}</th>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "المستخدم", "User")}</th>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "الدور", "Role")}</th>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "الإجراء", "Action")}</th>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "الكيان", "Entity")}</th>
                    <th className="px-3 py-2 text-right font-medium">{uiText(lang, "التفاصيل", "Details")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {result.items.map((a) => (
                    <tr key={a.id} className="hover:bg-ink-50/50">
                      <td className="px-3 py-2 whitespace-nowrap text-ink-500">{formatDateTime(a.createdAt, settings.timezone)}</td>
                      <td className="px-3 py-2 font-medium">{a.user ? localizedName(a.user.name, a.user.englishName, lang) : uiText(lang, "نظام", "System")}</td>
                      <td className="px-3 py-2 text-ink-500">{a.userRole ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap" dir="ltr">{a.action}</td>
                      <td className="px-3 py-2 text-ink-500">{a.entityType}{a.entityId ? <span className="text-ink-400"> ({a.entityId.slice(0, 8)}…)</span> : ""}</td>
                      <td className="px-3 py-2 text-ink-500 max-w-md">
                        <div className="line-clamp-2" dir="rtl">{renderJson(a.afterJson)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
      <Pagination page={result.page} pages={result.pages} buildHref={(p) => {
        const params = new URLSearchParams();
        if (sp.q) params.set("q", sp.q);
        if (sp.entity) params.set("entity", sp.entity);
        params.set("page", String(p));
        return `/audit?${params.toString()}`;
      }} />
    </>
  );
}
