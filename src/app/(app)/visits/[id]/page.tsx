import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/authorize";
import { hasPermission, PERMISSIONS, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/time";
import { getVisit } from "@/server/services/visit-service";
import { getPatientHistorySummary } from "@/server/services/patient-history-service";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { StatusBadge, VISIT_STATUS_TONES } from "@/components/status";
import { CheckInButton, StartWithDoctorButton, ReturnToWaitingButton, CancelVisitButton, ReopenVisitButton } from "@/components/visits/visit-actions";
import { TreatmentEntryForm } from "@/components/visits/treatment-entry-form";
import { DiscountForm, VoidInvoiceButton } from "@/components/billing/payment-forms";
import { CollectPaymentModal } from "@/components/billing/collect-modal";
import { TreatmentDiscountForm } from "@/components/billing/treatment-discount-form";
import { getServices, getProductsWithBatches } from "@/components/visits/data-utils";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/dict";
import { statusLabels } from "@/lib/i18n/status";

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const settings = await getSettings();
  const lang = await getLang();
  const visitLabels = statusLabels("visit", lang);
  const visit = await getVisit(user, id);
  if (!visit) notFound();

  const canCheckIn = hasPermission(user, PERMISSIONS.VISIT_MANAGE);
  const canTreat = hasPermission(user, PERMISSIONS.TREATMENT_RECORD);
  const canCollect = hasPermission(user, PERMISSIONS.BILLING_COLLECT);
  const canVoid = hasPermission(user, PERMISSIONS.BILLING_VOID);
  const canDiscount = hasPermission(user, GRANULAR_PERMISSIONS.PRICING_DISCOUNT);
  const canSeeMedical = hasPermission(user, GRANULAR_PERMISSIONS.PATIENTS_READ_MEDICAL);

  const treatment = visit.treatment;
  const bill = visit.invoice;
  const finalAmount = bill ? Number(bill.finalAmount) : 0;
  const paidAmount = bill ? bill.payments.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + Number(p.amount), 0) : 0;
  const remaining = Math.max(0, finalAmount - paidAmount);
  const hasDiscount = bill ? Number(bill.discountAmount) > 0 && !!bill.discount : false;
  const treatmentDiscount = treatment ? Number(treatment.discountAmount ?? 0) > 0 : false;

  const isTreatable = ["WITH_DOCTOR", "REGISTERED", "TREATMENT_COMPLETED"].includes(visit.status) && canTreat;
  const draft = treatment
    ? {
        services: treatment.items.filter((i) => i.kind === "SERVICE").map((i) => ({
          serviceId: i.serviceId ?? "",
          description: i.description,
          linePrice: i.linePrice != null ? String(i.linePrice) : "",
        })),
        materials: treatment.items.filter((i) => i.kind === "MATERIAL").map((m) => ({
          productId: m.productId ?? "",
          batchId: m.productBatchId ?? "",
          qty: String(m.qtyUsed ?? 0),
        })),
        medications: (visit.medications ?? []).map((m) => ({
          medicationId: m.medicationId ?? "",
          name: m.name || m.medication?.name || "",
          qty: m.qty ?? "",
          dose: m.dose ?? "",
          instructions: m.instructions ?? "",
        })),
        basePrice: String(treatment.basePrice),
        notes: treatment.notes ?? "",
      }
    : null;

  const rows = treatment?.items ?? [];
  const history = await getPatientHistorySummary(user, visit.customerId);
  const canReopen = ["READY_FOR_PAYMENT", "PARTIALLY_PAID"].includes(visit.status) && canVoid;

  return (
    <>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">{t("visits.detailTitle", lang)} #{visit.visitNo}</h1>
          <p className="text-sm text-ink-500">
            {visit.customer.fullName} · <span dir="ltr">{visit.customer.phone}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={visit.status} labels={visitLabels} tones={VISIT_STATUS_TONES} />
          {visit.reopenedAt && (
            <Badge tone="warning">{t("visits.reopenedBy", lang)}{visit.reopenReason ? ` — ${visit.reopenReason}` : ""} {t("common.by", lang)} {visit.reopenedBy?.name ?? "—"}</Badge>
          )}
          {canCheckIn && visit.status === "REGISTERED" && <CheckInButton visitId={visit.id} />}
          {canTreat && visit.status === "WITH_DOCTOR" && <StartWithDoctorButton visitId={visit.id} />}
          {canTreat && visit.status === "WITH_DOCTOR" && <ReturnToWaitingButton visitId={visit.id} />}
          {["REGISTERED", "WAITING"].includes(visit.status) && <CancelVisitButton visitId={visit.id} />}
          {bill && ["READY_FOR_PAYMENT", "PARTIALLY_PAID", "PAID"].includes(visit.status) && canVoid && <VoidInvoiceButton invoiceId={bill.id} />}
          {canReopen && <ReopenVisitButton visitId={visit.id} />}
          <Link href="/visits" className="text-sm text-primary-700 hover:underline">← {t("visits.backToList", lang)}</Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader title={t("visits.patientRecord", lang)} actions={
              <div className="flex gap-2 text-[11px]">
                <Badge tone="neutral">{history.totalVisits} {t("visits.count", lang)}</Badge>
                {history.lastBotox && <Badge tone="purple">بوتوكس: {formatDateTime(history.lastBotox.date, settings.timezone)}</Badge>}
                {history.lastFiller && <Badge tone="purple">فيلر: {formatDateTime(history.lastFiller.date, settings.timezone)}</Badge>}
              </div>
            } />
            <CardBody>
              {history.lastTreatmentDate && (
                <p className="text-xs text-ink-500 mb-2">{t("visits.lastTreatmentLabel", lang)}: {formatDateTime(history.lastTreatmentDate, settings.timezone)}{history.lastVisitDate && history.lastVisitDate.getTime() !== history.lastTreatmentDate.getTime() ? ` · ${t("visits.lastVisitLabel", lang)}: ${formatDateTime(history.lastVisitDate, settings.timezone)}` : ""}</p>
              )}
              {canSeeMedical && history.history.length > 0 ? (
                <div className="space-y-3 max-h-80 overflow-y-auto pl-1">
                  {history.history.slice(0, 6).map((h) => (
                    <div key={h.visitId} className="rounded-xl border border-ink-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/visits/${h.visitId}`} className="font-medium text-sm text-primary-700 hover:underline">{t("visits.detailTitle", lang)} #{h.visitNo}</Link>
                        <span className="text-[11px] text-ink-400">{formatDateTime(h.date, settings.timezone)} · {h.doctor ?? t("visits.noDoctor", lang)}</span>
                      </div>
                      {h.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {h.items.slice(0, 4).map((it, i) => (
                            <span key={i} className="text-[11px] bg-ink-50 border border-ink-100 rounded-full px-2 py-0.5 text-ink-600">{it.description}</span>
                          ))}
                          {h.items.length > 4 && <span className="text-[11px] text-ink-400">+{h.items.length - 4}</span>}
                        </div>
                      )}
                      {h.medications.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-primary-700">{t("visits.medicationsLabel", lang)}: {h.medications.map((m) => m.name).filter(Boolean).join("، ")}</p>
                      )}
                      {h.discountAmount > 0 && <p className="mt-1 text-[11px] text-amber-600">{t("visits.discountLabel", lang)} {formatMoney(h.discountAmount, settings.currency, lang)}{h.discountReason ? ` (${h.discountReason})` : ""}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-400">
                  {canSeeMedical ? t("visits.firstVisit", lang) : t("visits.medicalBlocked", lang)}
                </p>
              )}
              {history.financial.length > 0 && (
                <div className="mt-3 pt-3 border-t border-ink-100">
                  <p className="text-[11px] font-medium text-ink-400 mb-1">{t("visits.lastCollections", lang)}</p>
                  <div className="space-y-1 text-xs text-ink-600">
                    {history.financial.slice(0, 3).map((f) => (
                      <div key={f.visitId} className="flex justify-between">
                        <span>#{f.visitNo} — {f.status === "PAID" ? t("visits.paidShort", lang) : t("visits.incomplete", lang)}</span>
                        <span className="tabular-nums font-medium">{formatMoney(f.finalAmount, settings.currency, lang)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {isTreatable ? (
            <Card>
              <CardHeader title={treatment ? t("visits.editTreatment", lang) : t("visits.recordTreatment", lang)} actions={treatment ? <Badge tone="info">{t("visits.draftSaved", lang)}</Badge> : undefined} />
              <CardBody>
                <TreatmentEntryForm
                  visitId={visit.id}
                  services={await getServices()}
                  products={await getProductsWithBatches()}
                  initial={draft}
                  inventoryDeductHint={
                    settings.inventoryDeductAt !== "PAYMENT"
                      ? t("visits.deductAtSend", lang)
                      : t("visits.deductAtPayment", lang)
                  }
                />
              </CardBody>
            </Card>
          ) : null}

          {treatment && !bill && canDiscount && ["WITH_DOCTOR", "TREATMENT_COMPLETED", "REGISTERED", "WAITING"].includes(visit.status) && (
            <Card>
              <CardHeader title={t("visits.discountOnVisit", lang)} subtitle={t("visits.discountSub", lang)} />
              <CardBody>
                <TreatmentDiscountForm visitId={visit.id} basePrice={Number(treatment.basePrice)} hasDiscount={treatmentDiscount} reasonRequired={settings.discountReasonRequired} />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t("visits.detailsTitle", lang)} />
            <CardBody>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">{t("visits.visitNumber", lang)}</span><span className="font-medium tabular-nums" dir="ltr">#{visit.visitNo}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">{t("common.date", lang)}</span><span className="font-medium">{formatDateTime(visit.scheduledAt ?? visit.createdAt, settings.timezone)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">{t("visits.doctor", lang)}</span><span className="font-medium">{visit.doctor?.name ?? t("today.notAssigned", lang)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">{t("visits.visitPrice", lang)}</span><span className="font-medium tabular-nums">{treatment ? formatMoney(treatment.basePrice, settings.currency, lang) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">{t("visits.paymentState", lang)}</span><span className="font-medium">{bill ? (bill.status === "PAID" ? t("visits.fullyPaidText", lang) : bill.status === "PARTIALLY_PAID" ? t("st.visit.partiallyPaid", lang) : t("st.invoice.unpaid", lang)) : t("visits.noInvoiceYet", lang)}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">{t("visits.patient", lang)}</span><Link href={`/patients/${visit.customerId}`} className="font-medium text-primary-700 hover:underline">{visit.customer.fullName}</Link></div>
              </div>

              {treatment && (
                <>
                  <h4 className="font-semibold text-sm mt-6 mb-2">{t("visits.treatmentsList", lang)}</h4>
                  <div className="rounded-xl border border-ink-100 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-ink-50 text-ink-500 text-[11px]">
                        <tr>
                          <th className="px-3 py-2 text-right font-medium">{t("visits.descCol", lang)}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("visits.priceCol", lang)}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-50">
                        {rows.filter((i) => i.kind === "SERVICE").map((it, i) => (
                          <tr key={i}><td className="px-3 py-2">{it.description}</td><td className="px-3 py-2 tabular-nums">{it.linePrice != null ? formatMoney(it.linePrice, settings.currency, lang) : "—"}</td></tr>
                        ))}
                        {rows.filter((i) => i.kind === "MATERIAL").map((m, i) => (
                          <tr key={`m${i}`}><td className="px-3 py-2 text-ink-500">{m.product?.name} × {Number(m.qtyUsed ?? 0)} {m.unit ?? m.product?.stockUnit ?? ""}</td><td className="px-3 py-2 text-ink-500">{t("visits.fromInventory", lang)}</td></tr>
                        ))}
                        {rows.length === 0 && <tr><td colSpan={2} className="px-3 py-3 text-ink-400 text-xs">{t("visits.noItems", lang)}</td></tr>}
                      </tbody>
                    </table>
                  </div>

                  {visit.medications.length > 0 && (
                    <>
                      <h4 className="font-semibold text-sm mt-6 mb-2">{t("visits.medicationsTitle", lang)}</h4>
                      <div className="space-y-2">
                        {visit.medications.map((m) => (
                          <div key={m.id} className="rounded-xl border border-ink-100 p-3 text-sm">
                            <p className="font-medium">{m.name || m.medication?.name || t("visits.medicationGeneric", lang)}</p>
                            <p className="mt-1 text-xs text-ink-500">
                              {[m.qty && `${t("visits.medicationQty", lang)}: ${m.qty}`, m.dose && `${t("visits.medicationDose", lang)}: ${m.dose}`, m.instructions && `${t("visits.medicationInstr", lang)}: ${m.instructions}`].filter(Boolean).join(" · ") || t("visits.noMedDetails", lang)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {treatmentDiscount && (
                    <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      {t("visits.discountApproved", lang)}: {formatMoney(treatment.discountAmount ?? 0, settings.currency, lang)}{` ${treatment.discount?.reason ? `(${treatment.discount.reason})` : ""}`} — {t("visits.finalLabel", lang)} {formatMoney(treatment.finalPrice ?? 0, settings.currency, lang)}
                    </p>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {bill ? (
            <Card>
              <CardHeader
                title={`${t("visits.accountNo", lang)} #${bill.invoiceNo}`}
                actions={<Badge tone={bill.status === "PAID" ? "success" : bill.status === "PARTIALLY_PAID" ? "warning" : "neutral"}>{bill.status === "PAID" ? t("visits.paidShort", lang) : bill.status === "PARTIALLY_PAID" ? t("visits.partialPaid", lang) : t("visits.due", lang)}</Badge>}
              />
              <CardBody>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500">{t("visits.servicesTotal", lang)}</span><span className="tabular-nums">{formatMoney(bill.originalAmount, settings.currency, lang)}</span></div>
                  {hasDiscount && bill.discount && (
                    <div className="flex justify-between text-amber-600">
                      <span>{t("visits.discountLabel", lang)}{bill.discount.reason ? ` (${bill.discount.reason})` : ""}</span>
                      <span className="tabular-nums">-{formatMoney(bill.discountAmount, settings.currency, lang)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold border-t border-ink-100 pt-2 text-base">
                    <span>{t("visits.netDue", lang)}</span>
                    <span className="tabular-nums">{formatMoney(bill.finalAmount, settings.currency, lang)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600 font-medium"><span>{t("visits.paidLabel", lang)}</span><span className="tabular-nums">{formatMoney(paidAmount, settings.currency, lang)}</span></div>
                  <div className="flex justify-between text-red-600 font-medium"><span>{t("visits.remainingLabel", lang)}</span><span className="tabular-nums">{formatMoney(remaining, settings.currency, lang)}</span></div>
                </div>

                {bill.payments.filter((p) => p.status === "COMPLETED").length > 0 && (
                  <div className="mt-4 border-t border-ink-100 pt-3 space-y-1.5">
                    {bill.payments.filter((p) => p.status === "COMPLETED").map((p) => (
                      <div key={p.id} className="flex justify-between text-xs text-ink-500">
                        <span>{p.method === "CASH" ? t("pay.cash", lang) : p.method === "CLIQ" ? t("pay.cliq", lang) : t("pay.visa", lang)} · {formatDateTime(p.paidAt, settings.timezone)}</span>
                        <span className="tabular-nums font-medium">{formatMoney(p.amount, settings.currency, lang)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {remaining > 0 && canCollect && (
                  <div className="mt-4 border-t border-ink-100 pt-4">
                    <CollectPaymentModal
                      invoiceId={bill.id}
                      finalAmount={finalAmount}
                      remaining={remaining}
                      splitEnabled={settings.splitPaymentEnabled}
                      partialEnabled={settings.partialPaymentEnabled}
                      canEditAmount={user.role === "SECRETARY"}
                      trigger={<Button size="sm">{t("billing.confirmCollect", lang)}</Button>}
                    />
                  </div>
                )}
                {canCollect && remaining === 0 && bill.status === "PAID" && (
                  <p className="mt-4 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{t("visits.fullyCollected", lang)}</p>
                )}
                {canDiscount && !hasDiscount && bill.status !== "PAID" && (
                  <div className="mt-4 border-t border-ink-100 pt-4">
                    <DiscountForm invoiceId={bill.id} originalAmount={Number(bill.originalAmount)} hasDiscount={false} reasonRequired={settings.discountReasonRequired} />
                  </div>
                )}
                {!canDiscount && canCollect && !hasDiscount && bill.status !== "PAID" && (
                  <p className="mt-3 text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {t("visits.discountNeedsPermission", lang)}
                  </p>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader title={t("visits.account", lang)} />
              <CardBody>
                <p className="text-xs text-ink-400">{t("visits.noInvoiceBody", lang)}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title={t("visits.patient", lang)} />
            <CardBody>
              <p className="font-semibold">{visit.customer.fullName}</p>
              <p className="text-xs text-ink-500" dir="ltr">{visit.customer.phone}</p>
              <Link href={`/patients/${visit.customerId}`} className="text-xs text-primary-700 hover:underline mt-2 inline-block">{t("visits.patientFile", lang)} ←</Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
