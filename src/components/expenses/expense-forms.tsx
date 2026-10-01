"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExpenseCategoryAction, createExpenseAction, approveExpenseAction, voidExpenseAction } from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { useLang } from "@/components/i18n/lang-provider";
import { uiText } from "@/lib/i18n/entities";

export function ExpenseCreateModal({ categories }: { categories: { id: string; name: string }[] }) {
  const { lang } = useLang();
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" onClick={openModal}>+ {uiText(lang, "مصروف", "Expense")}</Button>
      <Modal open={open} onClose={closeModal} title={uiText(lang, "إدخال مصروف", "Add expense")} subtitle={uiText(lang, "يُعتمد تلقائيًا للمالك — المحاسب بحسب الإعدادات", "Automatically approved for the owner — accountant approval follows settings")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          const result = await createExpenseAction({
            categoryId: String(form.get("categoryId")),
            amount: Number(form.get("amount")),
            date: String(form.get("date") || new Date().toISOString().slice(0, 10)),
            description: String(form.get("description")),
            method: String(form.get("method") ?? "") || null,
            reference: String(form.get("reference") ?? "") || null,
            notes: String(form.get("notes") ?? "") || null,
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(uiText(lang, "تم إدخال المصروف", "Expense added"));
          setTimeout(() => { closeModal(); router.refresh(); }, 600);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={uiText(lang, "التصنيف", "Category")}>
              <Select name="categoryId" required>
                <option value="">— {uiText(lang, "اختر", "Select")} —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={uiText(lang, "المبلغ (د.أ)", "Amount (JOD)")}><Input name="amount" inputMode="decimal" required /></Field>
            <Field label={uiText(lang, "الوصف", "Description")}><Input name="description" required /></Field>
            <Field label={uiText(lang, "التاريخ", "Date")}><Input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={uiText(lang, "طريقة الدفع", "Payment method")}>
              <Select name="method">
                <option value="">— —</option>
                <option value="CASH">{uiText(lang, "كاش", "Cash")}</option>
                <option value="CLIQ">CliQ</option>
                <option value="VISA">{uiText(lang, "فيزا", "Visa")}</option>
              </Select>
            </Field>
            <Field label={uiText(lang, "المرجع", "Reference")}><Input name="reference" dir="ltr" /></Field>
          </div>
          <Field label={uiText(lang, "ملاحظات", "Notes")}><Input name="notes" /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{uiText(lang, "حفظ", "Save")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ExpenseCategoryModal() {
  const { lang } = useLang();
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>+ {uiText(lang, "تصنيف", "Category")}</Button>
      <Modal open={open} onClose={closeModal} title={uiText(lang, "تصنيف مصروف جديد", "New expense category")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null);
          const form = new FormData(e.currentTarget);
          const result = await createExpenseCategoryAction({ name: String(form.get("name")), kind: String(form.get("kind")) });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          closeModal();
          router.refresh();
        }}>
          <ModalFormStatus error={error} success={null} />
          <Field label={uiText(lang, "اسم التصنيف", "Category name")}><Input name="name" required /></Field>
          <Field label={uiText(lang, "النوع", "Type")}>
            <Select name="kind" required>
              <option value="OPERATIONAL">{uiText(lang, "تشغيلي", "Operational")}</option>
              <option value="MEDICAL">{uiText(lang, "طبي", "Medical")}</option>
              <option value="FIXED">{uiText(lang, "ثابت", "Fixed")}</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{uiText(lang, "حفظ", "Save")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ApproveExpenseModal({ expenseId }: { expenseId: string }) {
  const { lang } = useLang();
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reason, setReason] = useState("");

  return (
    <>
      <Button size="sm" variant="outline" onClick={openModal}>{uiText(lang, "اعتماد", "Approve")}</Button>
      <Modal open={open} onClose={closeModal} title={uiText(lang, "اعتماد المصروف", "Approve expense")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null);
          const result = await approveExpenseAction({ expenseId, action, reason: action === "REJECTED" ? reason : null });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          closeModal();
          router.refresh();
        }}>
          <ModalFormStatus error={error} success={null} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAction("APPROVED")} className={`h-9 rounded-lg border text-xs font-medium ${action === "APPROVED" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-ink-300 text-ink-600"}`}>{uiText(lang, "اعتماد", "Approve")}</button>
            <button type="button" onClick={() => setAction("REJECTED")} className={`h-9 rounded-lg border text-xs font-medium ${action === "REJECTED" ? "border-red-600 bg-red-50 text-red-800" : "border-ink-300 text-ink-600"}`}>{uiText(lang, "رفض", "Reject")}</button>
          </div>
          {action === "REJECTED" && <Field label={uiText(lang, "السبب", "Reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>}
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{uiText(lang, "تنفيذ", "Apply")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function VoidExpenseButton({ expenseId }: { expenseId: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{uiText(lang, "إلغاء", "Void")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const result = await voidExpenseAction({ expenseId, reason });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{uiText(lang, "إلغاء المصروف", "Void expense")}</h3>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={uiText(lang, "سبب الإلغاء (مطلوب)", "Void reason (required)")} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{uiText(lang, "تراجع", "Back")}</Button>
              <Button type="submit" variant="danger" size="sm" loading={loading}>{uiText(lang, "تأكيد", "Confirm")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
