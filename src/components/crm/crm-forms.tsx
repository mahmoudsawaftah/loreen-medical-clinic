"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createFollowUpAction, completeFollowUpAction, sendCommunicationAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export function FollowUpModal({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>{t("crm.followUpModal", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={`${t("crm.followUpModal", lang)}: ${customerName}`}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          const result = await createFollowUpAction({
            customerId,
            dueDate: String(form.get("dueDate")),
            type: ((String(form.get("type") ?? "") || null) ?? undefined) as "FOLLOW_UP" | "BIRTHDAY" | "REMINDER" | "OTHER" | undefined,
            notes: String(form.get("notes") ?? "") || null,
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("crm.addedFollowUp", lang));
          setTimeout(() => { closeModal(); router.refresh(); }, 600);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("crm.dueDate", lang)}><Input name="dueDate" type="date" required /></Field>
            <Field label={t("crm.type", lang)}>
              <Select name="type">
                <option value="FOLLOW_UP">{t("crm.followUpModal", lang)}</option>
                <option value="BIRTHDAY">{t("crm.birthday", lang)}</option>
                <option value="REMINDER">{t("crm.reminder", lang)}</option>
                <option value="OTHER">{t("crm.other", lang)}</option>
              </Select>
            </Field>
          </div>
          <Field label={t("crm.notesSubject", lang)}><Input name="notes" /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("crm.save", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function CompleteFollowUpModal({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"CONTACTED" | "BOOKED" | "NO_ANSWER" | "CLOSED">("CONTACTED");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("crm.complete", lang)}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const result = await completeFollowUpAction({ taskId, status, notes: notes || null });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{t("crm.completeTitle", lang)}</h3>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              {([["CONTACTED", t("crm.contacted", lang)], ["BOOKED", t("crm.booked", lang)], ["NO_ANSWER", t("crm.noAnswer", lang)], ["CLOSED", t("crm.closed", lang)]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setStatus(val)} className={`h-9 rounded-lg border text-xs font-medium ${status === val ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{label}</button>
              ))}
            </div>
            <Field label={t("crm.notesSubject", lang)}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.close", lang)}</Button>
              <Button type="submit" size="sm" loading={loading}>{t("crm.save", lang)}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function SendMessageModal({ customerId, customerName, phone, channelDefault, taskId, onSent }: { customerId: string; customerName: string; phone: string; channelDefault: string; taskId?: string | null; onSent?: () => void }) {
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<string>(channelDefault === "whatsapp" || channelDefault === "sms" ? channelDefault : "mock");
  const [needName, setNeedName] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setNeedName(!customerName); openModal(); }}>{t("crm.send", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={`${t("crm.to", lang)}: ${customerName || t("crm.toCustomer", lang)}`} subtitle={phone}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          if (!message.trim()) { setError(t("crm.messageRequired", lang)); setLoading(false); return; }
          const result = await sendCommunicationAction({
            customerId,
            message: message.trim(),
            channel: channel as "whatsapp" | "sms" | "manual" | "mock",
            followUpTaskId: taskId ?? null,
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(t("crm.messageLogged", lang));
          setMessage("");
          onSent?.();
          setTimeout(() => { closeModal(); router.refresh(); }, 700);
        }}>
          <ModalFormStatus error={error} success={success} />
          {needName && <Field label={t("crm.opName", lang)}><Input className="hidden" name="_custId" defaultValue={customerId} /><Input name="custName" defaultValue={customerName} /></Field>}
          <Field label={t("crm.messageText", lang)}><textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder={channel === "mock" ? t("crm.mockPlaceholder", lang) : t("crm.messageText", lang)} /></Field>
          <Field label={t("crm.channel", lang)}>
            <div className="grid grid-cols-3 gap-2">
              {([["whatsapp", t("crm.whatsapp", lang)], ["sms", t("crm.sms", lang)], ["mock", t("crm.mock", lang)]] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setChannel(val)} className={`h-9 rounded-lg border text-xs font-medium ${channel === val ? "border-primary-600 bg-primary-50 text-primary-800" : "border-ink-300 text-ink-600"}`}>{label}</button>
              ))}
            </div>
          </Field>
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{t("crm.warning", lang)}</p>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{t("crm.sendLog", lang)}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}