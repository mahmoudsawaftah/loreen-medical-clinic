"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collectPaymentAction, applyDiscountAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function CollectPaymentForm({ invoiceId, remaining, partialEnabled }: { invoiceId: string; finalAmount: number; remaining: number; splitEnabled: boolean; partialEnabled: boolean }) {
  const router = useRouter();
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [amount, setAmount] = useState(String(remaining));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await collectPaymentAction({
      invoiceId,
      method: method as "CASH" | "CLIQ" | "VISA",
      amount: Number(amount),
      reference: String(form.get("reference") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
    });
    setLoading(false);
    if (!result.ok) { setError(translateServerError(result.error, t)); return; }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormError message={error} />
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
      <Field label={t("billing.amountLabel").replace("{remaining}", String(remaining))} hint={partialEnabled ? t("billing.partialHint") : t("billing.partialDisabledHint")}>
        <Input value={amount} inputMode="decimal" required onChange={(e) => setAmount(e.target.value)} />
      </Field>
      {method !== "CASH" && <Field label={t("billing.referenceOptional")}><Input name="reference" dir="ltr" /></Field>}
      <Field label={t("common.notes")}><Input name="notes" /></Field>
      <Button type="submit" className="w-full" loading={loading} disabled={Number(amount) > remaining}>{t("billing.confirmCollect")}</Button>
    </form>
  );
}

export function DiscountForm({ invoiceId, hasDiscount, reasonRequired }: { invoiceId: string; originalAmount: number; hasDiscount: boolean; reasonRequired: boolean }) {
  const router = useRouter();
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"amount" | "percent">("amount");
  const [value, setValue] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await applyDiscountAction({
      invoiceId,
      data: {
        amount: mode === "amount" ? Number(value) : null,
        percent: mode === "percent" ? Number(value) : null,
        reason: String(form.get("reason") ?? "") || null,
      },
    });
    setLoading(false);
    if (!result.ok) { setError(translateServerError(result.error, t)); return; }
    router.refresh();
  }

  if (hasDiscount) {
    return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("billing.discountExists")}</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setMode("amount")} className={`h-9 rounded-lg border text-xs font-medium ${mode === "amount" ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{t("billing.amountMode")}</button>
        <button type="button" onClick={() => setMode("percent")} className={`h-9 rounded-lg border text-xs font-medium ${mode === "percent" ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{t("billing.percentMode")}</button>
      </div>
      <Field label={mode === "amount" ? t("billing.discountAmountLabel") : t("billing.discountPercentLabel")}>
        <Input value={value} inputMode="decimal" required onChange={(e) => setValue(e.target.value)} />
      </Field>
      {reasonRequired && <Field label={t("billing.reasonRequired")}><Input name="reason" /></Field>}
      {!reasonRequired && <Field label={t("billing.reasonOptional")}><Input name="reason" /></Field>}
      <Button type="submit" className="w-full" loading={loading}>{t("billing.approveDiscount")}</Button>
      <p className="text-[11px] text-ink-400">{t("billing.discountPermissionNote")}</p>
    </form>
  );
}

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{t("billing.voidInvoice")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              setError(null);
              const res = await (await import("@/server/actions/operations-actions")).voidInvoiceAction({ invoiceId, reason });
              setLoading(false);
              if (!res.ok) { setError(translateServerError(res.error, t)); return; }
              setOpen(false);
              router.refresh();
            }}
          >
            <h3 className="font-bold">{t("billing.voidInvoice")}</h3>
            <p className="text-xs text-ink-500">{t("billing.voidWarning")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={t("billing.voidReasonPh")} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.dismiss")}</Button>
              <Button type="submit" variant="danger" size="sm" loading={loading}>{t("billing.confirmVoid")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}