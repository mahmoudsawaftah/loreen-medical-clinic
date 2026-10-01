import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { getCampaign } from "@/server/services/campaign-service";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/campaigns";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/status";
import { CampaignActions } from "@/components/campaigns/campaign-actions";
import { getLang } from "@/lib/i18n/server";
import { uiText } from "@/lib/i18n/entities";

export const metadata = { title: "Campaign details" };

const RECIPIENT_STATUS_LABELS: Record<string, string> = { QUEUED: "بانتظار الإرسال", SENT: "أُرسلت", DELIVERED: "وصلت", FAILED: "فشلت" };
const RECIPIENT_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = { QUEUED: "neutral", SENT: "info", DELIVERED: "success", FAILED: "danger" };

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const { id } = await params;
  const campaign = await getCampaign(user, id);
  if (!campaign) notFound();

  const failed = campaign.recipients.filter((r) => r.status === "FAILED").length;
  const sent = campaign.recipients.filter((r) => r.status === "SENT" || r.status === "DELIVERED").length;
  const excluded = Math.max(0, campaign.matchedCount - campaign.recipientCount);
  const recipientLabels = lang === "en" ? { QUEUED: "Queued", SENT: "Sent", DELIVERED: "Delivered", FAILED: "Failed" } : RECIPIENT_STATUS_LABELS;

  return (
    <>
      <Link href="/campaigns" className="text-sm text-primary-700 hover:underline">← {uiText(lang, "كل الحملات", "All campaigns")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-2 mb-5">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{campaign.name}</h1>
          <p className="text-sm text-ink-500 mt-1">
            <StatusBadge status={campaign.status} labels={CAMPAIGN_STATUS_LABELS} />{" "}
            · {uiText(lang, "أُنشئت", "Created")} {formatDate(campaign.createdAt, settings.timezone)} {uiText(lang, "بواسطة", "by")} {campaign.createdBy.name}
            {campaign.sentAt && <> · {uiText(lang, "أُرسلت", "Sent")} {formatDate(campaign.sentAt, settings.timezone)}</>}
          </p>
        </div>
        <CampaignActions campaignId={campaign.id} status={campaign.status} recipientCount={campaign.recipientCount} failedCount={failed} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
          <p className="text-xs text-ink-500">{uiText(lang, "مطابقون", "Matched")}</p>
          <p className="text-xl font-bold tabular-nums">{campaign.matchedCount}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
          <p className="text-xs text-ink-500">{uiText(lang, "بأرقام صالحة", "Valid numbers")}</p>
          <p className="text-xl font-bold tabular-nums">{campaign.validPhoneCount}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
          <p className="text-xs text-ink-500">{uiText(lang, "مستبعدون (عدم الرغبة)", "Excluded (opt-out)")}</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">{excluded}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4 text-center">
          <p className="text-xs text-ink-500">{uiText(lang, "المستلمون", "Recipients")}</p>
          <p className="text-xl font-bold tabular-nums text-primary-700">{campaign.recipientCount}</p>
        </div>
      </div>

      <Card className="mb-5">
        <CardHeader title={uiText(lang, "الرسالة", "Message")} />
        <CardBody>
          <pre className="whitespace-pre-wrap text-sm text-ink-800 rounded-lg bg-ink-50 p-4 border border-ink-100" dir="rtl">{campaign.messageTemplate}</pre>
          <p className="text-[11px] text-ink-400 mt-2">{uiText(lang, "المتغيرات", "Variables")}: {"{{patient_name}}"} {"{{clinic_name}}"} {"{{doctor_name}}"} {"{{date}}"}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={uiText(lang, "المستلمون", "Recipients")}
          actions={<span className="flex gap-2 text-xs"><Badge tone="neutral">{campaign.recipients.length - sent - failed} {uiText(lang, "بانتظار", "queued")}</Badge><Badge tone="info">{sent} {uiText(lang, "أُرسلت", "sent")}</Badge><Badge tone="danger">{failed} {uiText(lang, "فشلت", "failed")}</Badge></span>}
        />
        <CardBody className="p-0">
          {campaign.recipients.length === 0 ? (
            <p className="px-5 py-10 text-sm text-ink-400 text-center">{uiText(lang, "لا يوجد مستلمون بعد — أرسل الحملة لإنشاء قائمة المستلمين", "No recipients yet — send the campaign to create the recipient list")}</p>
          ) : (
            <Table headers={[uiText(lang, "العميلة", "Customer"), uiText(lang, "الهاتف", "Phone"), uiText(lang, "الحالة", "Status"), uiText(lang, "وقت الإرسال", "Sent at"), uiText(lang, "الخطأ", "Error")]}>
              {campaign.recipients.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/patients/${r.customerId}`} className="text-primary-700 hover:underline">{r.customer.fullName}</Link>
                  </Td>
                  <Td className="text-right"><span dir="ltr">{r.phone}</span></Td>
                  <Td><StatusBadge status={r.status} labels={recipientLabels} tones={RECIPIENT_STATUS_TONES} /></Td>
                  <Td className="text-xs">{r.sentAt ? formatDate(r.sentAt, settings.timezone) : "—"}</Td>
                  <Td><span className="block max-w-[200px] truncate text-xs text-red-600" title={r.error ?? ""}>{r.error ?? ""}</span></Td>
                </tr>
              ))}
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
