"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProductAction, updateProductAction, addStockAction, adjustStockAction, deleteProductAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

const FRIENDLY_UNITS = ["وحدة", "مل", "سرنجة", "عبوة", "حبة", "قطعة", "زجاجة"];

export interface ProductFormData {
  name: string;
  englishName: string;
  category: string;
  sku: string;
  stockUnit: string;
  purchaseUnit: string;
  conversionToStock: string;
  minStock: string;
  trackBatch: boolean;
  trackExpiry: boolean;
  divisible: boolean;
  usagePrecision: string;
  supplierId: string;
  notes: string;
}

export const DEFAULT_PRODUCT_FORM: ProductFormData = {
  name: "", englishName: "", category: "", sku: "", stockUnit: "وحدة", purchaseUnit: "", conversionToStock: "", minStock: "0",
  trackBatch: false, trackExpiry: false, divisible: true, usagePrecision: "3", supplierId: "", notes: "",
};

export const PRODUCT_TEMPLATES: { key: string; label: string; fill: Partial<ProductFormData> }[] = [
  {
    key: "botox",
    label: "بوتوكس",
    fill: { name: "حقن بوتوكس", category: "حقن", stockUnit: "وحدة", purchaseUnit: "سرنجة", conversionToStock: "100", trackBatch: true, trackExpiry: true, divisible: true, usagePrecision: "3" },
  },
  {
    key: "filler",
    label: "فيلر",
    fill: { name: "حقن فيلر هيالورونيك", category: "حقن", stockUnit: "مل", purchaseUnit: "سرنجة", conversionToStock: "1", trackBatch: true, trackExpiry: true, divisible: true, usagePrecision: "2" },
  },
];

function useProductForm(initial: ProductFormData) {
  const [form, setForm] = useState<ProductFormData>(initial);
  const set = <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => setForm((f) => ({ ...f, [k]: v }));
  return { form, set, setForm };
}

