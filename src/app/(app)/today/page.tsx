import Link from "next/link";
import { requirePermission } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { getTodayQueue, getDoctorQueue } from "@/server/services/visit-service";
import { db } from "@/lib/db";
import { Card, CardHeader, CardBody, Badge, EmptyState } from "@/components/ui/display";
import { Table, Td } from "@/components/ui/table";
import { StatusBadge } from "@/components/status";
import { NewVisitModal } from "@/components/today/new-visit-modal";
import { AcceptVisitButton } from "@/components/today/doctor-actions";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { statusLabels, localeFor } from "@/lib/i18n/status";

export async function generateMetadata() {
  const lang = await getLang();
  return { title: t("today.title", lang) };
}

export default async function TodayPage() {
  const user = await requirePermission(GRANULAR_PERMISSIONS.APPOINTMENTS_READ);
  const settings = await getSettings();
  const lang = await getLang();
  const visitLabels = statusLabels("visit", lang);
  const locale = localeFor(lang);
  const isDoctor = user.role === "DOCTOR" || user.role === "MAIN_DOCTOR";

  if (isDoctor) {
    const { visits, counts } = await getDoctorQueue(user);
    const myWaiting = visits.filter((v) => v.status === "WAITING" || v.status === "REGISTERED");
    const myWithDoctor = visits.filter((v) => v.status === "WITH_DOCTOR");
    const myDone = visits.filter((v) => ["TREATMENT_COMPLETED", "READY_FOR_PAYMENT", "PARTIALLY_PAID"].includes(v.status));

    return (
      <>
        <h1 className="text-xl font-bold text-ink-900 mb-1">{t("today.myVisits", lang)}</h1>
        <p className="text-sm text-ink-500 mb-5">{new Date().toLocaleDateString(locale)} — {t("today.welcomeNext", lang)}</p>

        <div className="flex gap-2 text-xs mb-5">
          <Badge tone="warning">{counts.waiting} {t("today.waitingForMe", lang)}</Badge>
          <Badge tone="info">{counts.withDoctor} {t("today.withMeNow", lang)}</Badge>
          <Badge tone="success">{counts.completed} {t("today.doneToday", lang)}</Badge>
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mb-4">
          <Card>
            <CardHeader title={t("today.waitingReception", lang)} />
            <CardBody className="space-y-2 p-4">
              {myWaiting.length === 0 ? (
                <p className="text-xs text-ink-400 py-4 text-center">{t("today.noWaiting", lang)}</p>
              ) : (
                myWaiting.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 p-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{v.customer.fullName}</p>
                      <p className="text-[11px] text-ink-400" dir="ltr">{v.customer.phone ?? t("today.noPhone", lang)}</p>
                      <p className="text-[11px] text-ink-400 mt-0.5">#{v.visitNo} · {formatDateTime(v.scheduledAt ?? v.createdAt, settings.timezone)}</p>
                      {v.medications.length > 0 && (
                        <p className="text-[11px] text-primary-700 mt-0.5">{t("today.preprescription", lang)}: {v.medications.map((m) => m.medication?.name ?? m.name).filter(Boolean).join("، ")}</p>
                      )}
                    </div>
                    <AcceptVisitButton visitId={v.id} label={t("today.accept", lang)} />
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("today.withMeNow", lang)} />
            <CardBody className="space-y-2 p-4">
              {myWithDoctor.length === 0 ? (
                <p className="text-xs text-ink-400 py-4 text-center">{t("today.noOngoing", lang)}</p>
              ) : (
                myWithDoctor.map((v) => (
                  <Link key={v.id} href={`/visits/${v.id}`} className="block rounded-xl border border-primary-200 bg-primary-50/50 p-3 hover:bg-primary-50 transition-colors">
                    <p className="font-medium text-sm truncate">{v.customer.fullName}</p>
                    <p className="text-[11px] text-ink-400 mt-0.5">#{v.visitNo} — {t("today.openToRecord", lang)}</p>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={t("today.completedToday", lang)} />
            <CardBody className="space-y-2 p-4">
              {myDone.length === 0 ? (
                <p className="text-xs text-ink-400 py-4 text-center">{t("today.noDone", lang)}</p>
              ) : (
                myDone.slice(0, 8).map((v) => (
                  <Link key={v.id} href={`/visits/${v.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 p-3 hover:bg-ink-50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{v.customer.fullName}</p>
                      <p className="text-[11px] text-ink-400">#{v.visitNo}</p>
                    </div>
                    <StatusBadge status={v.status} labels={visitLabels} tones={undefined} />
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </>
    );
  }

  const [visits, doctors, customers] = await Promise.all([
    getTodayQueue(user),
    db.user.findMany({ where: { role: { in: ["OWNER", "MAIN_DOCTOR", "DOCTOR"] }, status: "ACTIVE" }, select: { id: true, name: true, englishName: true }, orderBy: { name: "asc" } }),
    db.customer.findMany({ where: { status: "ACTIVE" }, select: { id: true, fullName: true, phone: true }, orderBy: { fullName: "asc" } }),
  ]);

  const counts = {
    total: visits.length,
    waiting: visits.filter((v) => v.status === "WAITING").length,
    inProgress: visits.filter((v) => v.status === "WITH_DOCTOR").length,
    done: visits.filter((v) => ["TREATMENT_COMPLETED", "READY_FOR_PAYMENT", "PARTIALLY_PAID", "PAID", "CLOSED"].includes(v.status)).length,
  };

  return (
    <>
      <h1 className="text-xl font-bold text-ink-900 mb-1">{t("today.title", lang)}</h1>
      <p className="text-sm text-ink-500 mb-5">{new Date().toLocaleDateString(locale)}</p>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <NewVisitModal doctors={doctors} customers={customers} />
        <div className="flex gap-2 text-xs">
          <Badge tone="neutral">{counts.total} {t("today.countAppointments", lang)}</Badge>
          <Badge tone="warning">{counts.waiting} {t("today.countWaiting", lang)}</Badge>
          <Badge tone="info">{counts.inProgress} {t("today.countOngoing", lang)}</Badge>
          <Badge tone="success">{counts.done} {t("today.countDone", lang)}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader title={t("today.listTitle", lang)} />
        <CardBody className="p-0">
          {visits.length === 0 ? (
            <EmptyState title={t("today.empty", lang)} description={t("today.emptyDesc", lang)} />
          ) : (
            <Table headers={["#", t("common.time", lang), t("visits.customer", lang), t("today.doctor", lang), t("common.status", lang), ""]}>
              {visits.map((v) => (
                <tr key={v.id}>
                  <Td className="font-bold tabular-nums">{v.visitNo}</Td>
                  <Td className="text-xs">{formatDateTime(v.scheduledAt ?? v.createdAt, settings.timezone)}</Td>
                  <Td>
                    <span className="font-medium">{v.customer.fullName}</span>
                    <span className="block text-[11px] text-ink-400" dir="ltr">{v.customer.phone}</span>
                  </Td>
                  <Td>{v.doctor?.name ?? "—"}</Td>
                  <Td><StatusBadge status={v.status} labels={visitLabels} tones={undefined} /></Td>
                  <Td><Link href={`/visits/${v.id}`} className="text-xs font-medium text-primary-700 hover:underline">{t("today.open", lang)}</Link></Td>
                </tr>
              ))}
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
