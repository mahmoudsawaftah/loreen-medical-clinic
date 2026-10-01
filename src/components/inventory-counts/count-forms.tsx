"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createInventoryCountAction,
  startInventoryCountAction,
  submitInventoryCountAction,
  reviewInventoryCountAction,
  postInventoryCountAction,
  updateCountedQtyAction,
} from "@/server/actions/v2-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

const STATUS_LABELS = { DRAFT: "counts.st.draft", IN_PROGRESS: "counts.st.inProgress", SUBMITTED: "counts.st.submitted", REVIEWED: "counts.st.reviewed", POSTED: "counts.st.posted" } as const;

export function CreateCountForm({ categories }: { categories: { category: string }[] }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true); setError(null); setSuccess(null);
      const result = await createInventoryCountAction({ countDate: new Date(), notes: null, category: category || null });
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      if (!result.data) { setError(t("counts.createFailed", lang)); return; }
      setSuccess(t("counts.created", lang));
      router.push(`/inventory-counts?count=${result.data.id}`);
      router.refresh();
    }}>
      <FormError message={error} />
      <FormSuccess message={success} />
      <Field label={t("counts.categoryOptional", lang)}>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("counts.allCategories", lang)}</option>
          {categories.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
        </Select>
      </Field>
      <Button type="submit" loading={loading}>{t("counts.createNew", lang)}</Button>
    </form>
  );
}

export function CountStatusBadge({ status }: { status: string }) {
  const { lang } = useLang();
  const tone = status === "POSTED" ? "success" : status === "REVIEWED" || status === "SUBMITTED" ? "warning" : status === "IN_PROGRESS" ? "info" : "neutral";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap border ${
      tone === "success" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : tone === "warning" ? "bg-amber-50 text-amber-700 border-amber-200"
          : tone === "info" ? "bg-sky-50 text-sky-700 border-sky-200"
            : "bg-ink-100 text-ink-700 border-ink-200"
    }`}>{t(STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? "counts.st.draft", lang)}</span>
  );
}

export function CountWorkflowButtons({ countId, status }: { countId: string; status: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setLoading(true); setError(null);
    const result = await fn();
    setLoading(false);
    if (!result.ok) { setError(result.error ?? t("counts.errorGeneric", lang)); return; }
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      {status === "DRAFT" && (
        <Button size="sm" loading={loading} onClick={() => run(() => startInventoryCountAction(countId))}>{t("counts.start", lang)}</Button>
      )}
      {status === "IN_PROGRESS" && (
        <Button size="sm" variant="success" loading={loading} onClick={() => run(() => submitInventoryCountAction(countId))}>{t("counts.submitReview", lang)}</Button>
      )}
      {status === "SUBMITTED" && (
        <Button size="sm" variant="success" loading={loading} onClick={() => run(() => reviewInventoryCountAction(countId))}>{t("counts.reviewApprove", lang)}</Button>
      )}
      {status === "REVIEWED" && (
        <Button size="sm" variant="danger" loading={loading} onClick={() => run(() => postInventoryCountAction(countId))}>{t("counts.postDiffs", lang)}</Button>
      )}
      {status === "POSTED" && <span className="text-xs text-emerald-700 font-medium">{t("counts.postedNote", lang)}</span>}
    </div>
  );
}

export function CountLineQty({ countId, lineId, initial, disabled }: { countId: string; lineId: string; initial: number; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial));
  const [saving, setSaving] = useState(false);

  return (
    <Input
      inputMode="decimal"
      value={value}
      disabled={disabled || saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        const n = Number(value);
        if (Number.isNaN(n) || n < 0) return;
        setSaving(true);
        const result = await updateCountedQtyAction({ countId, lineId, countedQty: n });
        setSaving(false);
        if (result.ok) router.refresh();
      }}
    />
  );
}