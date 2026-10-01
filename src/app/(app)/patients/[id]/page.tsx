import Link from "next/link";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { getPatient, patientAggregates } from "@/server/services/patient-service";
import { PageHeader, Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { StatusBadge, VISIT_STATUS_TONES } from "@/components/status";
import { statusLabels, localeFor } from "@/lib/i18n/status";
import { NewVisitButton } from "@/components/patients/new-visit-button";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";

export default async function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const lang = await getLang();
  const { id } = await params;
  const [patient, aggregates] = await Promise.all([getPatient(user, id), patientAggregates(id)]);

  const canViewMedical = hasPermission(user, PERMISSIONS.PATIENT_VIEW_MEDICAL);
  const canViewFinancial = hasPermission(user, PERMISSIONS.PATIENT_VIEW_FINANCIAL);
  const canCreateVisit = hasPermission(user, PERMISSIONS.VISIT_MANAGE);
  const birthdays = patient.birthDate ? nextBirthday(patient.birthDate) : null;
  const visitLabels = statusLabels("visit", lang);

  return (
    <>
      <PageHeader
        title={patient.fullName}
        subtitle={`${t("patients.profileNo", lang).replace("{n}", String(patient.customerNo))} · ${patient.phone}`}
        actions={canCreateVisit ? <NewVisitButton customerId={patient.id} customerName={patient.fullName} /> : undefined}
      />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title={t("patients.contactInfo", lang)} />
          <CardBody className="space-y-2 text-sm">
            <Row label={t("patients.phone", lang)}><span dir="ltr">{patient.phone}</span></Row>
            <Row label={t("patients.phone2", lang)}>{patient.phone2 ? <span dir="ltr">{patient.phone2}</span> : "—"}</Row>
            <Row label={t("patients.email", lang)}>{patient.email || "—"}</Row>
            <Row label={t("patients.birthdate", lang)}>{patient.birthDate ? patient.birthDate.toLocaleDateString(localeFor(lang)) : "—"}</Row>
            <Row label={t("patients.nextBirthday", lang)}>{birthdays ? birthdays.toLocaleDateString(localeFor(lang)) : "—"}</Row>
            <Row label={t("patients.source", lang)}>{patient.source || "—"}</Row>
            <Row label={t("patients.marketingConsentLabel", lang)}>{patient.marketingConsent ? t("common.yes", lang) : t("common.no", lang)}</Row>
            {patient.tags.length > 0 && (
              <Row label={t("patients.tags", lang)}>
                <div className="flex flex-wrap gap-1">{patient.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
              </Row>
            )}
            <Row label={t("patients.notes", lang)}>{patient.notes || "—"}</Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("patients.totals", lang)} />
          <CardBody className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-xl bg-ink-50"><p className="text-[11px] text-ink-500">{t("visits.count", lang)}</p><p className="text-xl font-bold">{aggregates.visitCount}</p></div>
            <div className="p-3 rounded-xl bg-ink-50"><p className="text-[11px] text-ink-500">{t("patients.totalInvoices", lang)}</p><p className="text-xl font-bold tabular-nums">{aggregates.totalSpent} د.أ</p></div>
            {canViewFinancial && <div className="p-3 rounded-xl bg-emerald-50 col-span-2"><p className="text-[11px] text-emerald-700">{t("patients.totalCollected", lang)}</p><p className="text-xl font-bold tabular-nums">{aggregates.totalPaid} د.أ</p></div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t("patients.pendingFollowUps", lang)} />
          <CardBody className="space-y-2">
            {patient.followUps.filter((f) => f.status === "PENDING").slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm border-b border-ink-50 pb-2">
                <span>{f.notes || t("followUp.followUp", lang)}</span>
                <Badge tone="warning">{f.dueDate.toLocaleDateString(localeFor(lang))}</Badge>
              </div>
            ))}
            {patient.followUps.filter((f) => f.status === "PENDING").length === 0 && <p className="text-xs text-ink-400">{t("dash.noPendingFollowUps", lang)}</p>}
            <Link href={`/crm?customer=${patient.id}`} className="text-primary-700 text-xs font-medium hover:underline block pt-1">{t("patients.manageFollowUps", lang)} ←</Link>
          </CardBody>
        </Card>
      </div>

      {canViewMedical && (
        <Card className="mt-4">
          <CardHeader title={t("patients.medicalHistory", lang)} />
          <CardBody className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-ink-700 mb-1">{t("patients.previousProcedures", lang)}</p>
              <div className="flex flex-wrap gap-1.5">
                {patient.medicalProfile?.previousProcedures.length ? patient.medicalProfile.previousProcedures.map((p) => <Badge key={p} tone="info">{p}</Badge>) : <span className="text-ink-400">{t("patients.noneFound", lang)}</span>}
              </div>
            </div>
            <div>
              <p className="font-medium text-ink-700 mb-1">{t("patients.allergiesLabel", lang)}</p>
              <p className="text-ink-600">{patient.medicalProfile?.allergies || "—"}</p>
            </div>
            <div>
              <p className="font-medium text-ink-700 mb-1">{t("patients.doctorNotes", lang)}</p>
              <p className="text-ink-600 whitespace-pre-wrap">{patient.medicalProfile?.medicalNotes || "—"}</p>
            </div>
            {patient.medicalEvents.length > 0 && (
              <div className="pt-2 border-t border-ink-100">
                <p className="font-medium text-ink-700 mb-2">{t("patients.medicalEvents", lang)}</p>
                <div className="space-y-1.5">
                  {patient.medicalEvents.map((e) => (
                    <div key={e.id} className="flex items-start justify-between text-xs">
                      <span>{e.procedureType}{e.area ? ` — ${e.area}` : ""}{e.productName ? ` (${e.productName})` : ""}</span>
                      <span className="text-ink-400">{e.procedureDate?.toLocaleDateString(localeFor(lang)) ?? ""} · {e.createdBy?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader title={t("patients.visitsTimeline", lang)} />
        <CardBody className="p-0">
          {patient.visits.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-400 text-center">{t("patients.noVisitsYet", lang)}</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {patient.visits.map((v) => (
                <div key={v.id} className="px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <Link href={`/visits/${v.id}`} className="font-bold text-primary-700 hover:underline tabular-nums">{t("patients.visitNo", lang).replace("{n}", String(v.visitNo))}</Link>
                  <span className="text-xs text-ink-500">{v.createdAt.toLocaleDateString(localeFor(lang))}</span>
                  <span className="text-xs">{t("patients.doctor", lang)}: {v.doctor?.name ?? "—"}</span>
                  <StatusBadge status={v.status} labels={visitLabels} tones={VISIT_STATUS_TONES} />
                  {v.treatment && (
                    <span className="text-xs text-ink-600">
                      {v.treatment.items.filter((i) => i.kind === "SERVICE").map((i) => i.description).slice(0, 2).join("، ") || t("patients.session", lang)}
                    </span>
                  )}
                  {canViewFinancial && v.invoice && v.invoice.status !== "VOID" && (
                    <span className="text-sm font-bold tabular-nums text-emerald-700">{v.invoice.finalAmount.toString()} د.أ</span>
                  )}
                  {canViewFinancial && v.invoice && Number(v.invoice.discountAmount) > 0 && (
                    <Badge tone="warning">{t("patients.discount", lang).replace("{n}", v.invoice.discountAmount.toString())}</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-500 text-xs">{label}</span>
      <span className="text-ink-800 text-right">{children}</span>
    </div>
  );
}

function nextBirthday(birthDate: Date): Date | null {
  const now = new Date();
  const next = new Date(now.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  if (next.getTime() - now.getTime() > 365 * 24 * 3600 * 1000) return null;
  return next;
}