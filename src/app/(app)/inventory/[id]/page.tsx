import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { moneyZero } from "@/lib/money";
import { getProduct, getProductCountHistory, listSuppliers, listCategories } from "@/server/services/inventory-service";
import { Card, CardHeader, CardBody, Badge, EmptyState } from "@/components/ui/display";
import { STOCK_MOVEMENT_TONES } from "@/components/status";
import { statusLabels } from "@/lib/i18n/status";
import { AddStockModal, EditProductModal } from "@/components/inventory/inventory-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { localizedName, localizedInventoryTerm } from "@/lib/i18n/entities";

export default async function ProductDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const product = await getProduct(user, id);
  if (!product) notFound();
  const canEdit = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT);
  const canAddStock = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK);
  const countLines = await getProductCountHistory(user, id);
  const categories = (await listCategories(user)).map((c) => c.category).filter((c): c is string => !!c);
  const suppliers = await listSuppliers(user);
  const activeTab = tab ?? "overview";
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const onHand = product.batches.reduce((a, b) => a.plus(b.qtyOnHand), moneyZero());
  void onHand;

  const movementLabels = statusLabels("stockMovement", lang);

  const tabs: { key: string; label: string }[] = [
    { key: "overview", label: t("inventory.overviewTab", lang) },
    { key: "movements", label: t("inventory.movementsTab", lang) },
    { key: "batches", label: t("inventory.batchesTab", lang) },
    { key: "counts", label: t("inventory.countsTab", lang) },
  ];

  return (
    <>
      <div className="mb-4">
        <Link href="/inventory" className="text-xs text-primary-700 hover:underline">← {t("inventory.backLink", lang)}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-1">
          <div>
            <h1 className="text-xl font-bold text-ink-900 mb-1">{localizedName(product.name, product.englishName, lang)}</h1>
            <p className="text-xs text-ink-400" dir="ltr">{product.sku ?? ""} · {localizedInventoryTerm(product.category, lang)} · {localizedInventoryTerm(product.stockUnit, lang)}</p>
          </div>
          <div className="flex gap-2">
            {canAddStock && <AddStockModal product={{ id: product.id, name: product.name, stockUnit: product.stockUnit, purchaseUnit: product.purchaseUnit, conversionToStock: product.conversionToStock ? product.conversionToStock.toString() : null, trackBatch: product.trackBatch, trackExpiry: product.trackExpiry }} />}
            {canEdit && <EditProductModal product={{ id: product.id, name: product.name, englishName: product.englishName, category: product.category, sku: product.sku, stockUnit: product.stockUnit, purchaseUnit: product.purchaseUnit, conversionToStock: product.conversionToStock ? product.conversionToStock.toString() : null, minStock: product.minStock.toString(), trackBatch: product.trackBatch, trackExpiry: product.trackExpiry, divisible: product.divisible, usagePrecision: product.usagePrecision, supplierId: product.supplierId, notes: product.notes }} suppliers={suppliers} categories={categories} />}
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-ink-200 overflow-x-auto">
        {tabs.map((tabItem) => (
          <Link key={tabItem.key} href={`/inventory/${id}?tab=${tabItem.key}`} className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 ${activeTab === tabItem.key ? "border-primary-600 text-primary-800 font-semibold" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
            {tabItem.label}
          </Link>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader title={t("inventory.balanceTitle", lang)} />
            <CardBody>
              <p className="text-3xl font-bold tabular-nums">{product.batches.reduce((a, b) => a + Number(b.qtyOnHand), 0)} <span className="text-base text-ink-400 font-normal">{product.stockUnit}</span></p>
              <p className="text-xs text-ink-400 mt-1">{t("inventory.minAlert", lang).replace("{n}", String(Number(product.minStock)))}</p>
              {!product.divisible && <p className="text-xs text-ink-500 mt-2">{t("inventory.wholeOnly", lang)}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("inventory.costTitle", lang)} />
            <CardBody>
              <p className="text-3xl font-bold tabular-nums">{settings.currency} {product.batches.reduce((a, b) => a + Number(b.qtyOnHand) * Number(b.unitCost ?? product.avgCost ?? 0), 0).toFixed(2)}</p>
              <p className="text-xs text-ink-400 mt-1">{t("inventory.avgUnitCost", lang).replace("{n}", `${settings.currency} ${Number(product.avgCost ?? 0).toFixed(2)}`)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t("inventory.purchaseTitle", lang)} />
            <CardBody>
              <p className="text-sm text-ink-700">{product.supplier?.name ?? t("inventory.noSupplier", lang)}</p>
              {product.purchaseUnit && product.conversionToStock && (
                <p className="text-xs text-ink-400 mt-1">{product.purchaseUnit} = {Number(product.conversionToStock)} {product.stockUnit}</p>
              )}
              {product.notes && <p className="text-xs text-ink-500 mt-2">{product.notes}</p>}
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === "movements" && (
        <Card>
          <CardHeader title={t("inventory.movementLog", lang)} actions={<Badge tone="neutral">{product.movements.length}</Badge>} />
          <CardBody className="p-0">
            {product.movements.length === 0 ? (
              <EmptyState title={t("inventory.noMovements", lang)} description={t("inventory.noMovementsDesc", lang)} />
            ) : (
              <div className="divide-y divide-ink-50">
                {product.movements.map((m) => (
                  <div key={m.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Badge tone={STOCK_MOVEMENT_TONES[m.type] ?? "neutral"}>{movementLabels[m.type] ?? m.type}</Badge>
                    <span className={`font-bold tabular-nums text-sm ${Number(m.qty) >= 0 ? "text-emerald-700" : "text-red-600"}`}>{Number(m.qty) >= 0 ? "+" : ""}{Number(m.qty)} {m.unit}</span>
                    <span className="text-xs text-ink-400">{t("inventory.balanceAfter", lang).replace("{n}", String(Number(m.balanceAfter)))}</span>
                    {m.batch && <span className="text-[11px] text-ink-400">{t("inventory.batchRef", lang)} {m.batch.batchNo ?? "—"}</span>}
                    {m.reason && <span className="text-xs text-ink-500 w-full sm:w-auto">«{m.reason}»</span>}
                    <span className="mr-auto text-[11px] text-ink-400">{formatDateTime(m.createdAt, settings.timezone)} · {m.user.name}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === "batches" && (
        <Card>
          <CardHeader title={t("inventory.batches", lang)} actions={<Badge tone="neutral">{product.batches.length}</Badge>} />
          <CardBody className="p-0">
            {product.batches.length === 0 ? (
              <EmptyState title={t("inventory.noBatches", lang)} description={t("inventory.noBatchesDesc", lang)} />
            ) : (
              <div className="divide-y divide-ink-50">
                {product.batches.map((b) => (
                  <div key={b.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium text-sm">{t("inventory.batchRef", lang)} {b.batchNo ?? "—"}</span>
                    <span className="font-bold tabular-nums">{Number(b.qtyOnHand)} {product.stockUnit}</span>
                    {b.unitCost && <span className="text-xs text-ink-400">{t("inventory.perUnit", lang).replace("{n}", `${settings.currency} ${Number(b.unitCost).toFixed(2)}`)}</span>}
                    {b.expiryDate && (
                      <Badge tone={b.expiryDate <= now ? "danger" : b.expiryDate <= soon ? "warning" : "neutral"}>
                        {b.expiryDate <= now ? t("inventory.expiredBadge", lang) : t("inventory.expiresBadge", lang)}: {formatDateTime(b.expiryDate, settings.timezone)}
                      </Badge>
                    )}
                    {!b.active && <Badge tone="neutral">{t("inventory.inactiveBatch", lang)}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === "counts" && (
        <Card>
          <CardHeader title={t("inventory.countLog", lang)} actions={<Badge tone="neutral">{countLines.length}</Badge>} />
          <CardBody className="p-0">
            {countLines.length === 0 ? (
              <EmptyState title={t("inventory.noCounts", lang)} description={t("inventory.noCountsDesc", lang)} />
            ) : (
              <div className="divide-y divide-ink-50">
                {countLines.map((l) => (
                  <div key={l.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium text-sm">{t("inventory.countAt", lang).replace("{d}", formatDateTime(l.count.countDate, settings.timezone))}</span>
                    <span className="text-xs text-ink-400">{t("inventory.expectedCounted", lang).replace("{e}", String(Number(l.expectedQty))).replace("{c}", String(Number(l.countedQty)))}</span>
                    <span className={`font-bold tabular-nums text-sm ${Number(l.difference) >= 0 ? "text-emerald-700" : "text-red-600"}`}>{Number(l.difference) >= 0 ? "+" : ""}{Number(l.difference)} {l.unit}</span>
                    {l.batch && <span className="text-[11px] text-ink-400">{t("inventory.batchRef", lang)} {l.batch.batchNo ?? "—"}</span>}
                    <span className="mr-auto text-[11px] text-ink-400">{formatDateTime(l.createdAt, settings.timezone)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}
