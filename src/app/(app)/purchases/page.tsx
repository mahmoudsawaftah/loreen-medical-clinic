import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/time";
import { listProducts, listSuppliers } from "@/server/services/inventory-service";
import { listPurchaseRequests, listPurchases } from "@/server/services/purchase-service";
import { Card, CardBody } from "@/components/ui/display";
import { StatusBadge, PURCHASE_STATUS_TONES } from "@/components/status";
import { statusLabels } from "@/lib/i18n/status";
import { PurchaseRequestModal, ApproveRequestModal, PurchaseCreateModal, VoidPurchaseButton } from "@/components/purchases/purchase-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lang = await getLang();
  const settings = await getSettings();
  const tab = sp.tab ?? "requests";
  const [products, suppliers] = await Promise.all([listProducts(user, { activeOnly: true, pageSize: 500 }), listSuppliers(user)]);
  const productPicks = products.items.map((p) => ({ id: p.id, name: p.name, stockUnit: p.stockUnit }));
  const medicalAllowed = hasPermission(user, PERMISSIONS.PURCHASE_MEDICAL_CREATE);
  const canApprove = hasPermission(user, PERMISSIONS.PURCHASE_APPROVE);
  const canReceive = hasPermission(user, PERMISSIONS.PURCHASE_RECEIVE);
  const canVoid = hasPermission(user, PERMISSIONS.PURCHASE_APPROVE);

  const requests = tab === "requests" ? await listPurchaseRequests(user, { pageSize: 100 }) : null;
  const purchases = tab === "purchases" ? await listPurchases(user, { pageSize: 100 }) : null;

  const purchaseLabels = statusLabels("purchase", lang);
  const requestTypeLabels = statusLabels("requestType", lang);
  const payLabels = statusLabels("paymentMethod", lang);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900 mb-1">{t("purchases.mainTitle", lang)}</h1>
          <p className="text-sm text-ink-500">{t("purchases.subtitle", lang)}</p>
        </div>
        <div className="flex gap-2">
          <PurchaseRequestModal products={productPicks} medicalAllowed={medicalAllowed} />
          {canReceive && <PurchaseCreateModal suppliers={suppliers} products={productPicks} />}
        </div>
      </div>

      <div className="flex gap-2 mb-5 text-sm">
        <a href="/purchases?tab=requests" className={`px-4 h-9 flex items-center rounded-lg border font-medium ${tab === "requests" ? "bg-primary-600 text-white border-primary-600" : "border-ink-300 text-ink-600"}`}>{t("purchases.requestsTab", lang)}</a>
        <a href="/purchases?tab=purchases" className={`px-4 h-9 flex items-center rounded-lg border font-medium ${tab === "purchases" ? "bg-primary-600 text-white border-primary-600" : "border-ink-300 text-ink-600"}`}>{t("purchases.purchasesTab", lang).replace("{n}", String(purchases?.total ?? ""))}</a>
      </div>

      {tab === "requests" && requests && (
        <Card>
          <CardBody className="p-0">
            {requests.items.length === 0 ? (
              <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("purchases.noRequests", lang)}</p>
            ) : (
              <div className="divide-y divide-ink-50">
                {requests.items.map((r) => (
                  <div key={r.id} className="px-4 sm:px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-bold">{requestTypeLabels[r.type]}</span>
                      <span className="text-xs text-ink-500">{t("purchases.by", lang)} {r.requester.name}</span>
                      {r.expectedAmount != null && <span className="text-xs font-medium tabular-nums">{t("closing.expected", lang)}: {formatMoney(r.expectedAmount, settings.currency, lang)}</span>}
                      <div className="mr-auto flex items-center gap-2">
                        <StatusBadge status={r.status} labels={purchaseLabels} tones={PURCHASE_STATUS_TONES} />
                        {canApprove && ["PENDING", "NEEDS_CHANGES"].includes(r.status) && <ApproveRequestModal requestId={r.id} />}
                      </div>
                    </div>
                    {r.description && <p className="text-xs text-ink-500 mt-1">{r.description}</p>}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {r.items.map((it) => (
                        <span key={it.id} className="text-[11px] bg-ink-50 rounded px-2 py-1">{it.product?.name ?? it.description} × {Number(it.qty)}{it.product?.stockUnit || " "} {it.estimatedCost ? `(~${formatMoney(it.estimatedCost, settings.currency, lang)})` : ""}</span>
                      ))}
                    </div>
                    {r.rejectedReason && <p className="text-[11px] text-red-500 mt-1">{t("purchases.reason", lang)}: {r.rejectedReason}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {tab === "purchases" && purchases && (
        <Card>
          <CardBody className="p-0">
            {purchases.items.length === 0 ? (
              <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("purchases.noPurchases", lang)}</p>
            ) : (
              <div className="divide-y divide-ink-50">
                {purchases.items.map((p) => (
                  <div key={p.id} className="px-4 sm:px-5 py-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-bold tabular-nums">#{p.purchaseNo}</span>
                      <span className="text-xs text-ink-500">{t("purchases.supplierInvoice", lang)}: <span dir="ltr">{p.invoiceNo}</span></span>
                      <span className="text-xs text-ink-500">{p.supplier?.name ?? t("purchases.withoutSupplier", lang)}</span>
                      <span className="text-xs font-bold tabular-nums">{formatMoney(p.totalAmount, settings.currency, lang)}</span>
                      {p.method && <span className="text-[11px] text-ink-400">{payLabels[p.method]}</span>}
                      <div className="mr-auto flex items-center gap-2">
                        <StatusBadge status={p.status} labels={purchaseLabels} tones={PURCHASE_STATUS_TONES} />
                        {canVoid && p.status !== "VOID" && <VoidPurchaseButton purchaseId={p.id} />}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.items.map((it) => (
                        <span key={it.id} className="text-[11px] bg-ink-50 rounded px-2 py-1">{it.description} × {Number(it.qtyReceived)} {it.unit ?? ""}{it.isExpenseOnly ? ` (${t("purchases.expenseOnly", lang)})` : ""}</span>
                      ))}
                    </div>
                    {p.notes && <p className="text-[11px] text-ink-500 mt-1">{p.notes}</p>}
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
