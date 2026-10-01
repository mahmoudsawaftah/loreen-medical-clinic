"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserV3Action, updateUserV3Action, setUserPermissionsAction, resetUserPasswordAction, deactivateUserAction, reactivateUserAction, deleteUserAction } from "@/server/actions/v3-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError } from "@/components/ui/form";
import { Modal, ModalFormStatus, useModal } from "@/components/modals";
import { cn } from "@/lib/cn";
import {
  PRESETS,
  PRESET_LABELS,
  ROLE_LABELS,
  PERMISSION_GROUPS,
  materializePreset,
  effectiveMapFor,
  permissionCounts,
  type GranularPermission,
  type PermissionGroup,
} from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { useLang } from "@/components/i18n/lang-provider";
import { uiText } from "@/lib/i18n/entities";

export interface ManagedUser {
  id: string;
  username: string;
  name: string;
  englishName: string | null;
  role: Role;
  status: string;
  permissionOverrides: string[];
  employeeSalary: number | null;
}

type GrantMap = Record<string, boolean>;

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "SECRETARY", label: "سكرتيرة" },
  { value: "DOCTOR", label: "دكتور" },
  { value: "ACCOUNTANT", label: "محاسب / مالية" },
];

function roleLabel(role: Role, lang: "ar" | "en" = "ar"): string {
  if (lang === "en") return ({ OWNER: "Owner", MAIN_DOCTOR: "Main doctor", DOCTOR: "Doctor", SECRETARY: "Receptionist", ACCOUNTANT: "Accountant" } as Record<Role, string>)[role];
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? ROLE_LABELS[role] ?? role;
}

/** Two-state segmented control — منح / منع only. No dropdown, no third state. */
function GrantToggle({ granted, onChange }: { granted: boolean; onChange: (granted: boolean) => void }) {
  return (
    <div className="flex rounded-lg border border-ink-200 overflow-hidden shrink-0" role="group" aria-label="منح / منع">
      <button
        type="button"
        aria-pressed={granted}
        onClick={() => onChange(true)}
        className={cn(
          "px-3 py-1.5 text-xs font-semibold transition-colors min-w-[64px]",
          granted ? "bg-emerald-600 text-white" : "bg-white text-ink-500 hover:bg-emerald-50",
        )}
      >
        ✓ منح
      </button>
      <button
        type="button"
        aria-pressed={!granted}
        onClick={() => onChange(false)}
        className={cn(
          "px-3 py-1.5 text-xs font-semibold transition-colors min-w-[64px] border-r border-ink-200",
          !granted ? "bg-rose-600 text-white" : "bg-white text-ink-500 hover:bg-rose-50",
        )}
      >
        ⛔ منع
      </button>
    </div>
  );
}

function SummaryChips({ map }: { map: GrantMap }) {
  const { granted, blocked } = permissionCounts(map as Record<GranularPermission, boolean>);
  return (
    <div className="flex gap-2 text-xs">
      <span className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 font-medium">{granted} ممنوحة</span>
      <span className="rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1 font-medium">{blocked} ممنوعة</span>
    </div>
  );
}