function ProductFields({ form, set, setForm, suppliers, categories }: {
  form: ProductFormData;
  set: <K extends keyof ProductFormData>(k: K, v: ProductFormData[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ProductFormData>>;
  suppliers: { id: string; name: string }[];
  categories: string[];
}) {
  const { lang } = useLang();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <>
      <div>
        <p className="text-[11px] text-ink-400 mb-1.5">{t("inventory.quickTemplate", lang)}</p>
        <div className="flex gap-2">
          {PRODUCT_TEMPLATES.map((tpl) => (
            <button key={tpl.key} type="button" onClick={() => setForm((f) => ({ ...f, ...tpl.fill }))} className="h-8 px-3 rounded-full border border-primary-300 bg-primary-50 text-xs font-medium text-primary-800 hover:bg-primary-100">
              {tpl.label}
            </button>
          ))}
        </div>
      </div>

      <Field label={t("inventory.productName", lang)}><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
      <Field label={t("inventory.englishName", lang)}><Input value={form.englishName} onChange={(e) => set("englishName", e.target.value)} dir="ltr" placeholder="e.g. Botox injection" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("inventory.category", lang)}>
          <Select value={form.category} onChange={(e) => set("category", e.target.value)} required>
            <option value="">{t("inventory.categoryPh", lang)}</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("inventory.measureUnit", lang)}>
          <Select value={form.stockUnit} onChange={(e) => set("stockUnit", e.target.value)}>
            {FRIENDLY_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label={t("inventory.minAlertLabel", lang)}><Input type="number" step="0.001" inputMode="decimal" value={form.minStock} onChange={(e) => set("minStock", e.target.value)} /></Field>
        <Field label={t("inventory.supplier", lang)}>
          <Select value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
            <option value="">{t("inventory.noSupplierPh", lang)}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      </div>

      <button type="button" className="text-xs text-primary-700 hover:underline" onClick={() => setShowAdvanced(!showAdvanced)}>
        {showAdvanced ? t("inventory.hideAdvanced", lang) : t("inventory.showAdvanced", lang)}
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded-xl border border-ink-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU"><Input dir="ltr" value={form.sku} onChange={(e) => set("sku", e.target.value)} /></Field>
            <Field label={t("inventory.purchaseUnit", lang)}><Input value={form.purchaseUnit} onChange={(e) => set("purchaseUnit", e.target.value)} placeholder={t("inventory.purchaseUnitPh", lang)} /></Field>
          </div>
          {form.purchaseUnit && (
            <Field label={t("inventory.packageSize", lang)} hint={form.conversionToStock ? t("inventory.packageHint", lang).replace("{u}", form.purchaseUnit).replace("{c}", form.conversionToStock).replace("{s}", form.stockUnit) : undefined}>
              <Input type="number" step="0.001" inputMode="decimal" value={form.conversionToStock} onChange={(e) => set("conversionToStock", e.target.value)} placeholder="مثال: 100" />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("inventory.usagePrecision", lang)}>
              <Select value={form.usagePrecision} onChange={(e) => set("usagePrecision", e.target.value)}>
                <option value="0">{t("inventory.precision0", lang)}</option>
                <option value="1">{t("inventory.precision1", lang)}</option>
                <option value="2">{t("inventory.precision2", lang)}</option>
                <option value="3">{t("inventory.precision3", lang)}</option>
              </Select>
            </Field>
            <Field label={t("inventory.divisibleLabel", lang)}>
              <Select value={form.divisible ? "yes" : "no"} onChange={(e) => set("divisible", e.target.value === "yes")}>
                <option value="yes">{t("inventory.divisibleYes", lang)}</option>
                <option value="no">{t("inventory.divisibleNo", lang)}</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.trackBatch} onChange={(e) => set("trackBatch", e.target.checked)} /> {t("inventory.trackBatchesLabel", lang)}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.trackExpiry} onChange={(e) => set("trackExpiry", e.target.checked)} /> {t("inventory.trackExpiryLabel", lang)}</label>
          <Field label={t("patients.notes", lang)}><Input value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        </div>
      )}
    </>
  );
}

