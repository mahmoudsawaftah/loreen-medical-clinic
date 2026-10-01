import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/time";
import { followUpQueue } from "@/server/services/crm-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { StatusBadge, FOLLOW_UP_STATUS_TONES } from "@/components/status";
import { statusLabels } from "@/lib/i18n/status";
import { CompleteFollowUpModal, SendMessageModal } from "@/components/crm/crm-forms";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function CrmPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const queue = await followUpQueue(user, { daysAhead: 30 });

  const followUpLabels = statusLabels("followUp", lang);
  const followUpTypeLabels = statusLabels("followUpType", lang);

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("crm.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{t("crm.subtitle", lang).replace("{n}", String(queue.tasks.length)).replace("{m}", String(queue.birthdayCustomers.length))}</p>

      <Card className="mb-6 border-primary-100">
        <CardHeader title={t("crm.birthdaysTitle", lang)} actions={<Badge tone="info">{queue.birthdayCustomers.length}</Badge>} />
        <CardBody className="p-0">
          {queue.birthdayCustomers.length === 0 ? (
            <p className="px-5 py-6 text-xs text-ink-400 text-center">{t("crm.noBirthdays", lang)}</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {queue.birthdayCustomers.map(({ customer, next }) => (
                <div key={customer.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <Link href={`/patients/${customer.id}`} className="font-medium text-primary-700 hover:underline">{customer.fullName}</Link>
                  <span className="text-xs text-ink-500">🎂 {formatDate(next, settings.timezone)}</span>
                  <span className="text-[11px] text-ink-400" dir="ltr">{customer.phone}</span>
                  <div className="mr-auto">
                    <SendMessageModal customerId={customer.id} customerName={customer.fullName} phone={customer.phone ?? ""} channelDefault={settings.messagingChannel} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t("crm.pendingTitle", lang)} actions={<Badge tone="neutral">{queue.tasks.length}</Badge>} />
        <CardBody className="p-0">
          {queue.tasks.length === 0 ? (
            <p className="px-5 py-8 text-xs text-ink-400 text-center">{t("crm.noPending", lang)}</p>
          ) : (
            <div className="divide-y divide-ink-50">
              {queue.tasks.map((task) => (
                <div key={task.id} className="px-4 sm:px-5 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Link href={`/patients/${task.customer.id}`} className="font-medium text-primary-700 hover:underline">{task.customer.fullName}</Link>
                    <span className="text-xs text-ink-500">{task.type === "BIRTHDAY" ? t("crm.birthday", lang) : followUpTypeLabels[task.type] ?? task.type}</span>
                    <span className="text-xs tabular-nums text-ink-500">{t("crm.due", lang)}: {formatDate(task.dueDate, queue.timezone)}</span>
                    {task.appointmentVisit?.scheduledAt && <span className="text-xs tabular-nums text-primary-700">{t("crm.appointment", lang)}: {formatDate(task.appointmentVisit.scheduledAt, queue.timezone)}</span>}
                    {task.visit && <span className="text-[11px] text-ink-400">{t("patients.visitNo", lang).replace("{n}", String(task.visit.visitNo))}</span>}
                    <StatusBadge status={task.status} labels={followUpLabels} tones={FOLLOW_UP_STATUS_TONES} />
                    <div className="mr-auto flex items-center gap-2">
                      <SendMessageModal customerId={task.customer.id} customerName={task.customer.fullName} phone={task.customer.phone ?? ""} channelDefault={settings.messagingChannel} taskId={task.id} />
                      <CompleteFollowUpModal taskId={task.id} />
                    </div>
                  </div>
                  {task.notes && <p className="text-[11px] text-ink-500 mt-1">{task.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
