import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/time";
import { searchInvoices } from "@/server/services/billing-service";
import { Card, CardBody, EmptyState } from "@/components/ui/display";
import { Table, Td, Pagination } from "@/components/ui/table";
import { StatusBadge, INVOICE_STATUS_TONES } from "@/components/status";
import { statusLabels } from "@/lib/i18n/status";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; method?: string; from?: string; to?: string; page?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const page = Math.max(1, Number(sp.page ?? 1));
  const result = await searchInvoices(user, {
    query: sp.q ?? undefined,
    status: sp.status ?? null,
    method: (sp.method as "CASH" | "CLIQ" | "VISA" | undefined) ?? null,
    dateFrom: sp.from ?? null,
    dateTo: sp.to ?? null,
    page,
    pageSize: 20,
  });

  const invoiceLabels = statusLabels("invoice", lang);
  const payLabels = statusLabels("paymentMethod", lang);

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("invoices.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{t("invoices.subtitle", lang).replace("{n}", String(result.total))}</p>

      <form className="flex flex-wrap gap-2 mb-5" method="get">
        <input name="q" defaultValue={sp.q ?? ""} placeholder={t("invoices.searchPh", lang)} className="h-10 rounded-lg border border-ink-300 px-3 text-sm w-64" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-10 rounded-lg border border-ink-300 px-2 text-sm bg-white">
          <option value="">{t("invoices.allStatuses", lang)}</option>
          <option value="UNPAID">{t("invoices.unpaid", lang)}</option>
          <option value="PARTIALLY_PAID">{t("invoices.partiallyPaid", lang)}</option>
          <option value="PAID">{t("invoices.paid", lang)}</option>
          <option value="VOID">{t("invoices.void", lang)}</option>
        </select>
        <select name="method" defaultValue={sp.method ?? ""} className="h-10 rounded-lg border border-ink-300 px-2 text-sm bg-white">
          <option value="">{t("invoices.allMethods", lang)}</option>
          <option value="CASH">{t("pay.cash", lang)}</option>
          <option value="CLIQ">{t("pay.cliq", lang)}</option>
          <option value="VISA">{t("pay.visa", lang)}</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ""} className="h-10 rounded-lg border border-ink-300 px-3 text-sm" />
        <input type="date" name="to" defaultValue={sp.to ?? ""} className="h-10 rounded-lg border border-ink-300 px-3 text-sm" />
        <button className="h-10 px-4 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700">{t("invoices.search", lang)}</button>
        <Link href="/invoices" className="h-10 px-3 rounded-lg border border-ink-300 text-sm flex items-center text-ink-500 hover:bg-ink-50">{t("invoices.clear", lang)}</Link>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title={t("invoices.emptyTitle", lang)} />
      ) : (
        <Card>
          <CardBody className="p-0">
            <Table
              headers={[t("invoices.num", lang), t("invoices.customer", lang), t("invoices.doctor", lang), t("invoices.total", lang), t("invoices.discount", lang), t("invoices.paidCol", lang), t("invoices.status", lang), t("invoices.payments", lang)]}
              empty={result.items.length === 0}
            >
              {result.items.map((inv) => (
                <tr key={inv.id} className="hover:bg-ink-50/50">
                  <Td>
                    <Link href={`/visits/${inv.visitId}`} className="font-bold text-primary-700 hover:underline tabular-nums">#{inv.invoiceNo}</Link>
                  </Td>
                  <Td className="font-medium">{inv.customer.fullName}</Td>
                  <Td className="text-xs text-ink-500">{inv.visit?.doctor?.name ?? "—"}</Td>
                  <Td className="tabular-nums">{formatMoney(inv.finalAmount, settings.currency, lang)}</Td>
                  <Td className="tabular-nums text-amber-600">{Number(inv.discountAmount) > 0 ? formatMoney(inv.discountAmount, settings.currency, lang) : "—"}</Td>
                  <Td className="tabular-nums text-emerald-600">{formatMoney(inv.payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + Number(p.amount), 0), settings.currency, lang)}</Td>
                  <Td>
                    <StatusBadge status={inv.status} labels={invoiceLabels} tones={INVOICE_STATUS_TONES} />
                  </Td>
                  <Td className="text-xs text-ink-400">
                    <div>{formatDateTime(inv.createdAt, settings.timezone)}</div>
                    {inv.payments.some((p) => p.status === "COMPLETED") && (
                      <div className="text-[11px]">{inv.payments.filter((p) => p.status === "COMPLETED").map((p) => payLabels[p.method]).join(" + ")}</div>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      )}
      <Pagination page={result.page} pages={result.pages} buildHref={(p) => {
        const params = new URLSearchParams();
        if (sp.q) params.set("q", sp.q);
        if (sp.status) params.set("status", sp.status);
        if (sp.method) params.set("method", sp.method);
        if (sp.from) params.set("from", sp.from);
        if (sp.to) params.set("to", sp.to);
        params.set("page", String(p));
        return `/invoices?${params.toString()}`;
      }} />
    </>
  );
}
