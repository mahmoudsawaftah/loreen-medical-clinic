import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { listProducts, stockAlerts, listSuppliers, listCategories } from "@/server/services/inventory-service";
import { Card, CardBody, Badge, EmptyState } from "@/components/ui/display";
import { ProductCreateModal } from "@/components/inventory/inventory-forms";
import { ProductMenu, type ProductMenuData } from "@/components/inventory/product-menu";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { localizedName, localizedInventoryTerm } from "@/lib/i18n/entities";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; active?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const canEdit = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT);
  const canAddStock = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK);
  const canAdjust = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_ADJUST);
  const canDelete = hasPermission(user, GRANULAR_PERMISSIONS.INVENTORY_DELETE);
  const result = await listProducts(user, { query: sp.q, activeOnly: sp.active !== "all", pageSize: 100 });
  const { lowStock: lowAlerts, expiring } = await stockAlerts(user);
  const categories = (await listCategories(user)).map((c) => c.category).filter((c): c is string => !!c);
  const suppliers = await listSuppliers(user);
  const soon = new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("inventory.title", lang)}</h1>
          <p className="text-sm text-ink-500">{t("inventory.subtitle", lang).replace("{n}", String(result.total)).replace("{m}", String(lowAlerts.length)).replace("{k}", String(expiring.length))}</p>
        </div>
        <div className="flex gap-2">
          <form method="get">
            <input name="q" defaultValue={sp.q ?? ""} placeholder={t("inventory.searchPh", lang)} className="h-10 rounded-lg border border-ink-300 px-3 text-sm w-56" />
          </form>
          <ProductCreateModal suppliers={suppliers} categories={categories} />
        </div>
      </div>

      {lowAlerts.length > 0 && (
        <Card className="mb-5 border-amber-200">
          <CardBody>
            <h3 className="font-semibold text-sm mb-2 text-amber-800">{t("inventory.lowAlertsTitle", lang).replace("{n}", String(lowAlerts.length))}</h3>
            <div className="flex flex-wrap gap-2">
              {lowAlerts.map((a) => (
                <Link key={a.product.id} href={`/inventory/${a.product.id}`}>
                  <Badge tone="warning">{localizedName(a.product.name, a.product.englishName, lang)}: {Number(a.onHand)} {localizedInventoryTerm(a.product.stockUnit, lang)} ({t("inventory.lowAlertMin", lang).replace("{n}", String(Number(a.product.minStock)))})</Badge>
                </Link>
              ))}
            </div>
            {expiring.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-2">{t("inventory.expiringSoon", lang).replace("{n}", String(expiring.length))}</p>
            )}
          </CardBody>
        </Card>
      )}

      {result.items.length === 0 ? (
        <EmptyState title={t("inventory.none", lang)} description={t("inventory.noneDesc", lang)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.items.map((p) => {
            const value = p.batches.reduce((a, b) => a + Number(b.qtyOnHand) * Number(b.unitCost ?? p.avgCost ?? 0), 0);
            const expiringBatches = p.batches.filter((b) => b.expiryDate && b.expiryDate <= soon && Number(b.qtyOnHand) > 0);
            const expiredBatches = p.batches.filter((b) => b.expiryDate && b.expiryDate <= new Date() && Number(b.qtyOnHand) > 0);
            const menuData: ProductMenuData = {
              id: p.id, name: p.name, englishName: p.englishName, category: p.category, sku: p.sku, stockUnit: p.stockUnit,
              purchaseUnit: p.purchaseUnit, conversionToStock: p.conversionToStock ? p.conversionToStock.toString() : null,
              minStock: p.minStock.toString(), trackBatch: p.trackBatch, trackExpiry: p.trackExpiry,
              divisible: p.divisible, usagePrecision: p.usagePrecision, supplierId: p.supplierId, notes: p.notes,
              active: p.active, onHand: p.onHand.toString(),
              batches: p.batches.map((b) => ({ id: b.id, batchNo: b.batchNo, qtyOnHand: b.qtyOnHand.toString() })),
            };
            return (
              <div key={p.id} className={`rounded-2xl border bg-white p-4 flex flex-col gap-3 ${p.active ? "border-ink-200" : "border-ink-200 opacity-70"}`}>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/inventory/${p.id}`} className="min-w-0">
                    <p className="font-semibold truncate">{localizedName(p.name, p.englishName, lang)}</p>
                    <p className="text-[11px] text-ink-400" dir="ltr">{p.sku ?? ""} · {localizedInventoryTerm(p.category, lang)}</p>
                  </Link>
                  <ProductMenu product={menuData} canEdit={canEdit} canAddStock={canAddStock} canAdjust={canAdjust} canDelete={canDelete} suppliers={suppliers} categories={categories} />
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className={`text-2xl font-bold tabular-nums ${p.lowStock && p.active ? "text-red-600" : "text-ink-900"}`}>{Number(p.onHand)}</p>
                    <p className="text-[11px] text-ink-400">{localizedInventoryTerm(p.stockUnit, lang)} · {t("inventory.currentBalance", lang)}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold tabular-nums text-sm">{settings.currency} {value.toFixed(2)}</p>
                    <p className="text-[11px] text-ink-400">{t("inventory.stockValue", lang)}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-6">
                  {!p.active && <Badge tone="neutral">{t("inventory.stopped", lang)}</Badge>}
                  {p.active && p.lowStock && <Badge tone="danger">{t("inventory.lowStockBadge", lang)}</Badge>}
                  {expiredBatches.length > 0 && <Badge tone="danger">{t("inventory.expiredBadgeCount", lang).replace("{n}", String(expiredBatches.length))}</Badge>}
                  {expiringBatches.length > expiredBatches.length && <Badge tone="warning">{t("inventory.expiringBadgeCount", lang).replace("{n}", String(expiringBatches.length))}</Badge>}
                  {p.batches.length > 0 && <Badge tone="neutral">{t("inventory.batchesCount", lang).replace("{n}", String(p.batches.length))}</Badge>}
                  {p.supplier && <Badge tone="info">{p.supplier.name}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-ink-400 mt-3">{t("inventory.footerNote", lang)}</p>
    </>
  );
}
