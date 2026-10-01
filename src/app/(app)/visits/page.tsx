import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { todayRange, formatDateTime } from "@/lib/time";
import { listVisits } from "@/server/services/visit-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { CheckInButton } from "@/components/visits/visit-actions";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { statusLabels } from "@/lib/i18n/status";

type SectionTone = "warning" | "info" | "neutral" | "purple" | "success";

export default async function VisitsPage() {
  const user = await requireUser();
  const canCheckIn = hasPermission(user, PERMISSIONS.VISIT_MANAGE);
  const settings = await getSettings();
  const lang = await getLang();
  const visitLabels = statusLabels("visit", lang);
  const range = todayRange(settings.timezone);
  const result = await listVisits(user, { todayOnly: true, pageSize: 100 });

  const grouped = {
    WAITING: result.items.filter((v) => v.status === "WAITING"),
    WITH_DOCTOR: result.items.filter((v) => v.status === "WITH_DOCTOR"),
    REGISTERED: result.items.filter((v) => v.status === "REGISTERED"),
    READY_FOR_PAYMENT: result.items.filter((v) => v.status === "READY_FOR_PAYMENT"),
    PAID: result.items.filter((v) => v.status === "PAID"),
  };
  void range;

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("visits.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{result.total} {t("visits.count", lang)}</p>
      <QueueSection title={t("visits.sectionWaiting", lang)} items={grouped.WAITING} tone="warning" canCheckIn={canCheckIn} settings={settings} labels={visitLabels} lang={lang} />
      <QueueSection title={t("visits.sectionWithDoctor", lang)} items={grouped.WITH_DOCTOR} tone="info" canCheckIn={canCheckIn} settings={settings} labels={visitLabels} lang={lang} />
      <QueueSection title={t("visits.sectionRegistered", lang)} items={grouped.REGISTERED} tone="neutral" canCheckIn={canCheckIn} settings={settings} labels={visitLabels} lang={lang} />
      <QueueSection title={t("visits.sectionReadyForPayment", lang)} items={grouped.READY_FOR_PAYMENT} tone="purple" canCheckIn={canCheckIn} settings={settings} labels={visitLabels} lang={lang} />
      <QueueSection title={t("visits.sectionPaid", lang)} items={grouped.PAID} tone="success" canCheckIn={canCheckIn} settings={settings} labels={visitLabels} lang={lang} />
    </>
  );
}

type QueueItem = {
  id: string;
  visitNo: number;
  customer: { fullName: string; phone: string };
  doctor: { name: string } | null;
  status: string;
  createdAt: Date;
};

function QueueSection({ title, items, tone, canCheckIn, settings, labels, lang }: { title: string; items: QueueItem[]; tone: SectionTone; canCheckIn: boolean; settings: Awaited<ReturnType<typeof getSettings>>; labels: Record<string, string>; lang: import("@/lib/i18n/dict").Lang }) {
  return (
    <Card className="mb-4">
      <CardHeader title={title} actions={<Badge tone={tone}>{items.length}</Badge>} />
      <CardBody className="p-0">
        {items.length === 0 ? (
          <p className="px-5 py-6 text-xs text-ink-400 text-center">{t("visits.noVisitsInState", lang)}</p>
        ) : (
          <div className="divide-y divide-ink-50">
            {items.map((v) => (
              <div key={v.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link href={`/visits/${v.id}`} className="font-bold text-primary-700 hover:underline tabular-nums">#{v.visitNo}</Link>
                <span className="font-medium">{v.customer.fullName}</span>
                <span className="text-xs text-ink-400" dir="ltr">{v.customer.phone}</span>
                <span className="text-xs text-ink-500">{t("visits.doctor", lang)}: {v.doctor?.name ?? t("today.notAssigned", lang)}</span>
                <span className="text-[11px] text-ink-400">{formatDateTime(v.createdAt, settings.timezone)}</span>
                <div className="mr-auto flex items-center gap-2">
                  <StatusBadge status={v.status} labels={labels} tones={undefined} />
                  {canCheckIn && v.status === "REGISTERED" && <CheckInButton visitId={v.id} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}