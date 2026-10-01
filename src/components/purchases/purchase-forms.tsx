"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseRequestAction, createPurchaseAction, approvePurchaseRequestAction, voidPurchaseAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export interface ProductPick { id: string; name: string; stockUnit: string }

export function PurchaseRequestModal({ products, medicalAllowed }: { products: ProductPick[]; medicalAllowed: boolean }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [type, setType] = useState<"OPERATIONAL" | "MEDICAL">(medicalAllowed ? "MEDICAL" : "OPERATIONAL");
  const [rows, setRows] = useState([{ productId: "", description: "", qty: "", estimatedCost: "" }]);

  return (
    <>
      <Button size="sm" onClick={openModal}>{t("purchases.plusRequest", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("purchases.new", lang)} subtitle={t("purchases.requestSub", lang)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          const result = await createPurchaseRequestAction({
            type,
            description: String(form.get("description") ?? "") || null,
            notes: String(form.get("notes") ?? "") || null,
            expectedAmount: form.get("expectedAmount") ? Number(form.get("expectedAmount")) : null,
            items: rows.filter((r) => r.description.trim() && Number(r.qty) > 0).map((r) => ({
              productId: r.productId || null,
              description: r.description.trim(),
              qty: Number(r.qty),
              unit: null,
              estimatedCost: r.estimatedCost ? Number(r.estimatedCost) : null,
            })),
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("purchases.requestSent", lang));
          setTimeout(() => { closeModal(); router.refresh(); }, 600);
        }}>
          <ModalFormStatus error={error} success={success} />
          <Field label={t("purchases.requestType", lang)}>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={!medicalAllowed} onClick={() => setType("MEDICAL")} className={`h-9 rounded-lg border text-xs font-medium ${type === "MEDICAL" ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"} ${!medicalAllowed ? "opacity-50" : ""}`}>{t("purchases.medicalType", lang)}</button>
              <button type="button" onClick={() => setType("OPERATIONAL")} className={`h-9 rounded-lg border text-xs font-medium ${type === "OPERATIONAL" ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{t("purchases.operationalType", lang)}</button>
            </div>
          </Field>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                <Select value={row.productId} onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setRows(rows.map((r, j) => j === i ? { ...r, productId: e.target.value, description: p?.name ?? r.description } : r));
                }}>
                  <option value="">{t("purchases.productPh", lang)}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input value={row.description} placeholder={t("purchases.descriptionPh", lang)} required onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
                <Input value={row.qty} placeholder={t("purchases.qtyPh", lang)} inputMode="decimal" required onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} />
                <div className="flex gap-1">
                  <Input value={row.estimatedCost} placeholder={t("purchases.estimatedCostPh", lang)} inputMode="decimal" onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, estimatedCost: e.target.value } : r))} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { productId: "", description: "", qty: "", estimatedCost: "" }])}>{t("purchases.addRow", lang)}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("purchases.totalExpectedCost", lang)}><Input name="expectedAmount" inputMode="decimal" /></Field>
            <Field label={t("visits.notes", lang)}><Input name="notes" /></Field>
          </div>
          <Field label={t("purchases.generalDesc", lang)}><Input name="description" /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("purchases.sendRequest", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ApproveRequestModal({ requestId }: { requestId: string }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"APPROVED" | "REJECTED" | "NEEDS_CHANGES">("APPROVED");
  const [reason, setReason] = useState("");

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>{t("purchases.review", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("purchases.reviewTitle", lang)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null);
          const result = await approvePurchaseRequestAction({ requestId, action, reason: reason || null });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          closeModal();
          router.refresh();
        }}>
          <ModalFormStatus error={error} success={null} />
          <Field label={t("purchases.decision", lang)}>
            <div className="grid grid-cols-3 gap-2">
              {([["APPROVED", t("purchases.approve", lang)], ["REJECTED", t("purchases.reject", lang)], ["NEEDS_CHANGES", t("purchases.changes", lang)]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setAction(val)} className={`h-9 rounded-lg border text-xs font-medium ${action === val ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{label}</button>
              ))}
            </div>
          </Field>
          {action !== "APPROVED" && <Field label={t("purchases.reason", lang)}><Input value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>}
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("purchases.execute", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function PurchaseCreateModal({ suppliers, products }: { suppliers: { id: string; name: string }[]; products: ProductPick[] }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [rows, setRows] = useState([{ productId: "", description: "", qtyReceived: "", unitCost: "", batchNo: "", expiryDate: "", expenseOnly: false }]);

  return (
    <>
      <Button size="sm" onClick={openModal}>{t("purchases.plusInvoice", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("purchases.receive", lang)} subtitle={t("purchases.invoiceSub", lang)}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          if (!String(form.get("invoiceNo")).trim()) { setError(t("purchases.invoiceNoRequired", lang)); setLoading(false); return; }
          const result = await createPurchaseAction({
            supplierId: String(form.get("supplierId") ?? "") || null,
            invoiceNo: String(form.get("invoiceNo")),
            totalAmount: Number(form.get("totalAmount") ?? 0),
            method: (String(form.get("method") ?? "") || null) as "CASH" | "CLIQ" | "VISA" | null,
            date: String(form.get("date") ?? "") || null,
            notes: String(form.get("notes") ?? "") || null,
            items: rows.filter((r) => r.description.trim() && Number(r.qtyReceived) > 0).map((r) => ({
              productId: r.productId || null,
              description: r.description.trim(),
              isExpenseOnly: r.expenseOnly,
              qtyReceived: Number(r.qtyReceived),
              unit: null,
              unitCost: Number(r.unitCost ?? 0),
              batchNo: r.batchNo || null,
              expiryDate: r.expiryDate || null,
            })),
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("purchases.receivedStock", lang));
          setTimeout(() => { closeModal(); router.refresh(); }, 700);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("purchases.invoiceNo", lang)}><Input name="invoiceNo" required dir="ltr" /></Field>
            <Field label={t("purchases.supplier", lang)}>
              <Select name="supplierId">
                <option value="">{t("purchases.withoutSupplierPh", lang)}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t("purchases.totalJOD", lang)}><Input name="totalAmount" inputMode="decimal" required /></Field>
            <Field label={t("purchases.paymentMethod", lang)}>
              <Select name="method">
                <option value="">{t("purchases.notPaid", lang)}</option>
                <option value="CASH">{t("pay.cash", lang)}</option>
                <option value="CLIQ">{t("pay.cliq", lang)}</option>
                <option value="VISA">{t("pay.visa", lang)}</option>
              </Select>
            </Field>
            <Field label={t("purchases.date", lang)}><Input name="date" type="date" /></Field>
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                <Select value={row.productId} className="col-span-2" onChange={(e) => {
                  const p = products.find((x) => x.id === e.target.value);
                  setRows(rows.map((r, j) => j === i ? { ...r, productId: e.target.value, description: p?.name ?? r.description } : r));
                }}>
                  <option value="">{t("purchases.productPh", lang)}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input value={row.description} placeholder={t("purchases.lineDesc", lang)} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
                <Input value={row.qtyReceived} placeholder={t("purchases.qtyReceived", lang)} inputMode="decimal" onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, qtyReceived: e.target.value } : r))} />
                <Input value={row.unitCost} placeholder={t("purchases.unitCostPh", lang)} inputMode="decimal" onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, unitCost: e.target.value } : r))} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</Button>
                <Field label={t("purchases.batchOptional", lang)}><Input value={row.batchNo} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, batchNo: e.target.value } : r))} /></Field>
                <Field label={t("purchases.expiryOptional", lang)}><Input type="date" value={row.expiryDate} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, expiryDate: e.target.value } : r))} /></Field>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={row.expenseOnly} onChange={(e) => setRows(rows.map((r, j) => j === i ? { ...r, expenseOnly: e.target.checked } : r))} /> {t("purchases.expenseOnlyLabel", lang)}</label>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { productId: "", description: "", qtyReceived: "", unitCost: "", batchNo: "", expiryDate: "", expenseOnly: false }])}>{t("purchases.addRow", lang)}</Button>
          </div>
          <Field label={t("visits.notes", lang)}><Input name="notes" /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("purchases.saveInvoice", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function VoidPurchaseButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{t("purchases.voidPurchase", lang)}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const result = await voidPurchaseAction({ purchaseId, reason });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{t("purchases.voidTitle", lang)}</h3>
            <p className="text-xs text-ink-500">{t("purchases.voidWarning", lang)}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={t("purchases.voidReasonPh", lang)} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.cancel", lang)}</Button>
              <Button type="submit" variant="danger" size="sm" loading={loading}>{t("closing.confirm", lang)}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}