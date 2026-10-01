"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { uiText } from "@/lib/i18n/entities";

export function SettingsForm({ initial }: { initial: Record<string, unknown> }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form className="space-y-5" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true); setError(null); setSuccess(null);
      const form = new FormData(e.currentTarget);
      const patch: Record<string, unknown> = {
        clinicName: String(form.get("clinicName")),
        clinicNameAr: String(form.get("clinicNameAr")),
        clinicPhone: String(form.get("clinicPhone") ?? ""),
        timezone: String(form.get("timezone")),
        currency: String(form.get("currency")),
        sessionTtlMinutes: Number(form.get("sessionTtlMinutes") ?? 720),
        closingMandatory: form.get("closingMandatory") === "on",
        splitPaymentEnabled: form.get("splitPaymentEnabled") === "on",
        partialPaymentEnabled: form.get("partialPaymentEnabled") === "on",
        refundEnabled: form.get("refundEnabled") === "on",
        discountReasonRequired: form.get("discountReasonRequired") === "on",
        inventoryDeductAt: String(form.get("inventoryDeductAt")),
        salaryAllocationMode: String(form.get("salaryAllocationMode")),
        ownerPurchaseAutoApproved: form.get("ownerPurchaseAutoApproved") === "on",
        expensesRequireApproval: form.get("expensesRequireApproval") === "on",
        accountantCanCreateExpenses: form.get("accountantCanCreateExpenses") === "on",
        commissionsEnabled: form.get("commissionsEnabled") === "on",
        allowNegativeStock: form.get("allowNegativeStock") === "on",
        exportFormat: String(form.get("exportFormat")),
        messagingChannel: String(form.get("messagingChannel")),
        beforeAfterPhotosEnabled: form.get("beforeAfterPhotosEnabled") === "on",
        appointmentsEnabled: form.get("appointmentsEnabled") === "on",
      };
      const result = await updateSettingsAction(patch);
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      setSuccess(uiText(lang, "تم حفظ الإعدادات", "Settings saved"));
      router.refresh();
    }}>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{success}</p>}
      <Field label={uiText(lang, "اسم العيادة (إنجليزي)", "Clinic name (English)")}><Input name="clinicName" defaultValue={String(initial.clinicName ?? "")} dir="ltr" /></Field>
      <Field label={uiText(lang, "اسم العيادة (عربي)", "Clinic name (Arabic)")}><Input name="clinicNameAr" defaultValue={String(initial.clinicNameAr ?? "")} /></Field>
      <Field label={uiText(lang, "هاتف العيادة", "Clinic phone")}><Input name="clinicPhone" defaultValue={String(initial.clinicPhone ?? "")} dir="ltr" /></Field>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={uiText(lang, "المنطقة الزمنية", "Time zone")}>
          <Select name="timezone" defaultValue={String(initial.timezone ?? "Asia/Amman")}>
            <option value="Asia/Amman">{uiText(lang, "عمان (UTC+3)", "Amman (UTC+3)")}</option>
            <option value="UTC">UTC</option>
          </Select>
        </Field>
        <Field label={uiText(lang, "العملة", "Currency")}>
          <Select name="currency" defaultValue={String(initial.currency ?? "JOD")}>
            <option value="JOD">{uiText(lang, "دينار أردني", "Jordanian dinar")}</option>
            <option value="SAR">{uiText(lang, "ريال سعودي", "Saudi riyal")}</option>
            <option value="AED">{uiText(lang, "درهم إماراتي", "UAE dirham")}</option>
            <option value="USD">{uiText(lang, "دولار", "US dollar")}</option>
          </Select>
        </Field>
        <Field label={uiText(lang, "مدة الجلسة (دقيقة)", "Session duration (minutes)")}>
          <Input name="sessionTtlMinutes" type="number" defaultValue={String(initial.sessionTtlMinutes ?? 720)} />
        </Field>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-2">{uiText(lang, "السياسات المالية", "Financial policies")}</h3>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          <Toggle label={uiText(lang, "إلزامية إغلاق اليوم قبل بدء يوم جديد", "Require closing before a new day starts")} name="closingMandatory" initial={!!initial.closingMandatory} />
          <Toggle label={uiText(lang, "الدفع المختلط (أكثر من طريقة للفاتورة الواحدة)", "Split payments (multiple methods per invoice)")} name="splitPaymentEnabled" initial={!!initial.splitPaymentEnabled} />
          <Toggle label={uiText(lang, "الدفع الجزئي", "Partial payments")} name="partialPaymentEnabled" initial={!!initial.partialPaymentEnabled} />
          <Toggle label={uiText(lang, "الاسترداد / إلغاء المدفوعات", "Refunds / void payments")} name="refundEnabled" initial={!!initial.refundEnabled} />
          <Toggle label={uiText(lang, "إلزامية سبب الخصم", "Require a discount reason")} name="discountReasonRequired" initial={!!initial.discountReasonRequired} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={uiText(lang, "نقطة خصم المخزون", "Inventory deduction point")} hint={uiText(lang, "متى تُخصم المواد المستخدمة من الرصيد", "When used materials are deducted from stock")}>
          <Select name="inventoryDeductAt" defaultValue={String(initial.inventoryDeductAt ?? "TREATMENT_COMPLETED")}>
            <option value="TREATMENT_COMPLETED">{uiText(lang, "عند إرسال الجلسة للاستقبال", "When treatment is sent to reception")}</option>
            <option value="READY_FOR_PAYMENT">{uiText(lang, "عند وصولها لمرحلة الدفع", "When it reaches payment")}</option>
            <option value="PAYMENT">{uiText(lang, "عند اكتمال الدفع", "When payment is completed")}</option>
          </Select>
        </Field>
        <Field label={uiText(lang, "توزيع الرواتب اليومي", "Daily payroll allocation")}>
          <Select name="salaryAllocationMode" defaultValue={String(initial.salaryAllocationMode ?? "CALENDAR_DAYS")}>
            <option value="CALENDAR_DAYS">{uiText(lang, "أيام تقويمية", "Calendar days")}</option>
            <option value="WORKING_DAYS">{uiText(lang, "أيام عمل", "Working days")}</option>
          </Select>
        </Field>
      </div>

      <h3 className="font-semibold text-sm">{uiText(lang, "سياسات التشغيل", "Operational policies")}</h3>
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        <Toggle label={uiText(lang, "اعتماد تلقائي لطلبات الشراء الطبية من المالك", "Auto-approve medical purchase requests by owner")} name="ownerPurchaseAutoApproved" initial={!!initial.ownerPurchaseAutoApproved} />
        <Toggle label={uiText(lang, "إلزامية اعتماد المصروفات قبل دخولها التقارير", "Require expense approval before reporting")} name="expensesRequireApproval" initial={!!initial.expensesRequireApproval} />
        <Toggle label={uiText(lang, "تسمح للمحاسب بإدخال مصروفات", "Allow accountant to enter expenses")} name="accountantCanCreateExpenses" initial={!!initial.accountantCanCreateExpenses} />
        <Toggle label={uiText(lang, "العمولات (ممكّنة لاحقًا)", "Commissions (coming later)")} name="commissionsEnabled" initial={!!initial.commissionsEnabled} />
        <Toggle label={uiText(lang, "السماح بالمخزون السالب", "Allow negative stock")} name="allowNegativeStock" initial={!!initial.allowNegativeStock} />
        <Toggle label={uiText(lang, "صور قبل/بعد (ممكّنة لاحقًا)", "Before/after photos (coming later)")} name="beforeAfterPhotosEnabled" initial={!!initial.beforeAfterPhotosEnabled} />
        <Toggle label={uiText(lang, "المواعيد المسبقة (ممكّنة لاحقًا)", "Advance appointments (coming later)")} name="appointmentsEnabled" initial={!!initial.appointmentsEnabled} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={uiText(lang, "تنسيق التصدير", "Export format")}>
          <Select name="exportFormat" defaultValue={String(initial.exportFormat ?? "csv")}>
            <option value="csv">CSV</option>
            <option value="excel">Excel ({uiText(lang, "لاحقًا", "coming later")})</option>
            <option value="pdf">PDF ({uiText(lang, "لاحقًا", "coming later")})</option>
          </Select>
        </Field>
        <Field label={uiText(lang, "قناة المراسلة الافتراضية", "Default messaging channel")}>
          <Select name="messagingChannel" defaultValue={String(initial.messagingChannel ?? "mock")}>
            <option value="mock">{uiText(lang, "تجريبي (سجل فقط)", "Demo (log only)")}</option>
            <option value="whatsapp">{uiText(lang, "واتساب (تحتاج بيانات خارجية)", "WhatsApp (external credentials required)")}</option>
            <option value="sms">{uiText(lang, "رسائل نصية (تحتاج بيانات خارجية)", "SMS (external credentials required)")}</option>
          </Select>
        </Field>
      </div>

      <Button type="submit" loading={loading}>{uiText(lang, "حفظ الإعدادات", "Save settings")}</Button>
    </form>
  );
}

function Toggle({ label, name, initial }: { label: string; name: string; initial: boolean }) {
  return (
    <label className="flex items-center gap-2.5 rounded-lg border border-ink-200 px-3 py-2.5 cursor-pointer hover:bg-ink-50/50">
      <input type="checkbox" name={name} defaultChecked={initial} className="accent-[#a9823e] w-4 h-4" />
      <span>{label}</span>
    </label>
  );
}
