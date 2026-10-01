"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createVisitAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export function NewVisitButton({ customerId, customerName }: { customerId: string; customerName: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([]);
  const [doctorsLoaded, setDoctorsLoaded] = useState(false);

  async function loadDoctors() {
    if (doctorsLoaded) return;
    try {
      const res = await fetch("/api/lookup/doctors", { cache: "no-store" });
      const data = await res.json();
      setDoctors(data.doctors ?? []);
      setDoctorsLoaded(true);
    } catch {
      setDoctors([]);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await createVisitAction({
      customerId,
      doctorId: String(form.get("doctorId") ?? "") || null,
      scheduledAt: String(form.get("scheduledAt") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/visits/${result.data!.id}`);
    router.refresh();
  }

  return (
    <>
      <Button onClick={() => { setOpen(true); loadDoctors(); }}>{t("visits.newVisit", lang)}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">{t("visits.newVisit", lang)} — {customerName}</h2>
            <form onSubmit={submit} className="space-y-4 mt-4">
              <FormError message={error} />
              <Field label={t("patients.doctor", lang)}>
                <Select name="doctorId">
                  <option value="">{t("visits.selectDoctorPh", lang)}</option>
                  {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label={t("visits.appointmentDate", lang)}>
                <Input name="scheduledAt" type="datetime-local" />
              </Field>
              <Field label={t("visits.notes", lang)}>
                <Input name="notes" />
              </Field>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t("common.cancel", lang)}</Button>
                <Button type="submit" loading={loading}>{t("visits.openVisit", lang)}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