export function ProductCreateModal({ suppliers, categories }: { suppliers: { id: string; name: string }[]; categories: string[] }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { form, set, setForm } = useProductForm(DEFAULT_PRODUCT_FORM);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    const result = await createProductAction({
      name: form.name,
      englishName: form.englishName || null,
      category: form.category.trim() || "عام",
      sku: form.sku || null,
      stockUnit: form.stockUnit.trim() || "وحدة",
      purchaseUnit: form.purchaseUnit.trim() || null,
      conversionToStock: form.conversionToStock ? Number(form.conversionToStock) : null,
      minStock: Number(form.minStock || 0),
      divisible: form.divisible,
      usagePrecision: Number(form.usagePrecision || 3),
      trackExpiry: form.trackExpiry,
      trackBatch: form.trackBatch,
      supplierId: form.supplierId || null,
      notes: form.notes || null,
    });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setSuccess(t("inventory.savedProduct", lang));
    setTimeout(() => { closeModal(); router.refresh(); }, 900);
  };

  return (
    <>
      <Button size="sm" onClick={openModal}>+ {t("inventory.addProduct", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("inventory.addProduct", lang)} subtitle={t("inventory.newProductSub", lang)}>
        <form className="space-y-3" onSubmit={submit}>
          <ModalFormStatus error={error} success={success} />
          <ProductFields form={form} set={set} setForm={setForm} suppliers={suppliers} categories={categories} />
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("inventory.saveProduct", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function EditProductModal({ product, suppliers, categories }: { product: {
  id: string; name: string; englishName: string | null; category: string; sku: string | null; stockUnit: string; purchaseUnit: string | null;
  conversionToStock: string | null; minStock: string; trackBatch: boolean; trackExpiry: boolean;
  divisible: boolean; usagePrecision: number; supplierId: string | null; notes: string | null;
}; suppliers: { id: string; name: string }[]; categories: string[] }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { form, set, setForm } = useProductForm({
    name: product.name, englishName: product.englishName ?? "", category: product.category, sku: product.sku ?? "", stockUnit: product.stockUnit,
    purchaseUnit: product.purchaseUnit ?? "", conversionToStock: product.conversionToStock ?? "",
    minStock: product.minStock, trackBatch: product.trackBatch, trackExpiry: product.trackExpiry,
    divisible: product.divisible, usagePrecision: String(product.usagePrecision),
    supplierId: product.supplierId ?? "", notes: product.notes ?? "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    const result = await updateProductAction({ productId: product.id, data: {
      name: form.name, englishName: form.englishName || null, category: form.category.trim() || "عام", sku: form.sku || null, stockUnit: form.stockUnit.trim() || "وحدة",
      purchaseUnit: form.purchaseUnit.trim() || null, conversionToStock: form.conversionToStock ? Number(form.conversionToStock) : null,
      minStock: Number(form.minStock || 0), divisible: form.divisible, usagePrecision: Number(form.usagePrecision || 3),
      trackExpiry: form.trackExpiry, trackBatch: form.trackBatch, supplierId: form.supplierId || null, notes: form.notes || null,
    }});
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setSuccess(t("inventory.editedProduct", lang));
    setTimeout(() => { closeModal(); router.refresh(); }, 800);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>{t("inventory.edit", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={`${t("inventory.edit", lang)}: ${product.name}`} subtitle={t("inventory.editSub", lang)}>
        <form className="space-y-3" onSubmit={submit}>
          <ModalFormStatus error={error} success={success} />
          <ProductFields form={form} set={set} setForm={setForm} suppliers={suppliers} categories={categories} />
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("inventory.saveEdits", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AddStockModal({ product }: { product: { id: string; name: string; stockUnit: string; purchaseUnit: string | null; conversionToStock: string | null; trackBatch: boolean; trackExpiry: boolean } }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [notes, setNotes] = useState("");

  const conversion = product.conversionToStock ? Number(product.conversionToStock) : null;
  const qtyNum = Number(qty) || 0;
  const costNum = Number(unitCost) || 0;
  const stockQty = conversion ? qtyNum * conversion : qtyNum;
  const costPerUnit = conversion ? (qtyNum > 0 ? costNum / conversion : 0) : costNum;

  return (
    <>
      <Button size="sm" onClick={openModal}>{t("inventory.addStock", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("inventory.addQtyTitle", lang).replace("{n}", product.name)} subtitle={t("inventory.addQtySub", lang)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const result = await addStockAction({ productId: product.id, data: {
            qty: qtyNum,
            unitCost: costNum,
            batchNo: batchNo.trim() || null,
            expiryDate: expiryDate || null,
            invoiceRef: invoiceRef.trim() || null,
            notes: notes.trim() || null,
          }});
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("inventory.stockReceived", lang));
          setTimeout(() => { closeModal(); router.refresh(); }, 700);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("inventory.qtyOf", lang).replace("{u}", conversion ? product.purchaseUnit ?? product.stockUnit : product.stockUnit)}>
              <Input type="number" step="0.001" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </Field>
            <Field label={t("inventory.priceOf", lang).replace("{u}", conversion ? product.purchaseUnit ?? product.stockUnit : product.stockUnit).replace("{h}", conversion ? (costPerUnit > 0 ? t("inventory.pricePer", lang).replace("{c}", String(costPerUnit)).replace("{s}", product.stockUnit) : t("inventory.priceAuto", lang)) : "")}>
              <Input type="number" step="0.001" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
            </Field>
          </div>
          {conversion && stockQty > 0 && (
            <p className="text-xs text-primary-700 bg-primary-50 border border-primary-100 rounded-lg px-3 py-2">
              {t("inventory.conversionNote", lang).replace("{q}", String(qtyNum)).replace("{pu}", product.purchaseUnit ?? "").replace("{c}", String(conversion)).replace("{s}", String(stockQty)).replace("{su}", product.stockUnit)}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {product.trackBatch && <Field label={t("inventory.batchNo", lang)}><Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder={t("inventory.optional", lang)} /></Field>}
            {product.trackExpiry && <Field label={t("inventory.expiry", lang)}><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>}
            <Field label={t("inventory.invoiceRef", lang)}><Input dir="ltr" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} placeholder={t("inventory.optional", lang)} /></Field>
            <Field label={t("patients.notes", lang)}><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("inventory.optional", lang)} /></Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("inventory.addToStock", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function AdjustStockModal({ productId, productName, unit, batches, totalOnHand }: { productId: string; productName: string; unit: string; batches: { id: string; batchNo: string | null; qtyOnHand: string }[]; totalOnHand: string }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [type, setType] = useState("ADJUSTMENT");

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>{t("inventory.count", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("inventory.adjustTitle", lang).replace("{n}", productName)} subtitle={t("inventory.adjustSub", lang).replace("{q}", totalOnHand).replace("{u}", unit)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          const qty = Number(form.get("qty"));
          const batchId = String(form.get("batchId") ?? "") || null;
          if (!Number.isFinite(qty) || qty === 0) { setError(t("inventory.qtyRequired", lang)); setLoading(false); return; }
          const result = await adjustStockAction({ productId, data: {
            batchId,
            qty,
            reason: String(form.get("reason") ?? "").trim() || "تسوية يدوية",
            type: type as "ADJUSTMENT" | "WASTE" | "EXPIRED" | "RETURN_TO_SUPPLIER",
          }});
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("inventory.adjustDone", lang));
          setTimeout(() => { closeModal(); router.refresh(); }, 700);
        }}>
          <ModalFormStatus error={error} success={success} />
          <Field label={t("inventory.adjustType", lang)}>
            <div className="grid grid-cols-2 gap-2">
              {([["ADJUSTMENT", t("inventory.adjustCount", lang)], ["WASTE", t("inventory.waste", lang)], ["EXPIRED", t("inventory.expiredType", lang)], ["RETURN_TO_SUPPLIER", t("inventory.returnSupplier", lang)]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setType(val)} className={`h-9 rounded-lg border text-xs font-medium ${type === val ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{label}</button>
              ))}
            </div>
          </Field>
          {batches.length > 1 && (
            <Field label={t("inventory.batches", lang)}>
              <Select name="batchId">
                <option value="">{t("inventory.allBatches", lang)}</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{t("inventory.batchWithBalance", lang).replace("{b}", b.batchNo ?? "—").replace("{q}", b.qtyOnHand)}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t("inventory.qtyOf", lang).replace("{u}", unit)} hint={t("inventory.qtyHint", lang)}>
            <Input name="qty" type="number" step="0.001" inputMode="decimal" required />
          </Field>
          <Field label={t("inventory.reason", lang)}><Input name="reason" required /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("inventory.executeAdjust", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DeleteProductButton({ productId, productName, canDelete }: { productId: string; productName: string; canDelete: boolean }) {
  const router = useRouter();
  const { lang } = useLang();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canDelete) return null;
  return (
    <>
      <button type="button" onClick={() => setConfirming(true)} className="w-full text-right px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg">{t("inventory.deleteTitle", lang)}</button>
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setConfirming(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const result = await deleteProductAction({ productId });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setConfirming(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{t("inventory.deleteTitle", lang)}</h3>
            <p className="text-xs text-ink-500">{t("inventory.deleteWarning", lang).replace("{n}", productName)}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>{t("common.cancel", lang)}</Button>
              <Button type="submit" variant="danger" size="sm" loading={loading}>{t("inventory.deleteForever", lang)}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
