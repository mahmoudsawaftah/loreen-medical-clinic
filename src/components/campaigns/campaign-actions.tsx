"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendCampaignAction, scheduleCampaignAction, cancelCampaignAction, retryCampaignAction, sendTestMessageAction } from "@/server/actions/v3-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { uiText } from "@/lib/i18n/entities";

export function CampaignActions({ campaignId, status, recipientCount, failedCount }: { campaignId: string; status: string; recipientCount: number; failedCount: number }) {
  const { lang } = useLang();
  const router = useRouter();
  const [sendOpen, setSendOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, close: () => void) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await fn();
    setLoading(false);
    if (!result.ok) { setError(result.error ?? uiText(lang, "حدث خطأ", "Something went wrong")); return; }
    setSuccess(uiText(lang, "تمت العملية بنجاح", "Operation completed"));
    setTimeout(() => { close(); setSuccess(null); router.refresh(); }, 500);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {["DRAFT", "SCHEDULED"].includes(status) && (
          <>
            <Button size="sm" onClick={() => setSendOpen(true)}>{uiText(lang, "إرسال الآن", "Send now")}</Button>
            <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>{uiText(lang, "جدولة", "Schedule")}</Button>
            <Button size="sm" variant="outline" onClick={() => setTestOpen(true)}>{uiText(lang, "إرسال تجريبي", "Send test")}</Button>
            <Button size="sm" variant="danger" onClick={() => {
              if (window.confirm(uiText(lang, "إلغاء الحملة؟ لا يمكن التراجع.", "Cancel campaign? This cannot be undone."))) run(() => cancelCampaignAction({ campaignId }), () => undefined);
            }}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          </>
        )}
        {["COMPLETED", "PARTIAL_FAILURE"].includes(status) && failedCount > 0 && (
          <Button size="sm" variant="outline" onClick={() => {
            if (window.confirm(uiText(lang, `إعادة إرسال الرسائل الفاشلة فقط (${failedCount} عميلة)؟ المستلمون الناجحون لن يتأثروا.`, `Retry only failed messages (${failedCount} recipients)? Successful recipients are not affected.`))) run(() => retryCampaignAction({ campaignId }), () => undefined);
          }}>{uiText(lang, "إعادة إرسال للفاشلين", "Retry failed") } ({failedCount})</Button>
        )}
      </div>

      {sendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold">{uiText(lang, "تأكيد الإرسال", "Confirm send")}</h3>
            <p className="text-sm text-ink-600">{uiText(lang, "سيتم إرسال الرسالة إلى", "The message will be sent to")} <b className="tabular-nums">{recipientCount}</b> {uiText(lang, "عميلة.", "recipients.")}</p>
            <FormError message={error} />
            <FormSuccess message={success} />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSendOpen(false)}>{uiText(lang, "تراجع", "Back")}</Button>
              <Button type="button" size="sm" loading={loading} onClick={() => run(() => sendCampaignAction({ campaignId }), () => setSendOpen(false))}>{uiText(lang, "إرسال", "Send")}</Button>
            </div>
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setScheduleOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const at = String(f.get("scheduledFor") ?? "");
            if (!at) { setError(uiText(lang, "حدد وقت الإرسال", "Choose a send time")); return; }
            run(() => scheduleCampaignAction({ campaignId, scheduledFor: at }), () => setScheduleOpen(false));
          }}>
            <h3 className="font-bold">{uiText(lang, "جدولة الإرسال", "Schedule send")}</h3>
            <FormError message={error} />
            <FormSuccess message={success} />
            <Field label={uiText(lang, "وقت الإرسال", "Send time")}><Input type="datetime-local" name="scheduledFor" required /></Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setScheduleOpen(false)}>{uiText(lang, "إغلاق", "Close")}</Button>
              <Button type="submit" size="sm" loading={loading}>{uiText(lang, "جدولة", "Schedule")}</Button>
            </div>
          </form>
        </div>
      )}

      {testOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setTestOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => sendTestMessageAction({ campaignId, testPhone: String(f.get("testPhone") ?? "") }), () => setTestOpen(false));
          }}>
            <h3 className="font-bold">{uiText(lang, "إرسال رسالة تجريبية", "Send test message")}</h3>
            <p className="text-xs text-ink-500">{uiText(lang, "ستُرسل للرقم المدخل فقط ولن تُعتبر الحملة مُرسلة.", "It will be sent only to the entered number and will not mark the campaign as sent.")}</p>
            <FormError message={error} />
            <FormSuccess message={success} />
            <Field label={uiText(lang, "رقم الجوال", "Mobile number")}><Input name="testPhone" dir="ltr" placeholder="07XXXXXXXX" required /></Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setTestOpen(false)}>{uiText(lang, "إغلاق", "Close")}</Button>
              <Button type="submit" size="sm" loading={loading}>{uiText(lang, "إرسال", "Send")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
