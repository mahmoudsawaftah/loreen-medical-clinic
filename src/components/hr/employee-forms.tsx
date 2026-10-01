"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createEmployeeAction,
  createUserAction,
  changeSalaryAction,
  endEmploymentAction,
} from "@/server/actions/manage-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { useLang } from "@/components/i18n/lang-provider";
import { uiText } from "@/lib/i18n/entities";

export interface EmployeeItem {
  id: string;
  name: string;
  englishName: string | null;
  jobTitle: string;
  monthlySalary: number;
  startDate: string;
  endDate: string | null;
  active: boolean;
  notes: string | null;
  userId: string | null;
  user: { id: string; username: string; role: Role; status: string; englishName: string | null } | null;
}

export interface AccountItem {
  id: string;
  username: string;
  name: string;
  englishName: string | null;
  role: Role;
  status: string;
  permissionOverrides: string[];
  employeeSalary: number | null;
  linkedEmployeeName: string | null;
}

const SALARY_REASONS = ["زيادة سنوية", "تعديل راتب", "تخفيض راتب", "تغيير عقد"];

export function EmployeeModal({ userIds }: { userIds: { id: string; name: string }[] }) {
  const { lang } = useLang();
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [withAccount, setWithAccount] = useState(false);

  return (
    <>
      <Button size="sm" onClick={openModal}>+ {uiText(lang, "موظف", "Employee")}</Button>
      <Modal open={open} onClose={closeModal} title={uiText(lang, "إضافة موظف", "Add employee")} subtitle={uiText(lang, "موظف مستقل عن حسابات الدخول؛ ويمكن ربطه أو إنشاء حساب له لاحقًا", "An employee can be linked to an existing account or get a new one later")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const form = new FormData(e.currentTarget);
          let coupledId: string | null = String(form.get("userId") ?? "") || null;
          if (withAccount) {
            const username = String(form.get("newUsername") ?? "");
            const password = String(form.get("newPassword") ?? "");
            if (username.length < 3 || password.length < 8) { setError(uiText(lang, "اسم المستخدم 3 أحرف على الأقل وكلمة المرور 8 أحرف", "Username must have 3+ characters and password 8+ characters")); setLoading(false); return; }
            const userResult = await createUserAction({
              username,
              password,
              name: String(form.get("name")),
              role: String(form.get("newRole")) as Role,
            });
            if (!userResult.ok) { setError(userResult.error ?? uiText(lang, "تعذر إنشاء الحساب", "Could not create account")); setLoading(false); return; }
            if (!userResult.data) { setError(uiText(lang, "تعذر إنشاء الحساب", "Could not create account")); setLoading(false); return; }
            coupledId = userResult.data.id;
          }
          const result = await createEmployeeAction({
            name: String(form.get("name")),
            englishName: String(form.get("englishName") ?? "") || null,
            jobTitle: String(form.get("jobTitle")),
            monthlySalary: Number(form.get("monthlySalary") ?? 0),
            startDate: String(form.get("startDate") || new Date().toISOString().slice(0, 10)),
            notes: String(form.get("notes") ?? "") || null,
            userId: coupledId,
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(uiText(lang, "تمت الإضافة", "Employee added"));
          setTimeout(() => { closeModal(); setSuccess(null); router.refresh(); }, 600);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={uiText(lang, "الاسم", "Name")}><Input name="name" required /></Field>
            <Field label={uiText(lang, "الاسم بالإنجليزية", "English name")}><Input name="englishName" dir="ltr" /></Field>
            <Field label={uiText(lang, "المسمى الوظيفي", "Job title")}><Input name="jobTitle" required /></Field>
            <Field label={uiText(lang, "الراتب الشهري (د.أ)", "Monthly salary (JOD)")}><Input name="monthlySalary" inputMode="decimal" required /></Field>
            <Field label={uiText(lang, "تاريخ البدء", "Start date")}><Input name="startDate" type="date" /></Field>
          </div>
          <Field label={uiText(lang, "حساب دخول موجود (اختياري)", "Existing login account (optional)")}>
            <Select name="userId">
              <option value="">— {uiText(lang, "بدون حساب", "No account")} —</option>
              {userIds.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={withAccount} onChange={(e) => setWithAccount(e.target.checked)} className="accent-primary-600" />
            {uiText(lang, "إنشاء حساب دخول لهذا الموظف", "Create a login account for this employee")}
          </label>
          {withAccount && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-ink-100 p-3">
              <Field label={uiText(lang, "اسم المستخدم", "Username")}><Input name="newUsername" dir="ltr" required /></Field>
              <Field label={uiText(lang, "كلمة المرور المؤقتة", "Temporary password")}><Input name="newPassword" type="password" required /></Field>
              <Field label={uiText(lang, "الدور", "Role")}>
                <Select name="newRole" defaultValue="SECRETARY">
                  <option value="SECRETARY">{ROLE_LABELS.SECRETARY}</option>
                  <option value="DOCTOR">{ROLE_LABELS.DOCTOR}</option>
                  <option value="ACCOUNTANT">{ROLE_LABELS.ACCOUNTANT}</option>
                </Select>
              </Field>
            </div>
          )}
          <Field label={uiText(lang, "ملاحظات", "Notes")}><Input name="notes" /></Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{uiText(lang, "حفظ", "Save")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function SalaryModal({ employee, open, onClose }: { employee: EmployeeItem; open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title={`${uiText(lang, "الراتب", "Salary")} — ${employee.name}`} subtitle={`${uiText(lang, "الراتب الحالي", "Current salary")}: ${employee.monthlySalary} JOD / ${uiText(lang, "شهر", "month")}`}>
      <div className="flex gap-2 mb-4">
        <button type="button" onClick={() => setShowHistory((s) => !s)} className="text-xs font-medium text-primary-700 hover:underline">
          {showHistory ? uiText(lang, "إخفاء سجل الرواتب", "Hide salary history") : uiText(lang, "سجل الرواتب", "Salary history")}
        </button>
      </div>
      {showHistory && <SalaryHistoryList employeeId={employee.id} />}
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setError(null); setSuccess(null);
        const form = new FormData(e.currentTarget);
        const result = await changeSalaryAction({
          employeeId: employee.id,
          data: {
            monthlySalary: Number(form.get("monthlySalary") ?? 0),
            effectiveFrom: String(form.get("effectiveFrom") || new Date().toISOString().slice(0, 10)),
            reason: String(form.get("reason") ?? (lang === "ar" ? "تعديل راتب" : "Salary adjustment")),
          },
        });
        setLoading(false);
        if (!result.ok) { setError(result.error); return; }
        setSuccess(uiText(lang, "تم حفظ الراتب كفترة جديدة", "Salary saved as a new period"));
        setTimeout(() => { onClose(); setSuccess(null); router.refresh(); }, 700);
      }}>
        <ModalFormStatus error={error} success={success} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={uiText(lang, "الراتب الجديد (د.أ)", "New salary (JOD)")}><Input name="monthlySalary" inputMode="decimal" required /></Field>
          <Field label={uiText(lang, "تاريخ سريان الراتب", "Effective date")}><Input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        </div>
        <Field label={uiText(lang, "السبب", "Reason")}>
          <Select name="reason" defaultValue="تعديل راتب">
            {SALARY_REASONS.map((r) => <option key={r} value={r}>{lang === "en" ? ({ "زيادة سنوية": "Annual increase", "تعديل راتب": "Salary adjustment", "تخفيض راتب": "Salary decrease", "تغيير عقد": "Contract change" } as Record<string, string>)[r] : r}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-ink-500">{uiText(lang, "يُحفظ الراتب الجديد كفترة مستقلة؛ وتبقى الفترات السابقة كما هي دون تعديل.", "The new salary is saved as a separate period; previous periods remain unchanged.")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          <Button type="submit" size="sm" loading={loading}>{uiText(lang, "حفظ الراتب", "Save salary")}</Button>
        </div>
      </form>
    </Modal>
  );
}

function SalaryHistoryList({ employeeId }: { employeeId: string }) {
  const { lang } = useLang();
  const [rows, setRows] = useState<null | { id: string; monthlySalary: number; effectiveFrom: string; effectiveTo: string | null; reason: string | null; createdAt: string }[]>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { listSalaryHistoryAction } = await import("@/server/actions/manage-actions");
      const result = await listSalaryHistoryAction({ employeeId });
      if (!alive) return;
      if (!result.ok) { setError(result.error ?? uiText(lang, "تعذر تحميل السجل", "Could not load history")); return; }
      if (result.data) setRows(result.data.map((r) => ({ id: r.id, monthlySalary: Number(r.monthlySalary), effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10), effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString().slice(0, 10) : null, reason: r.reason, createdAt: r.createdAt.toISOString() })));
    })();
    return () => { alive = false; };
    }, [employeeId, lang]);
  if (error) return <p className="text-xs text-red-600 mb-3">{error}</p>;
  if (rows === null) return <p className="text-xs text-ink-400 mb-3">{uiText(lang, "جارٍ تحميل السجل...", "Loading history...")}</p>;
  return (
    <div className="mb-4 rounded-lg border border-ink-100 divide-y divide-ink-50 max-h-[30vh] overflow-y-auto">
      {rows.length === 0 && <p className="px-3 py-3 text-xs text-ink-400">{uiText(lang, "لا يوجد سجل رواتب", "No salary history")}</p>}
      {rows.map((r) => (
        <div key={r.id} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="font-bold tabular-nums">{r.monthlySalary} JOD</span>
          <span className="text-ink-500">{uiText(lang, "من", "From")} {r.effectiveFrom}</span>
          <span className="text-ink-400">{uiText(lang, "إلى", "To")} {r.effectiveTo ?? uiText(lang, "حتى الآن", "Present")}</span>
          {r.reason && <span className="rounded-full bg-ink-50 px-2 py-0.5 text-[10px] text-ink-600">{r.reason}</span>}
        </div>
      ))}
    </div>
  );
}

export function EndEmploymentModal({ employee, open, onClose }: { employee: EmployeeItem; open: boolean; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title={`${uiText(lang, "إنهاء خدمة", "End employment")} — ${employee.name}`}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        const form = new FormData(e.currentTarget);
        const result = await endEmploymentAction({ employeeId: employee.id, endDate: String(form.get("endDate") || new Date().toISOString().slice(0, 10)) });
        setLoading(false);
        if (!result.ok) { setError(result.error); return; }
        onClose();
        router.refresh();
      }}>
        <FormError message={error} />
        <p className="text-sm text-ink-600">{uiText(lang, "سيُغلق سجل الراتب الحالي ويصبح الموظف خارج الخدمة. تبقى السجلات السابقة محفوظة.", "The current salary period will close and the employee will become inactive. Previous records remain preserved.")}</p>
        <Field label={uiText(lang, "تاريخ انتهاء الخدمة", "End date")}><Input name="endDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          <Button type="submit" size="sm" variant="outline" loading={loading}>{uiText(lang, "إنهاء الخدمة", "End employment")}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function PayrollPeriodButton({ currentPeriod, currentCost }: { currentPeriod: { id: string; month: number; year: number; status: string; total: string } | null; currentCost: string }) {
  const { lang } = useLang();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{currentPeriod ? `${uiText(lang, "فترة", "Period")}: ${currentPeriod.month}/${currentPeriod.year} (${currentCost} JOD)` : uiText(lang, "فتح فترة رواتب", "Open payroll period")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()} onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true); setError(null);
            const [year, m] = month.split("-").map(Number);
            const { ensurePayrollPeriodAction } = await import("@/server/actions/manage-actions");
            const result = await ensurePayrollPeriodAction({ month: m, year });
            setLoading(false);
            if (!result.ok) { setError(result.error); return; }
            setOpen(false);
            router.refresh();
          }}>
            <h3 className="font-bold">{uiText(lang, "فترة الرواتب", "Payroll period")}</h3>
            <p className="text-xs text-ink-500">{uiText(lang, "فتح الفترة يثبت أجور الشهر للحسابات التقاريرية وإقفال اليومية.", "Opening the period snapshots monthly wages for reports and daily closing.")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Field label={uiText(lang, "الشهر", "Month")}><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required /></Field>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{uiText(lang, "إغلاق", "Close")}</Button>
              <Button type="submit" size="sm" loading={loading}>{uiText(lang, "فتح / تحديث الفترة", "Open / update period")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function EmployeeActions({ employee, canEdit }: { employee: EmployeeItem; canEdit: boolean }) {
  const { lang } = useLang();
  const router = useRouter();
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {canEdit && (
        <>
          <Button size="sm" variant="outline" onClick={() => setSalaryOpen(true)}>{uiText(lang, "الراتب", "Salary")}</Button>
          {employee.active ? (
            <Button size="sm" variant="outline" onClick={() => setEndOpen(true)}>{uiText(lang, "إنهاء الخدمة", "End employment")}</Button>
          ) : (
            <Button size="sm" variant="outline" onClick={async () => {
              const { reactivateEmployeeAction } = await import("@/server/actions/manage-actions");
              const r = await reactivateEmployeeAction({ employeeId: employee.id });
              if (r.ok) router.refresh();
            }}>{uiText(lang, "إعادة تفعيل", "Reactivate")}</Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              if (!confirmDelete) { setConfirmDelete(true); return; }
              const { deleteEmployeeAction } = await import("@/server/actions/manage-actions");
              const r = await deleteEmployeeAction({ employeeId: employee.id });
              if (r.ok) { setConfirmDelete(false); router.refresh(); } else setDeleteError(r.error);
            }}
          >
            {confirmDelete ? uiText(lang, "تأكيد الحذف؟", "Confirm delete?") : uiText(lang, "حذف", "Delete")}
          </Button>
        </>
      )}
      {deleteError && <span className="text-xs text-red-600 w-full">{deleteError}</span>}
      {salaryOpen && <SalaryModal employee={employee} open onClose={() => setSalaryOpen(false)} />}
      {endOpen && <EndEmploymentModal employee={employee} open onClose={() => setEndOpen(false)} />}
    </div>
  );
}
