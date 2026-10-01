import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { listCommunicationLogs, type CommunicationLogFilters } from "@/server/services/messages-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { MessagesFilterBar } from "@/components/messages/messages-filter-bar";
import Link from "next/link";
import type { Metadata } from "next";
import { getLang } from "@/lib/i18n/server";
import { uiText } from "@/lib/i18n/entities";

export const metadata: Metadata = { title: "سجل الرسائل" };

const CATEGORY_LABELS: Record<string, string> = { TRANSACTIONAL: "رسائل تشغيلية", PROMOTIONAL: "رسائل وعروض" };
const CHANNEL_LABELS: Record<string, string> = { WHATSAPP: "واتساب", SMS: "رسالة نصية", MANUAL: "يدوي", MOCK: "تجربة" };
const LOG_STATUS_LABELS: Record<string, string> = { SENT: "أُرسلت", FAILED: "فشلت", SKIPPED: "تم التجاهل" };
const LOG_STATUS_TONES: Record<string, "neutral" | "success" | "warning" | "danger" | "info" | "purple"> = { SENT: "success", FAILED: "danger", SKIPPED: "neutral" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ category?: string; customerId?: string; status?: string; from?: string; to?: string; page?: string }> }) {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const sp = await searchParams;
  const filters: CommunicationLogFilters = {
    category: sp.category || null,
    customerId: sp.customerId || null,
    status: sp.status || null,
    from: sp.from || null,
    to: sp.to || null,
    page: sp.page ? Number(sp.page) : 1,
  };
  const result = await listCommunicationLogs(user, filters);
  const categoryLabels = lang === "en" ? { TRANSACTIONAL: "Operational messages", PROMOTIONAL: "Messages & offers" } : CATEGORY_LABELS;
  const channelLabels = lang === "en" ? { WHATSAPP: "WhatsApp", SMS: "SMS", MANUAL: "Manual", MOCK: "Demo" } : CHANNEL_LABELS;
  const statusLabels = lang === "en" ? { SENT: "Sent", FAILED: "Failed", SKIPPED: "Skipped" } : LOG_STATUS_LABELS;

  const query = (patch: { page?: number }) => {
    const p = new URLSearchParams();
    if (sp.category) p.set("category", sp.category);
    if (sp.customerId) p.set("customerId", sp.customerId);
    if (sp.status) p.set("status", sp.status);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (patch.page) p.set("page", String(patch.page));
    const q = p.toString();
    return q ? `/messages?${q}` : "/messages";
  };

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{uiText(lang, "سجل الرسائل", "Message log")}</h1>
      <p className="text-sm text-ink-500 mb-5">{uiText(lang, "جميع الرسائل المرسلة للعملاء — التشغيلية والترويجية", "All messages sent to customers — operational and promotional")}</p>

      <Card className="mb-5">
        <CardBody className="py-3">
          <MessagesFilterBar />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={uiText(lang, "الرسائل", "Messages")} actions={<Badge tone="neutral">{result.total}</Badge>} />
        <CardBody className="p-0">
          {result.items.length === 0 ? (
            <p className="px-5 py-10 text-sm text-ink-400 text-center">{uiText(lang, "لا توجد رسائل مطابقة", "No matching messages")}</p>
          ) : (
            <Table headers={[uiText(lang, "الوقت", "Time"), uiText(lang, "العميلة", "Customer"), uiText(lang, "النوع", "Type"), uiText(lang, "القناة", "Channel"), uiText(lang, "الرسالة", "Message"), uiText(lang, "الحالة", "Status")]}>
              {result.items.map((log) => (
                <tr key={log.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDate(log.sentAt, settings.timezone)}</Td>
                  <Td>
                    <Link href={`/patients/${log.customer.id}`} className="text-primary-700 hover:underline">{log.customer.fullName}</Link>
                    <span className="block text-[11px] text-ink-400" dir="ltr">{log.customer.phone}</span>
                  </Td>
                  <Td>
                    {log.campaignId ? (
                      <Link href={`/campaigns/${log.campaignId}`} className="text-primary-700 hover:underline">{categoryLabels[log.category as keyof typeof categoryLabels] ?? log.category}</Link>
                    ) : (
                      categoryLabels[log.category as keyof typeof categoryLabels] ?? log.category
                    )}
                  </Td>
                  <Td>{channelLabels[log.channel as keyof typeof channelLabels] ?? log.channel}</Td>
                  <Td><span className="block max-w-xs truncate" title={log.message}>{log.message}</span></Td>
                  <Td><StatusBadge status={log.status} labels={statusLabels} tones={LOG_STATUS_TONES} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </CardBody>
      </Card>

      {result.pages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {result.page > 1 && <Link href={query({ page: result.page - 1 })}><Button variant="outline" size="sm">{uiText(lang, "السابق", "Previous")}</Button></Link>}
          <span className="text-sm text-ink-500 self-center">{uiText(lang, "صفحة", "Page")} {result.page} {uiText(lang, "من", "of")} {result.pages}</span>
          {result.page < result.pages && <Link href={query({ page: result.page + 1 })}><Button variant="outline" size="sm">{uiText(lang, "التالي", "Next")}</Button></Link>}
        </div>
      )}
    </>
  );
}
