"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { previewCampaignAction, createCampaignAction } from "@/server/actions/v3-actions";
import { AUDIENCE_LABELS, type AudienceType, type CampaignPreview } from "@/lib/campaigns";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea, FormError } from "@/components/ui/form";
import { Modal, useModal } from "@/components/modals";

export interface WizardOptions {
  doctors: { id: string; name: string }[];
  customers: { id: string; fullName: string; phone: string | null }[];
  clinicName: string;
}

export function CampaignWizard({ doctors, customers, clinicName }: WizardOptions) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audienceType, setAudienceType] = useState<AudienceType>("ALL");
  const [doctorId, setDoctorId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [template, setTemplate] = useState(`مرحبًا {{patient_name}} 🌸\nيسعدنا تقديم عرض خاص لك في عيادة {{clinic_name}}\nخصم 20% على جلسة البوتوكس\nلمزيد من التفاصيل تواصلي معنا`);
  const [preview, setPreview] = useState<CampaignPreview | null>(null);

  const filteredCustomers = customers.filter((c) => c.fullName.includes(customerSearch) || (c.phone ?? "").includes(customerSearch));

  async function runPreview(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const result = await previewCampaignAction({
      name: "معاينة",
      audienceType,
      doctorId: audienceType === "DOCTOR" ? doctorId || null : null,
      customerIds: audienceType === "MANUAL" ? selected : [],
      messageTemplate: template,
    });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    if (!result.data) { setError("تعذرت المعاينة"); return; }
    setPreview(result.data);
  }

  async function createCampaign(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    const name = String((document.getElementById("campaign-name") as HTMLInputElement)?.value ?? "");
    const result = await createCampaignAction({
      name,
      audienceType,
      doctorId: audienceType === "DOCTOR" ? doctorId || null : null,
      customerIds: audienceType === "MANUAL" ? selected : [],
      messageTemplate: template,
    });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    if (!result.data) { setError("تعذر إنشاء الحملة"); return; }
    closeModal();
    router.push(`/campaigns/${result.data.id}`);
    router.refresh();
  }

  return (
    <>
      <Button onClick={openModal}>+ حملة جديدة</Button>
      <Modal open={open} onClose={closeModal} title="حملة رسائل جديدة" subtitle="اختر الجمهور، عاين الأرقام، ثم اكتب الرسالة">
        <div className="space-y-4">
          <FormError message={error} />
          <Field label="اسم الحملة"><Input id="campaign-name" placeholder="مثال: عرض البوتوكس — أغسطس" required /></Field>

          <Field label="الجمهور المستهدف">
            <Select value={audienceType} onChange={(e) => setAudienceType(e.target.value as AudienceType)}>
              {(Object.keys(AUDIENCE_LABELS) as AudienceType[]).map((t) => (
                <option key={t} value={t}>{AUDIENCE_LABELS[t]}</option>
              ))}
            </Select>
          </Field>

          {audienceType === "DOCTOR" && (
            <Field label="الدكتور">
              <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">— اختر الدكتور —</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          )}

          {audienceType === "MANUAL" && (
            <Field label={`اختيار العملاء (${selected.length} مختار)`} hint="ابحث ثم حدد من القائمة">
              <Input placeholder="بحث بالاسم أو الهاتف..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              <div className="mt-2 max-h-40 overflow-y-auto border border-ink-200 rounded-lg divide-y divide-ink-50">
                {filteredCustomers.slice(0, 100).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-ink-50 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(c.id)} onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))} />
                    <span className="truncate">{c.fullName}</span>
                    <span className="text-[11px] text-ink-400 mr-auto" dir="ltr">{c.phone ?? "بدون هاتف"}</span>
                  </label>
                ))}
                {filteredCustomers.length === 0 && <p className="px-3 py-2 text-xs text-ink-400">لا نتائج</p>}
              </div>
            </Field>
          )}

          <Field label="نص الرسالة" hint="المتغيرات: {{patient_name}} {{clinic_name}} {{doctor_name}} {{date}}">
            <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} />
          </Field>

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={runPreview} loading={loading}>معاينة الأرقام</Button>
            <Button type="button" size="sm" onClick={createCampaign} loading={loading}>حفظ المسودة</Button>
          </div>

          {preview && (
            <div className="rounded-xl border border-ink-200 bg-ink-50/50 p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <p>العملاء المطابقون: <b className="tabular-nums">{preview.matched}</b></p>
                <p>بأرقام صالحة: <b className="tabular-nums">{preview.validPhone}</b></p>
                <p>انسحبوا من العروض: <b className="tabular-nums">{preview.optedOut}</b></p>
                <p>سيستلمون الرسالة: <b className="tabular-nums text-primary-700">{preview.final}</b></p>
              </div>
              {preview.sample && <p className="text-xs text-ink-500">نموذج: {preview.sample} — {clinicName}</p>}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
