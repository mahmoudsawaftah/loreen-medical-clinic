import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { formatMoney, formatDate } from "@/lib/time";
import { getSettings } from "@/lib/settings";
import { listInventoryCounts, getInventoryCount } from "@/server/services/inventory-count-service";
import { listCategories } from "@/server/services/inventory-service";
import { Card, CardHeader, CardBody, Badge, EmptyState, PageHeader } from "@/components/ui/display";
import { CreateCountForm, CountStatusBadge, CountWorkflowButtons, CountLineQty } from "@/components/inventory-counts/count-forms";
import Link from "next/link";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

const STATUS_KEY = { DRAFT: "counts.st.draft", IN_PROGRESS: "counts.st.inProgress", SUBMITTED: "counts.st.submitted", REVIEWED: "counts.st.reviewed", POSTED: "counts.st.posted" } as const;

export default async function InventoryCountsPage({ searchParams }: { searchParams: Promise<{ count?: string }> }) {
  const { count } = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const canCount = hasPermission(user, PERMISSIONS.INVENTORY_COUNT);
  const canPost = hasPermission(user, PERMISSIONS.INVENTORY_COUNT_POST);
  const categories = await listCategories(user);
  const list = await listInventoryCounts(user, { pageSize: 50 });
  const selected = count ? await getInventoryCount(user, count).catch(() => null) : null;

  return (
    <>
      <PageHeader title={t("counts.pageTitle", lang)} subtitle={t("counts.pageSub", lang)} actions={list.total > 0 ? <Badge tone="neutral">{t("counts.countsCount", lang).replace("{n}", String(list.total))}</Badge> : undefined} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          {canCount && (
            <Card>
              <CardHeader title={t("counts.newCount", lang)} subtitle={t("counts.newCountSub", lang)} />
              <CardBody>
                <CreateCountForm categories={categories} />
              </CardBody>
            </Card>
          )}
          {!canCount && <p className="text-xs text-ink-500">{t("counts.onlyOwnerAccountant", lang)}</p>}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title={t("counts.logTitle", lang)} actions={<Badge tone="neutral">{list.total}</Badge>} />
            <CardBody className="p-0">
              {list.items.length === 0 ? (
                <EmptyState title={t("counts.none", lang)} description={t("counts.noneDesc", lang)} />
              ) : (
                <div className="divide-y divide-ink-50">
                  {list.items.map((c) => (
                    <Link key={c.id} href={`/inventory-counts?count=${c.id}`} className={`block px-4 sm:px-5 py-3 hover:bg-ink-50/60 ${selected?.id === c.id ? "bg-primary-50/60" : ""}`}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium">{t("counts.countNo", lang).replace("{n}", String(c.countNo))}</span>
                        <span className="text-[11px] text-ink-400">{formatDate(c.countDate, settings.timezone)}</span>
                        <CountStatusBadge status={c.status} />
                        <span className="text-[11px] text-ink-400 mr-auto">{t("counts.by", lang)} {c.createdBy.name}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {selected && (
            <Card>
              <CardHeader
                title={`${t("counts.countNo", lang).replace("{n}", String(selected.countNo))} — ${t(STATUS_KEY[selected.status] ?? "counts.st.draft", lang)}`}
                subtitle={`${formatDate(selected.countDate, settings.timezone)} — ${t("counts.lines", lang).replace("{n}", String(selected.lines.length))}`}
                actions={<CountWorkflowButtons countId={selected.id} status={selected.status} />}
              />
              <CardBody className="p-0 overflow-x-auto">
                {selected.lines.length === 0 ? (
                  <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("counts.noActiveProducts", lang)}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-[11px] text-ink-500 border-b border-ink-100">
                        <th className="px-4 sm:px-5 py-2.5 font-medium">{t("counts.productCol", lang)}</th>
                        <th className="px-3 py-2.5 font-medium">{t("counts.batchCol", lang)}</th>
                        <th className="px-3 py-2.5 font-medium">{t("counts.expectedCol", lang)}</th>
                        <th className="px-3 py-2.5 font-medium">{t("counts.countedCol", lang)}</th>
                        <th className="px-3 py-2.5 font-medium">{t("counts.diffCol", lang)}</th>
                        <th className="px-3 py-2.5 font-medium">{t("counts.costImpactCol", lang)}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {selected.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="px-4 sm:px-5 py-2.5">{l.product.name}<span className="block text-[11px] text-ink-400">{l.product.category} · {l.unit}</span></td>
                          <td className="px-3 py-2.5 text-xs text-ink-500">{l.batch ? `${l.batch.batchNo ?? "—"} ${l.batch.expiryDate ? `(${formatDate(l.batch.expiryDate, settings.timezone)})` : ""}` : "—"}</td>
                          <td className="px-3 py-2.5 tabular-nums">{Number(l.expectedQty)}</td>
                          <td className="px-3 py-2.5">
                            <CountLineQty countId={selected.id} lineId={l.id} initial={Number(l.countedQty)} disabled={selected.status !== "IN_PROGRESS"} />
                          </td>
                          <td className={`px-3 py-2.5 tabular-nums font-medium ${Number(l.difference) !== 0 ? "text-amber-600" : "text-ink-400"}`}>{Number(l.difference) !== 0 ? `+${l.difference}` : "0"}</td>
                          <td className="px-3 py-2.5 tabular-nums text-[12px]">{formatMoney(Number(l.estimatedCostImpact), settings.currency, lang)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
              {!canPost && <p className="px-5 pb-4 text-[11px] text-ink-400">{t("counts.reviewPostOnlyOwner", lang)}</p>}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
