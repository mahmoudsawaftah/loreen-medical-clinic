"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVisitAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError } from "@/components/ui/form";
import { Modal } from "@/components/modals";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";
import { localizedName } from "@/lib/i18n/entities";

export interface TodayLookup {
  doctors: { id: string; name: string; englishName: string | null }[];
  customers: { id: string; fullName: string; phone: string | null }[];
}

export function NewVisitModal({ doctors, customers }: TodayLookup) {
  const router = useRouter();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filtered = customers.filter((c) => c.fullName.includes(search) || (c.phone ?? "").includes(search));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>+ {t("today.newVisit")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("visits.newVisit")} subtitle={t("today.newVisitSubtitle")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          if (!customerId) { setError(t("today.selectCustomer")); return; }
          setLoading(true); setError(null);
          const f = new FormData(e.currentTarget);
          const result = await createVisitAction({
            customerId,
            doctorId: String(f.get("doctorId") ?? "") || null,
            scheduledAt: String(f.get("scheduledAt") ?? "") || null,
            notes: String(f.get("notes") ?? "") || null,
          });
          setLoading(false);
          if (!result.ok || !result.data) { setError(t("today.createFailed")); return; }
          setOpen(false);
          router.push(`/visits/${result.data.id}`);
          router.refresh();
        }}>
          <FormError message={error} />
          <Field label={t("today.searchCustomer")}>
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setCustomerId(""); }} placeholder={t("common.searchPlaceholder")} />
          </Field>
          <div className="max-h-44 overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-50">
            {filtered.slice(0, 60).map((c) => (
              <label key={c.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${customerId === c.id ? "bg-primary-50" : "hover:bg-ink-50"}`}>
                <input type="radio" name="customer" checked={customerId === c.id} onChange={() => setCustomerId(c.id)} />
                <span className="truncate">{c.fullName}</span>
                <span className="text-[11px] text-ink-400 mr-auto" dir="ltr">{c.phone ?? t("today.noPhone")}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-ink-400">{t("today.noResults")}</p>}
          </div>
          <Field label={t("visits.doctor")}>
            <Select name="doctorId">
              <option value="">{t("today.notAssigned")}</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{localizedName(d.name, d.englishName, lang)}</option>)}
            </Select>
          </Field>
          <Field label={t("visits.appointmentDate")}>
            <Input name="scheduledAt" type="datetime-local" />
          </Field>
          <Field label={t("common.notes")}><Input name="notes" /></Field>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" size="sm" loading={loading}>{t("today.openVisit")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
