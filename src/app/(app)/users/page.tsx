import { requirePermission } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS, effectiveMapFor, permissionCounts } from "@/lib/permissions";
import type { Role } from "@prisma/client";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { listUsers } from "@/server/services/user-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { CreateUserModal, UserRowActions } from "@/components/users/user-manager";
import { getLang } from "@/lib/i18n/server";
import { t, type I18nKey } from "@/lib/i18n/dict";

const ROLE_KEYS: Record<Role, I18nKey> = {
  OWNER: "role.owner",
  MAIN_DOCTOR: "role.mainDoctor",
  ACCOUNTANT: "role.accountant",
  DOCTOR: "role.doctor",
  SECRETARY: "role.secretary",
};

export async function generateMetadata() {
  const lang = await getLang();
  return { title: t("users.title", lang) };
}

export default async function UsersPage() {
  const user = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
  const settings = await getSettings();
  const lang = await getLang();
  const users = await listUsers(user);
  const totalGranted = users.reduce((a, u) => a + permissionCounts(effectiveMapFor(u)).granted, 0);

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("users.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{lang === "ar" ? "إدارة حسابات الدخول — كل صلاحية لكل حساب تُعرض وتُحفظ كـ「منح / منع」صريحة" : "Manage login accounts — each permission is stored as an explicit grant or block."}</p>

      <div className="mb-5">
        <CreateUserModal />
      </div>

      <Card>
      <CardHeader title={t("payroll.accounts", lang)} actions={<span className="flex gap-2 text-xs"><Badge tone="neutral">{users.length} {lang === "ar" ? "حساب" : "accounts"}</Badge><Badge tone="success">{totalGranted} {lang === "ar" ? "صلاحية مفعّلة" : "permissions enabled"}</Badge></span>} />
        <CardBody className="p-0">
          <Table headers={[t("common.name", lang), t("users.username", lang), t("users.role", lang), t("common.status", lang), t("common.date", lang), ""]}>
            {users.map((u) => {
              const map = effectiveMapFor(u);
              const counts = permissionCounts(map);
              return (
                <tr key={u.id}>
                  <Td>
                    <span className="font-medium">{u.name}</span>
                    {u.id === user.id && <Badge tone="purple">{t("common.you", lang)}</Badge>}
                  </Td>
                  <Td className="text-right"><span dir="ltr">{u.username}</span></Td>
                  <Td>
                    <span className="text-sm">{t(ROLE_KEYS[u.role], lang)}</span>
                    <span className="block text-[11px] text-ink-400">
                      {counts.granted} {t("users.granted", lang)} · {counts.blocked} {t("users.blocked", lang)}
                    </span>
                  </Td>
                  <Td><Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status === "ACTIVE" ? (lang === "ar" ? "نشط" : "Active") : (lang === "ar" ? "موقوف" : "Inactive")}</Badge></Td>
                  <Td className="text-xs">{formatDate(u.createdAt, settings.timezone)}</Td>
                  <Td><UserRowActions user={u} selfId={user.id} /></Td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>
    </>
  );
}
