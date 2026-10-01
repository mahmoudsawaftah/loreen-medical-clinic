import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { listCampaigns } from "@/server/services/campaign-service";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns";
import { db } from "@/lib/db";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/status";
import { CampaignWizard } from "@/components/campaigns/campaign-wizard";
import { getLang } from "@/lib/i18n/server";
import { uiText } from "@/lib/i18n/entities";

export const metadata = { title: "الرسائل والعروض" };

export default async function CampaignsPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const [campaigns, doctors, customers] = await Promise.all([
    listCampaigns(user),
    db.user.findMany({ where: { role: "DOCTOR", status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true, phone: true }, orderBy: { fullName: "asc" }, take: 300 }),
  ]);

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{uiText(lang, "الرسائل والعروض", "Messages & offers")}</h1>
      <p className="text-sm text-ink-500 mb-5">{uiText(lang, "حملات رسائل تسويقية لعملائك — تُرسل فقط لمن لم يطلب إيقاف العروض", "Marketing message campaigns — sent only to customers who have not opted out")}</p>

      <div className="mb-5">
        <CampaignWizard doctors={doctors} customers={customers} clinicName={settings.clinicName} />
      </div>

      <Card>
        <CardHeader title={uiText(lang, "الحملات", "Campaigns")} actions={<Badge tone="neutral">{campaigns.length}</Badge>} />
        <CardBody className="p-0">
          {campaigns.length === 0 ? (
            <p className="px-5 py-10 text-sm text-ink-400 text-center">{uiText(lang, "لا توجد حملات بعد — ابدأ حملتك الأولى", "No campaigns yet — start your first campaign")}</p>
          ) : (
            <Table headers={[uiText(lang, "الاسم", "Name"), uiText(lang, "الجمهور", "Audience"), uiText(lang, "المستلمون", "Recipients"), uiText(lang, "الحالة", "Status"), uiText(lang, "الإنشاء", "Created")] }>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/campaigns/${c.id}`} className="text-primary-700 hover:underline font-medium">{c.name}</Link>
                    {c.scheduledFor && <span className="block text-[11px] text-ink-400">{uiText(lang, "مجدولة", "Scheduled")}: {formatDate(c.scheduledFor, settings.timezone)}</span>}
                  </Td>
                  <Td className="text-xs">{c.audienceType}</Td>
                  <Td className="tabular-nums">{c.recipientCount}</Td>
                  <Td><StatusBadge status={c.status} labels={CAMPAIGN_STATUS_LABELS} /></Td>
                  <Td className="text-xs">{formatDate(c.createdAt, settings.timezone)} — {c.createdBy.name}</Td>
                </tr>
              ))}
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
