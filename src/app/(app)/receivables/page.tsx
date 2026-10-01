import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatMoney, formatDateTime } from "@/lib/time";
import { listReceivables, getCustomerStatement } from "@/server/services/receivables-service";
import { Card, CardHeader, CardBody, Badge, EmptyState, PageHeader, StatCard } from "@/components/ui/display";
import Link from "next/link";
import { Input } from "@/components/ui/form";
import { getLang } from "@/lib/i18n/server";

const KIND_LABELS: Record<string, string> = {
  INVOICE: "فاتورة",
  PAYMENT: "دفعة",
  PAYMENT_VOID: "إلغاء دفعة",
  ADJUSTMENT: "تسوية",
};

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ q?: string; customerId?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const list = await listReceivables(user, { query: sp.q ?? null, pageSize: 100 });
  const statement = sp.customerId ? await getCustomerStatement(user, sp.customerId).catch(() => null) : null;

  return (
    <>
      <PageHeader title="ذمم العميلات" subtitle="كشف المبالغ المستحقة على كل عميلة (إجمالي الفواتير مطروحًا الدفعات الصحيحة)" actions={list.totalOutstanding > 0 ? <Badge tone="warning">{formatMoney(list.totalOutstanding, settings.currency, lang)} مستحقة</Badge> : undefined} />

      <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="إجمالي المستحق" value={formatMoney(list.totalOutstanding, settings.currency, lang)} tone={list.totalOutstanding > 0 ? "warning" : "success"} />
        <StatCard label="عميلات مدينات" value={list.total} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="قائمة المدينات" actions={<Badge tone="neutral">{list.total}</Badge>} />
          <CardBody>
            <form action="/receivables" className="mb-3">
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="بحث بالاسم أو الهاتف..." />
            </form>
          </CardBody>
          <CardBody className="p-0">
            {list.items.length === 0 ? (
              <EmptyState title="لا توجد ذمم مستحقة" description="جميع الفواتير مسددة بالكامل" />
            ) : (
              <div className="divide-y divide-ink-50">
                {list.items.map((r) => (
                  <Link key={r.customerId} href={`/receivables?customerId=${r.customerId}`} className={`block px-4 sm:px-5 py-3 hover:bg-ink-50/60 ${statement?.customer.id === r.customerId ? "bg-primary-50/60" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{r.fullName}</p>
                        <p className="text-[11px] text-ink-400">#{r.customerNo} · {r.phone}{r.openInvoices > 0 ? ` · ${r.openInvoices} فاتورة مفتوحة` : ""}</p>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-amber-600">{formatMoney(r.outstanding, settings.currency, lang)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {statement && (
          <Card>
            <CardHeader
              title={`كشف حساب: ${statement.customer.fullName}`}
              subtitle={`${statement.summary.invoicesCount} فاتورة · إجمالي ${formatMoney(statement.summary.totalBilled, settings.currency, lang)} · مدفوع ${formatMoney(statement.summary.totalPaid, settings.currency, lang)}`}
              actions={<Badge tone={statement.outstanding > 0 ? "warning" : "success"}>{statement.outstanding > 0 ? `مستحق: ${formatMoney(statement.outstanding, settings.currency, lang)}` : "مسدد"}</Badge>}
            />
            <CardBody className="p-0">
              {statement.entries.length === 0 ? (
                <p className="px-5 py-8 text-xs text-ink-400 text-center">لا توجد حركات على هذه العميلة</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-[11px] text-ink-500 border-b border-ink-100">
                      <th className="px-4 sm:px-5 py-2.5 font-medium">التاريخ</th>
                      <th className="px-3 py-2.5 font-medium">البيان</th>
                      <th className="px-3 py-2.5 font-medium">المبلغ</th>
                      <th className="px-3 py-2.5 font-medium">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {statement.entries.map((e, i) => (
                      <tr key={i}>
                        <td className="px-4 sm:px-5 py-2 text-xs text-ink-500">{formatDateTime(e.date, settings.timezone)}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="font-medium">{KIND_LABELS[e.kind]}</span>
                          {e.invoiceNo ? <span className="text-ink-400"> #{e.invoiceNo}</span> : null}
                          <span className="block text-[11px] text-ink-400">{e.description}</span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-xs">{e.kind === "PAYMENT" ? `-${formatMoney(e.amount, settings.currency, lang)}` : `+${formatMoney(e.amount, settings.currency, lang)}`}</td>
                        <td className={`px-3 py-2 tabular-nums font-medium text-xs ${e.balance > 0 ? "text-amber-600" : ""}`}>{formatMoney(e.balance, settings.currency, lang)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
