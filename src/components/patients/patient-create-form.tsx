"use client";

import { useState } from "react";
import { createPatientAction } from "@/server/actions/operations-actions";
import { useActionForm } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export function PatientCreateForm() {
  const [open, setOpen] = useState(false);
  const { lang } = useLang();
  const { run, pending, error, success, formRef } = useActionForm();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" d="M12 4v16m8-8H4" />
        </svg>
        {t("patients.new", lang)}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-bold">{t("patients.addTitle", lang)}</h2>
          <button onClick={() => setOpen(false)} className="text-ink-400 hover:text-ink-700" aria-label={t("common.close", lang)}>✕</button>
        </div>
        <form ref={formRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4" onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(() => createPatientAction({
            fullName: String(form.get("fullName") ?? ""),
            phone: String(form.get("phone") ?? ""),
            phone2: String(form.get("phone2") ?? "") || null,
            email: String(form.get("email") ?? "") || null,
            birthDate: String(form.get("birthDate") ?? "") || null,
            source: String(form.get("source") ?? "") || null,
            marketingConsent: form.get("marketingConsent") === "on",
            notes: String(form.get("notes") ?? "") || null,
          }), () => setOpen(false));
        }}>
          <div className="sm:col-span-2"><FormError message={error} /></div>
          <div className="sm:col-span-2"><FormSuccess message={success} /></div>
          <Field label={t("patients.fullName", lang)} className="sm:col-span-2">
            <Input name="fullName" required />
          </Field>
          <Field label={t("patients.phone", lang)} hint={t("patients.phoneHint", lang)}>
            <Input name="phone" dir="ltr" required inputMode="tel" />
          </Field>
          <Field label={t("patients.phone2", lang)}>
            <Input name="phone2" dir="ltr" inputMode="tel" />
          </Field>
          <Field label={t("patients.emailOptional", lang)}>
            <Input name="email" type="email" dir="ltr" />
          </Field>
          <Field label={t("patients.birthdate", lang)}>
            <Input name="birthDate" type="date" />
          </Field>
          <Field label={t("patients.source", lang)}>
            <Select name="source">
              <option value="">—</option>
              <option value="Instagram">Instagram</option>
              <option value="Referral">{t("patients.referral", lang)}</option>
              <option value="Walk-in">Walk-in</option>
              <option value="Facebook">Facebook</option>
              <option value="WhatsApp">WhatsApp</option>
            </Select>
          </Field>
          <Field label={t("patients.notes", lang)}>
            <Input name="notes" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-700 sm:col-span-2">
            <input name="marketingConsent" type="checkbox" className="h-4 w-4 rounded border-ink-300" />
            {t("patients.marketingConsentFull", lang)}
          </label>
          <div className="sm:col-span-2 flex gap-2 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel", lang)}</Button>
            <Button type="submit" loading={pending}>{t("patients.save", lang)}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}