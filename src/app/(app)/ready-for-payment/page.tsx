import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/time";
import { getReadyForPaymentQueue } from "@/server/services/treatment-service";
import { Card, CardHeader, CardBody, EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { CollectPaymentModal } from "@/components/billing/collect-modal";
import { AutoRefresh } from "@/components/layout/auto-refresh";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function ReadyForPaymentPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const canCollect = hasPermission(user, PERMISSIONS.BILLING_COLLECT);
  const queue = await getReadyForPaymentQueue(user);

  return (
    <>
      <AutoRefresh />
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("ready.paymentTitle", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{t("ready.subtitle", lang).replace("{n}", String(queue.length))}</p>

      {queue.length === 0 ? (
        <EmptyState title={t("ready.emptyTitle", lang)} description={t("ready.emptyDesc", lang)} />
      ) : (
        <div className="space-y-4">
          {queue.map((v) => (
            <Card key={v.visitId}>
              <CardHeader
                title={`#${v.visitNo} · ${v.customer.fullName}`}
                subtitle={`${v.doctor?.name ?? t("visits.withoutDoctor", lang)} · ${formatDateTime(v.sentToCashierAt, settings.timezone)}`}
              />
              <CardBody>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm mb-3">
                  <span className="text-ink-500">{t("ready.procedures", lang)}</span>
                  <span className="text-xs text-ink-600">{v.items.filter((i) => i.kind === "SERVICE").map((i) => i.description).join("، ") || "—"}</span>
                  <Link href={`/visits/${v.visitId}`} className="text-xs text-primary-700 hover:underline">{t("ready.details", lang)} ←</Link>
                </div>
                {Number(v.discountAmount) > 0 && (
                  <p className="text-xs text-amber-700 mb-2">{t("ready.approvedDiscount", lang)}: -{formatMoney(v.discountAmount, settings.currency, lang)}</p>
                )}
                {Number(v.paidAmount) > 0 && (
                  <p className="text-xs text-emerald-700 mb-2">{t("ready.partiallyPaid", lang)}: {formatMoney(v.paidAmount, settings.currency, lang)}</p>
                )}
                {canCollect && v.invoiceId ? (
                  <CollectPaymentModal
                    invoiceId={v.invoiceId}
                    finalAmount={Number(v.finalAmount)}
                    remaining={Number(v.finalAmount) - Number(v.paidAmount)}
                    splitEnabled={settings.splitPaymentEnabled}
                    partialEnabled={settings.partialPaymentEnabled}
                    canEditAmount={user.role === "SECRETARY"}
                    trigger={<Button size="sm">{t("ready.collectNow", lang)}</Button>}
                  />
                ) : (
                  <Button size="sm" variant="secondary" disabled>{t("ready.awaitingPayment", lang)}</Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
