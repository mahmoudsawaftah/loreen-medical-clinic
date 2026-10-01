"use client";

import { useRef, useState } from "react";
import { AddStockModal, AdjustStockModal, DeleteProductButton, EditProductModal } from "@/components/inventory/inventory-forms";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export interface ProductMenuData {
  id: string;
  name: string;
  englishName: string | null;
  category: string;
  sku: string | null;
  stockUnit: string;
  purchaseUnit: string | null;
  conversionToStock: string | null;
  minStock: string;
  trackBatch: boolean;
  trackExpiry: boolean;
  divisible: boolean;
  usagePrecision: number;
  supplierId: string | null;
  notes: string | null;
  active: boolean;
  onHand: string;
  batches: { id: string; batchNo: string | null; qtyOnHand: string }[];
}

export function ProductMenu({ product, canEdit, canAddStock, canAdjust, canDelete, suppliers, categories }: {
  product: ProductMenuData;
  canEdit: boolean;
  canAddStock: boolean;
  canAdjust: boolean;
  canDelete: boolean;
  suppliers: { id: string; name: string }[];
  categories: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { lang } = useLang();

  if (!canEdit && !canAddStock && !canAdjust && !canDelete) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("inventory.actionsLabel", lang)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="w-8 h-8 rounded-full text-ink-500 hover:bg-ink-100 text-lg leading-none"
      >⋯</button>
      {open && (
        <div className="absolute end-0 top-9 z-30 w-56 rounded-xl border border-ink-200 bg-white shadow-lg p-1.5" onClick={(e) => e.stopPropagation()}>
          {canEdit && (
            <div className="px-1.5 py-1">
              <EditProductModal product={{
                id: product.id, name: product.name, englishName: product.englishName, category: product.category, sku: product.sku, stockUnit: product.stockUnit,
                purchaseUnit: product.purchaseUnit, conversionToStock: product.conversionToStock, minStock: product.minStock,
                trackBatch: product.trackBatch, trackExpiry: product.trackExpiry, divisible: product.divisible,
                usagePrecision: product.usagePrecision, supplierId: product.supplierId, notes: product.notes,
              }} suppliers={suppliers} categories={categories} />
            </div>
          )}
          {canAddStock && (
            <div className="px-1.5 py-1">
              <AddStockModal product={{
                id: product.id, name: product.name, stockUnit: product.stockUnit, purchaseUnit: product.purchaseUnit,
                conversionToStock: product.conversionToStock, trackBatch: product.trackBatch, trackExpiry: product.trackExpiry,
              }} />
            </div>
          )}
          {canAdjust && (
            <div className="px-1.5 py-1">
              <AdjustStockModal productId={product.id} productName={product.name} unit={product.stockUnit} batches={product.batches} totalOnHand={product.onHand} />
            </div>
          )}
          {canDelete && (
            <div className="px-1.5 py-1">
              <DeleteProductButton productId={product.id} productName={product.name} canDelete={canDelete} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
