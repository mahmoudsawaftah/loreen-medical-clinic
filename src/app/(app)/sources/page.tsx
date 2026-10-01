import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/time";
import { listCustomerSources, marketingReport } from "@/server/services/customer-source-service";
import { Card, CardHeader, CardBody, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { CreateSourceForm, SourceRow } from "@/components/sources/source-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const sources = await listCustomerSources(user);
  const report = await marketingReport(user, { from: sp.from ?? null, to: sp.to ?? null });

  const periodSuffix = sp.from || sp.to ? t("sources.periodFiltered", lang) : t("sources.periodTotal", lang);

  return (
    <>
      <PageHeader title={t("sources.title", lang)} subtitle={t("sources.subtitle", lang)} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("sources.addTitle", lang)} />
          <CardBody>
            <CreateSourceForm />
          </CardBody>
          <CardBody className="pt-0">
            <div className="space-y-2">
              {sources.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </div>
          </CardBody>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title={t("sources.reportTitle", lang)} subtitle={t("sources.reportSub", lang).replace("{period}", periodSuffix)} />
            <CardBody className="p-0">
              {report.hasStructuredData ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-[11px] text-ink-500 border-b border-ink-100">
                      <th className="px-4 sm:px-5 py-2.5 font-medium">{t("sources.sourceCol", lang)}</th>
                      <th className="px-3 py-2.5 font-medium">{t("sources.newCustomersCol", lang)}</th>
                      <th className="px-3 py-2.5 font-medium">{t("sources.billedValueCol", lang)}</th>
                      <th className="px-3 py-2.5 font-medium">{t("invoices.status", lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-50">
                    {report.bySource.map((s) => (
                      <tr key={s.id}>
                        <td className="px-4 sm:px-5 py-2.5 font-medium">{s.name}</td>
                        <td className="px-3 py-2.5 tabular-nums">{s.newCustomers}</td>
                        <td className="px-3 py-2.5 tabular-nums">{formatMoney(s.billedAmount, settings.currency, lang)}</td>
                        <td className="px-3 py-2.5"><Badge tone={s.active ? "success" : "neutral"}>{s.active ? t("sources.active", lang) : t("sources.inactive", lang)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title={t("sources.noSources", lang)} description={t("sources.noSourcesDesc", lang)} />
              )}
            </CardBody>
          </Card>

          {report.referred.length > 0 && (
            <Card>
              <CardHeader title={t("sources.referredTitle", lang)} actions={<Badge tone="neutral">{report.referred.length}</Badge>} />
              <CardBody className="p-0">
                <div className="divide-y divide-ink-50">
                  {report.referred.map((r) => (
                    <div key={r.id} className="px-4 sm:px-5 py-3 flex items-center justify-between text-sm">
                      <span className="font-medium">{r.fullName}</span>
                      <span className="text-xs text-ink-400">{t("sources.referredBy", lang)}: {r.referrer?.fullName ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
