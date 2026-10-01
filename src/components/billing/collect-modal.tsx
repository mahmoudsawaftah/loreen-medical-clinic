"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustInvoiceAmountAction, collectPaymentAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormSuccess } from "@/components/ui/form";
import { ButtonProps } from "@/components/ui/button";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function CollectPaymentModal({ invoiceId, finalAmount, remaining, splitEnabled: _splitEnabled, partialEnabled, canEditAmount, trigger }: { invoiceId: string; finalAmount: number; remaining: number; splitEnabled: boolean; partialEnabled: boolean; canEditAmount: boolean; trigger: React.ReactElement<ButtonProps> }) {
  const router = useRouter();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"CASH" | "CLIQ" | "VISA">("CASH");
  const [amount, setAmount] = useState(String(remaining));
  const [currentFinalAmount, setCurrentFinalAmount] = useState(finalAmount);
  const [currentRemaining, setCurrentRemaining] = useState(remaining);
  const [editingPrice, setEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState(String(finalAmount));
  const [priceReason, setPriceReason] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await collectPaymentAction({ invoiceId, method, amount: Number(amount), reference: reference || null, notes: notes || null });
    setLoading(false);
    if (!result.ok) { setError(translateServerError(result.error, t)); return; }
    setSuccess(t("billing.collectSuccess"));
    setAmount(String(currentRemaining));
    setTimeout(() => { setOpen(false); setSuccess(null); router.refresh(); }, 700);
  }

  async function changePrice() {
    setPriceLoading(true);
    setError(null);
    const next = Number(newPrice);
    const result = await adjustInvoiceAmountAction({ invoiceId, amount: next, reason: priceReason || null });
    setPriceLoading(false);
    if (!result.ok) { setError(translateServerError(result.error, t)); return; }
    const paid = currentFinalAmount - currentRemaining;
    const nextRemaining = Math.max(0, next - paid);
    setCurrentFinalAmount(next);
    setCurrentRemaining(nextRemaining);
    setAmount(String(nextRemaining));
    setEditingPrice(false);
    setSuccess(t("billing.priceChangedSuccess"));
    router.refresh();
  }

  return (
    <>
      <span onClick={(e) => { e.stopPropagation(); if (!("disabled" in trigger.props && trigger.props.disabled)) { setCurrentFinalAmount(finalAmount); setCurrentRemaining(remaining); setAmount(String(remaining)); setNewPrice(String(finalAmount)); setOpen(true); } }}>{trigger}</span>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form
            className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg text-ink-900">{t("billing.collectTitle")}</h3>
                <p className="mt-1 text-xs text-ink-500">{t("billing.remainingLabel")}: <span className="font-bold text-primary-800">{currentRemaining} د.أ</span></p>
              </div>
              {canEditAmount && (
                <button type="button" className="text-xs font-semibold text-primary-700 hover:underline" onClick={() => { setEditingPrice((value) => !value); setError(null); }}>
                  {editingPrice ? t("billing.cancelPriceEdit") : t("billing.editPrice")}
                </button>
              )}
            </div>
            <FormError message={error} />
            <FormSuccess message={success} />
            {editingPrice && canEditAmount && (
              <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 space-y-2">
                <p className="text-xs text-primary-800">{t("billing.priceChangeHint")}</p>
                <Field label={t("billing.newPrice")}>
                  <Input value={newPrice} inputMode="decimal" required onChange={(e) => setNewPrice(e.target.value)} />
                </Field>
                <Field label={t("billing.priceChangeReason")}>
                  <Input value={priceReason} onChange={(e) => setPriceReason(e.target.value)} />
                </Field>
                <Button type="button" size="sm" loading={priceLoading} onClick={() => void changePrice()}>
                  {t("billing.applyPriceChange")}
                </Button>
              </div>
            )}
            <Field label={t("common.method")}>
              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "CLIQ", "VISA"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={`h-10 rounded-lg border text-sm font-medium transition-colors ${method === m ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 bg-white text-ink-600 hover:bg-ink-50"}`}
                  >
                    {m === "CASH" ? t("pay.cash") : m === "CLIQ" ? t("pay.cliq") : t("pay.visa")}
                  </button>
                ))}
              </div>
            </Field>
            {partialEnabled && (
              <Field label={t("billing.amountLabelSimple")} hint={t("billing.partialHintShort")}>
                <Input value={amount} inputMode="decimal" required onChange={(e) => setAmount(e.target.value)} />
              </Field>
            )}
            {method !== "CASH" && <Field label={t("billing.reference")}><Input value={reference} dir="ltr" onChange={(e) => setReference(e.target.value)} /></Field>}
            <Field label={t("common.notes")}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.close")}</Button>
              <Button type="submit" size="sm" loading={loading} disabled={Number(amount) > currentRemaining || Number(amount) <= 0}>{t("billing.confirmCollect")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
