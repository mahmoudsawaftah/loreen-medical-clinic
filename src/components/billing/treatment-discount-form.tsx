"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applyTreatmentDiscountAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function TreatmentDiscountForm({ visitId, basePrice, hasDiscount, reasonRequired }: { visitId: string; basePrice: number; hasDiscount: boolean; reasonRequired: boolean }) {
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
    const result = await applyTreatmentDiscountAction({
      visitId,
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
    return <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t("billing.discountExistsTreatment")}</p>;
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
      {reasonRequired ? (
        <Field label={t("billing.reasonRequired")}><Input name="reason" /></Field>
      ) : (
        <Field label={t("billing.reasonOptional")}><Input name="reason" /></Field>
      )}
      <Button type="submit" className="w-full" loading={loading} disabled={Number(value) <= 0}>{t("billing.approveDiscount")}</Button>
      <p className="text-[11px] text-ink-400">{t("billing.discountOnPrice").replace("{price}", basePrice.toFixed(3))}</p>
    </form>
  );
}