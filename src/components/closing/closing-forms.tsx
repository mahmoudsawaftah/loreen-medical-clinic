"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeDayAction, reopenDayAction, approveDayAction, returnDayForReviewAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";
import { statusLabels, closingTone } from "@/lib/i18n/status";

export function SubmitClosingForm({ dateKey, totals }: { dateKey: string; totals: { cash: number; cliq: number; visa: number } }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actualCash, setActualCash] = useState(String(totals.cash));
  const [actualCliq, setActualCliq] = useState(String(totals.cliq));
  const [actualVisa, setActualVisa] = useState(String(totals.visa));
  const [notes, setNotes] = useState("");
  const [varianceExplanation, setVarianceExplanation] = useState("");

  const diff = (exp: number, act: number) => Math.round((act - exp) * 1000) / 1000;
  const hasVariance = diff(totals.cash, Number(actualCash) || 0) !== 0 || diff(totals.cliq, Number(actualCliq) || 0) !== 0 || diff(totals.visa, Number(actualVisa) || 0) !== 0;
  const diffCash = diff(totals.cash, Number(actualCash) || 0);
  const diffCliq = diff(totals.cliq, Number(actualCliq) || 0);
  const diffVisa = diff(totals.visa, Number(actualVisa) || 0);

  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true); setError(null); setSuccess(null);
      const result = await closeDayAction({ date: dateKey, data: { actualCash: Number(actualCash), actualCliq: Number(actualCliq), actualVisa: Number(actualVisa), notes: notes || null, varianceExplanation: varianceExplanation || null } });
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      setSuccess(t("closing.submitSuccess", lang));
      router.refresh();
    }}>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{success}</p>}
      <div className="rounded-xl overflow-hidden border border-ink-200">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 bg-ink-50 px-3 py-2 text-[11px] font-semibold text-ink-500">
          <span>{t("closing.methodCol", lang)}</span>
          <span>{t("closing.expectedCol", lang)}</span>
          <span>{t("closing.actualCol", lang)}</span>
          <span>{t("closing.diffCol", lang)}</span>
        </div>
        {[
          { label: t("closing.cash", lang), expected: totals.cash, actual: actualCash, set: setActualCash },
          { label: "CliQ", expected: totals.cliq, actual: actualCliq, set: setActualCliq },
          { label: t("closing.visa", lang), expected: totals.visa, actual: actualVisa, set: setActualVisa },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 items-center px-3 py-2 border-t border-ink-100 text-sm">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums text-ink-500">{row.expected}</span>
            <input inputMode="decimal" className="w-full rounded-lg border border-ink-300 px-2 py-1.5 text-sm tabular-nums focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none" value={row.actual} onChange={(e) => row.set(e.target.value)} />
            <span className={"font-bold tabular-nums " + (diff(row.expected, Number(row.actual) || 0) !== 0 ? "text-amber-700" : "text-emerald-700")}>{diff(row.expected, Number(row.actual) || 0)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-3 py-2 border-t border-ink-200 bg-ink-50/60 text-sm font-bold">
          <span>{t("closing.totalCol", lang)}</span>
          <span className="tabular-nums">{totals.cash + totals.cliq + totals.visa}</span>
          <span className="tabular-nums">{(Number(actualCash) || 0) + (Number(actualCliq) || 0) + (Number(actualVisa) || 0)}</span>
          <span className={"tabular-nums " + (diffCash + diffCliq + diffVisa !== 0 ? "text-amber-700" : "text-emerald-700")}>
            {diffCash + diffCliq + diffVisa}
          </span>
        </div>
      </div>
      {hasVariance && (
        <Field label={t("closing.varianceExplanation", lang)} hint={t("closing.varianceHint", lang).replace("{c}", String(diffCash)).replace("{q}", String(diffCliq)).replace("{v}", String(diffVisa))}>
          <Input value={varianceExplanation} onChange={(e) => setVarianceExplanation(e.target.value)} placeholder={t("closing.varianceExample", lang)} />
        </Field>
      )}
      <Field label={t("closing.notes", lang)}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <Button type="submit" loading={loading}>{t("closing.submit", lang)}</Button>
    </form>
  );
}

export function ReviewClosingPanel({ dateKey, closing, expected }: { dateKey: string; expected: { cash: number; cliq: number; visa: number }; closing: {
  actualCash: number; actualCliq: number; actualVisa: number;
  varianceCash: number; varianceCliq: number; varianceVisa: number;
  totalActual: number; totalExpected: number; totalVariance: number;
  varianceExplanation: string | null; notes: string | null;
  submittedBy?: { name: string } | null;
} }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState<"approve" | "return" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">{t("closing.reviewIntro", lang)}</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="rounded-xl overflow-hidden border border-ink-200">
        <div className="grid grid-cols-4 gap-2 bg-ink-50 px-3 py-2 text-[11px] font-semibold text-ink-500">
          <span>{t("closing.methodCol", lang)}</span>
          <span>{t("closing.expectedCol", lang)}</span>
          <span>{t("closing.actualCol", lang)}</span>
          <span>{t("closing.diffCol", lang)}</span>
        </div>
        {[
          { label: t("closing.cash", lang), exp: expected.cash, act: closing.actualCash, var: closing.varianceCash },
          { label: "CliQ", exp: expected.cliq, act: closing.actualCliq, var: closing.varianceCliq },
          { label: t("closing.visa", lang), exp: expected.visa, act: closing.actualVisa, var: closing.varianceVisa },
        ].map((row) => (
          <div key={row.label} className="grid grid-cols-4 gap-2 items-center px-3 py-2 border-t border-ink-100 text-sm">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums text-ink-500">{row.exp}</span>
            <span className="tabular-nums">{row.act}</span>
            <span className={"font-bold tabular-nums " + (row.var !== 0 ? "text-amber-700" : "text-emerald-700")}>{row.var}</span>
          </div>
        ))}
        <div className="grid grid-cols-4 gap-2 px-3 py-2 border-t border-ink-200 bg-ink-50/60 text-sm font-bold">
          <span>{t("closing.totalCol", lang)}</span>
          <span className="tabular-nums">{closing.totalExpected}</span>
          <span className="tabular-nums">{closing.totalActual}</span>
          <span className={"tabular-nums " + (closing.totalVariance !== 0 ? "text-amber-700" : "text-emerald-700")}>{closing.totalVariance}</span>
        </div>
      </div>
      <div className="rounded-xl bg-ink-50 p-4 text-sm space-y-1.5">
        {closing.varianceExplanation && <p className="text-xs text-ink-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{t("closing.receptionExplanation", lang)}: {closing.varianceExplanation}</p>}
        {closing.notes && <p className="text-xs text-ink-500">{closing.notes}</p>}
        {closing.submittedBy?.name && <p className="text-[11px] text-ink-400">{t("closing.submittedByName", lang)}: {closing.submittedBy.name}</p>}
      </div>

      {returning ? (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading("return"); setError(null);
          const result = await returnDayForReviewAction({ date: dateKey, reason: returnReason });
          setLoading(null);
          if (!result.ok) { setError(result.error); return; }
          setReturning(false);
          router.refresh();
        }}>
          <Field label={t("closing.returnReason", lang)}><Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder={t("closing.returnReasonPh", lang)} /></Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setReturning(false)}>{t("common.cancel", lang)}</Button>
            <Button type="submit" variant="outline" size="sm" loading={loading === "return"}>{t("closing.returnForReview", lang)}</Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>{t("closing.returnForReview", lang)}</Button>
          <Button size="sm" loading={loading === "approve"} onClick={async () => {
            setLoading("approve"); setError(null);
            const result = await approveDayAction({ date: dateKey });
            setLoading(null);
            if (!result.ok) { setError(result.error); return; }
            router.refresh();
          }}>{t("closing.approveDayCheck", lang)}</Button>
        </div>
      )}
    </div>
  );
}

export function ReopenDayButton({ dateKey }: { dateKey: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("closing.reopenDay", lang)}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const result = await reopenDayAction({ date: dateKey, reason });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{t("closing.reopenDay", lang)}</h3>
            <p className="text-xs text-ink-500">{t("closing.reopenWarning", lang)}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={t("closing.reasonRequired", lang)} value={reason} onChange={(e) => setReason(e.target.value)} required />
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

export { statusLabels as closingStatusLabels, closingTone as closingStatusTone };