function GroupCard({
  group,
  map,
  query,
  collapsed,
  onToggle,
  onChange,
}: {
  group: PermissionGroup;
  map: GrantMap;
  query: string;
  collapsed: boolean;
  onToggle: () => void;
  onChange: (code: string, granted: boolean) => void;
}) {
  const items = group.permissions.filter(
    (p) => !query.trim() || p.label.includes(query.trim()) || p.code.includes(query.trim()),
  );
  if (items.length === 0) return null;
  const grantedCount = items.filter((p) => map[p.code]).length;
  return (
    <div className="rounded-xl border border-ink-100 overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 bg-ink-50/60 hover:bg-ink-50 text-sm font-bold text-ink-800">
        <svg className={cn("w-4 h-4 text-ink-400 transition-transform", collapsed && "-rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {group.label}
        <span className="mr-auto text-[11px] font-medium text-ink-400">
          {grantedCount} منحة من {items.length}
        </span>
      </button>
      {!collapsed && (
        <div className="divide-y divide-ink-50 border-t border-ink-100">
          {items.map((item) => (
            <div key={item.code} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-ink-700">{item.label}</span>
              <GrantToggle granted={map[item.code] ?? false} onChange={(g) => onChange(item.code, g)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermissionMatrix({ map, onChange, initialState }: { map: GrantMap; onChange: (code: string, granted: boolean) => void; initialState?: Record<string, boolean> }) {
  const { lang } = useLang();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initialState ?? {});
  const toggleGroup = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  return (
    <div className="space-y-2">
      <Input placeholder={uiText(lang, "ابحث عن صلاحية...", "Search permissions...")} value={query} onChange={(e) => setQuery(e.target.value)} className="mb-1" />
      {PERMISSION_GROUPS.map((group) => (
        <GroupCard key={group.key} group={group} map={map} query={query} collapsed={!!collapsed[group.key]} onToggle={() => toggleGroup(group.key)} onChange={onChange} />
      ))}
    </div>
  );
}

export function CreateUserModal() {
  const { lang } = useLang();
  const { open, openModal, closeModal } = useModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("SECRETARY");
  const [map, setMap] = useState<GrantMap>(() => materializePreset("SECRETARY") as GrantMap);
  const [showPermissions, setShowPermissions] = useState(false);

  const onRoleChange = (next: Role) => {
    setRole(next);
    setMap(materializePreset(next) as GrantMap);
  };

  return (
    <>
      <Button size="sm" onClick={openModal}>+ {uiText(lang, "حساب جديد", "New account")}</Button>
      <Modal open={open} onClose={closeModal} title={uiText(lang, "حساب جديد", "New account")} subtitle={uiText(lang, "كلمة المرور الابتدائية ويُجبر المستخدم على تغييرها عند أول دخول", "The user must change the temporary password on first sign-in")}>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true); setError(null); setSuccess(null);
          const f = new FormData(e.currentTarget);
          if (String(f.get("password")).length < 8) { setError(uiText(lang, "كلمة المرور 8 أحرف على الأقل", "Password must be at least 8 characters")); setLoading(false); return; }
          const granted = Object.entries(map).filter(([, g]) => g).map(([code]) => code);
          const result = await createUserV3Action({
            username: String(f.get("username")),
            name: String(f.get("name")),
            englishName: String(f.get("englishName") ?? "") || null,
            password: String(f.get("password")),
            role,
            monthlySalary: Number(f.get("monthlySalary") ?? 0) || null,
            jobTitle: String(f.get("jobTitle") ?? "") || null,
            permissions: granted,
          });
          setLoading(false);
          if (!result.ok) { setError(result.error); return; }
          setSuccess(uiText(lang, "تم إنشاء الحساب", "Account created"));
          setTimeout(() => { closeModal(); setSuccess(null); router.refresh(); }, 600);
        }}>
          <ModalFormStatus error={error} success={success} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={uiText(lang, "اسم الموظف", "Staff name")}><Input name="name" required /></Field>
            <Field label={uiText(lang, "الاسم بالإنجليزية", "English name")}><Input name="englishName" dir="ltr" /></Field>
            <Field label={uiText(lang, "اسم المستخدم", "Username")}><Input name="username" required dir="ltr" /></Field>
            <Field label={uiText(lang, "كلمة المرور المؤقتة", "Temporary password")}><Input name="password" type="password" required /></Field>
            <Field label={uiText(lang, "الدور", "Role")}>
              <Select value={role} onChange={(e) => onRoleChange(e.target.value as Role)}>
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{roleLabel(o.value, lang)} — {lang === "en" ? roleLabel(o.value, lang) : PRESET_LABELS[PRESETS[o.value]]}</option>)}
              </Select>
            </Field>
            <Field label={uiText(lang, "الراتب الشهري (د.أ) (اختياري)", "Monthly salary (JOD, optional)")}><Input name="monthlySalary" inputMode="decimal" /></Field>
            <Field label={uiText(lang, "المسمى الوظيفي (اختياري)", "Job title (optional)")}><Input name="jobTitle" /></Field>
          </div>

          <div className="rounded-xl border border-ink-100 p-3">
            <button
              type="button"
              onClick={() => setShowPermissions((s) => !s)}
              className="w-full flex items-center justify-between gap-2 text-sm"
            >
              <span className="font-semibold text-ink-800">{uiText(lang, "الصلاحيات", "Permissions")}</span>
              <span className="flex items-center gap-2">
                <SummaryChips map={map} />
                <span className="text-xs text-primary-700">{showPermissions ? uiText(lang, "إخفاء", "Hide") : uiText(lang, "مراجعة", "Review")}</span>
              </span>
            </button>
            {showPermissions && (
              <div className="mt-3 max-h-[38vh] overflow-y-auto pl-1 pr-1">
                <PermissionMatrix map={map} onChange={(code, g) => setMap((m) => ({ ...m, [code]: g }))} />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={loading}>{uiText(lang, "إنشاء", "Create")}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EditModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState(user.role);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const isOwner = user.role === "OWNER";

  return (
    <Modal open onClose={onClose} title={`${uiText(lang, "تعديل حساب", "Edit account")} — ${user.name}`}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        const f = new FormData(e.currentTarget);
        const result = await updateUserV3Action({
          userId: user.id,
          data: {
            name: String(f.get("name")),
            role,
            monthlySalary: Number(f.get("monthlySalary") ?? 0) || null,
            applyPreset: pendingRole !== null && pendingRole !== user.role,
          },
        });
        setLoading(false);
        if (!result.ok) { setError(result.error); return; }
        onClose();
        router.refresh();
      }}>
        <ModalFormStatus error={error} success={null} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={uiText(lang, "الاسم", "Name")}><Input name="name" defaultValue={user.name} required /></Field>
          <Field label={uiText(lang, "الاسم بالإنجليزية", "English name")}><Input name="englishName" defaultValue={user.englishName ?? ""} dir="ltr" /></Field>
          <Field label={uiText(lang, "الدور", "Role")}>
            {isOwner ? (
              <Input value={PRESET_LABELS[PRESETS.OWNER]} disabled />
            ) : (
              <Select value={role} onChange={(e) => setPendingRole(e.target.value as Role)}>
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{roleLabel(o.value, lang)} — {lang === "en" ? roleLabel(o.value, lang) : PRESET_LABELS[PRESETS[o.value]]}</option>)}
              </Select>
            )}
          </Field>
          <Field label={uiText(lang, "الراتب الشهري (د.أ)", "Monthly salary (JOD)")}><Input name="monthlySalary" inputMode="decimal" defaultValue={user.employeeSalary ?? ""} /></Field>
        </div>

        {pendingRole && pendingRole !== role && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-3">
            <p>
              {uiText(lang, "تغيير الدور سيعيد ضبط الصلاحيات إلى الإعدادات الافتراضية لدور", "Changing the role will reset permissions to the default preset for")} {roleLabel(pendingRole, lang)}. {uiText(lang, "هل تريد المتابعة؟", "Continue?")}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => { setRole(pendingRole); setPendingRole(null); }}
              >
                {uiText(lang, "تطبيق صلاحيات الدور الجديد", "Apply new role permissions")}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setPendingRole(null)}>{uiText(lang, "إلغاء", "Cancel")}</Button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          <Button type="submit" size="sm" loading={loading}>{uiText(lang, "حفظ", "Save")}</Button>
        </div>
      </form>
    </Modal>
  );
}

function PermissionEditorModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<GrantMap>(() => effectiveMapFor({ role: user.role, permissionOverrides: user.permissionOverrides }) as GrantMap);
  const [confirmReset, setConfirmReset] = useState(false);

  async function save() {
    setLoading(true); setError(null);
    const granted = Object.entries(map).filter(([, g]) => g).map(([code]) => code);
    const denied = Object.entries(map).filter(([, g]) => !g).map(([code]) => code);
    const result = await setUserPermissionsAction({ userId: user.id, granted, denied });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    onClose();
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} title={`${uiText(lang, "الصلاحيات", "Permissions")} — ${user.name}`} subtitle={`${uiText(lang, "الدور", "Role")}: ${roleLabel(user.role, lang)}`}>
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <SummaryChips map={map} />
        <button
          type="button"
          onClick={() => setConfirmReset((c) => !c)}
          className="mr-auto text-xs font-medium text-ink-500 hover:text-ink-700"
          disabled={loading}
        >
          {uiText(lang, "إعادة ضبط حسب الدور", "Reset to role preset")}
        </button>
      </div>

      {confirmReset && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2 mb-3">
          <p>
              {uiText(lang, "سيتم إعادة ضبط جميع الصلاحيات إلى إعدادات الدور الافتراضية (منح / منع صريحة)، وتُلغى أي تعديلات سابقة.", "All permissions will be reset to the role defaults and previous changes will be removed.")}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => { setMap(materializePreset(user.role) as GrantMap); setConfirmReset(false); }}
            >
              {uiText(lang, "تأكيد إعادة الضبط", "Confirm reset")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      <div className="max-h-[48vh] overflow-y-auto pl-1 space-y-2">
        <PermissionMatrix
          map={map}
          onChange={(code, g) => setMap((m) => ({ ...m, [code]: g }))}
          initialState={{ customers: false, appointments: false, treatments: false, payments: false, inventory: false, purchases: false, messages: false, finance: false, administration: false }}
        />
      </div>

      <div className="flex justify-end gap-2 pt-3 mt-1 border-t border-ink-100">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
        <Button type="button" size="sm" onClick={save} loading={loading}>{uiText(lang, "حفظ الصلاحيات", "Save permissions")}</Button>
      </div>
    </Modal>
  );
}

function DangerModal({ user, mode, onClose }: { user: ManagedUser; mode: "deactivate" | "reactivate" | "delete"; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const titles = { deactivate: `${uiText(lang, "تعطيل حساب", "Deactivate account")} — ${user.name}`, reactivate: `${uiText(lang, "تفعيل حساب", "Activate account")} — ${user.name}`, delete: `${uiText(lang, "حذف حساب", "Delete account")} — ${user.name}` };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    const f = new FormData(e.currentTarget);
    let result;
    if (mode === "deactivate") result = await deactivateUserAction({ userId: user.id, reason: String(f.get("reason") ?? "") });
    else if (mode === "reactivate") result = await reactivateUserAction({ userId: user.id });
    else result = await deleteUserAction({ userId: user.id });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    setSuccess(uiText(lang, "تمت العملية", "Done"));
    setTimeout(() => { onClose(); setSuccess(null); router.refresh(); }, 700);
  }

  return (
    <Modal open onClose={onClose} title={titles[mode]}>
      <form className="space-y-3" onSubmit={submit}>
        <ModalFormStatus error={error} success={success} />
        {mode === "deactivate" && (
          <>
            <p className="text-sm text-ink-600">{uiText(lang, "سيتم تعطيل تسجيل الدخول، مع بقاء اسم المستخدم وسجلّه التاريخي محفوظًا.", "Sign-in will be disabled while the username and history remain preserved.")}</p>
            <Field label={uiText(lang, "السبب (اختياري)", "Reason (optional)")}><Input name="reason" /></Field>
          </>
        )}
        {mode === "reactivate" && <p className="text-sm text-ink-600">{uiText(lang, "سيُعاد تفعيل تسجيل الدخول للحساب.", "Sign-in will be re-enabled for this account.")}</p>}
        {mode === "delete" && (
          <p className="text-sm text-ink-600">
            {uiText(lang, "يُسمح بالحذف الدائم فقط إذا لم يكن لهذا الحساب أي عمليات سابقة مرتبطة. وإلا فسيتعين تعطيل الحساب للحفاظ على السجل.", "Permanent deletion is allowed only when the account has no linked history. Otherwise, deactivate it to preserve the record.")}
          </p>
        )}
        {mode === "delete" && <Field label={uiText(lang, "اكتب كلمة «حذف» للتأكيد", "Type DELETE to confirm")}><Input name="confirm" required pattern={lang === "en" ? "DELETE" : "حذف"} /></Field>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          <Button type="submit" size="sm" variant={mode === "delete" ? "danger" : "outline"} loading={loading}>
            {mode === "deactivate" ? uiText(lang, "تعطيل", "Deactivate") : mode === "reactivate" ? uiText(lang, "تفعيل", "Activate") : uiText(lang, "حذف نهائي", "Delete permanently")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function UserRowActions({ user, selfId }: { user: ManagedUser; selfId: string }) {
  const { lang } = useLang();
  const [editOpen, setEditOpen] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [danger, setDanger] = useState<null | "deactivate" | "reactivate" | "delete">(null);

  return (
    <div className="flex flex-wrap gap-1.5 justify-end">
      <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>{uiText(lang, "تعديل", "Edit")}</Button>
      {user.role !== "OWNER" && <Button size="sm" variant="outline" onClick={() => setPermsOpen(true)}>{uiText(lang, "الصلاحيات", "Permissions")}</Button>}
      <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>{uiText(lang, "إعادة تعيين كلمة المرور", "Reset password")}</Button>
      {user.status === "ACTIVE" ? (
        <Button size="sm" variant="outline" onClick={() => setDanger("deactivate")} disabled={user.id === selfId}>{uiText(lang, "تعطيل", "Deactivate")}</Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setDanger("reactivate")}>{uiText(lang, "تفعيل", "Activate")}</Button>
      )}
      {user.id !== selfId && user.role !== "OWNER" && <Button size="sm" variant="danger" onClick={() => setDanger("delete")}>{uiText(lang, "حذف", "Delete")}</Button>}
      {editOpen && <EditModal user={user} onClose={() => setEditOpen(false)} />}
      {permsOpen && <PermissionEditorModal user={user} onClose={() => setPermsOpen(false)} />}
      {resetOpen && <ResetPasswordModal user={user} onClose={() => setResetOpen(false)} />}
      {danger && <DangerModal user={user} mode={danger} onClose={() => setDanger(null)} />}
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const { lang } = useLang();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`${uiText(lang, "إعادة تعيين كلمة المرور", "Reset password")} — ${user.name}`} subtitle={uiText(lang, "سيُجبر المستخدم على تغييرها عند أول دخول", "The user must change it on first sign-in")}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true); setError(null); setSuccess(null);
        const form = new FormData(e.currentTarget);
        const password = String(form.get("password") ?? "");
        if (password.length < 8) { setError(uiText(lang, "كلمة المرور 8 أحرف على الأقل", "Password must be at least 8 characters")); setLoading(false); return; }
        const result = await resetUserPasswordAction({ userId: user.id, password });
        setLoading(false);
        if (!result.ok) { setError(result.error); return; }
        setSuccess(uiText(lang, "تمت إعادة التعيين", "Password reset"));
        setTimeout(() => { onClose(); setSuccess(null); router.refresh(); }, 700);
      }}>
        <ModalFormStatus error={error} success={success} />
        <Field label={uiText(lang, "كلمة المرور الجديدة", "New password")}><Input name="password" type="password" required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>{uiText(lang, "إلغاء", "Cancel")}</Button>
          <Button type="submit" size="sm" loading={loading}>{uiText(lang, "حفظ", "Save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
