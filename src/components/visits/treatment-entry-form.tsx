"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveTreatmentDraftAction, sendToCashierAction } from "@/server/actions/operations-actions";
import { useActionForm } from "@/components/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";
import { localeFor } from "@/lib/i18n/status";
import { validateTreatmentForm } from "@/lib/visits/treatment-validation";
import { localizedName, localizedInventoryTerm } from "@/lib/i18n/entities";

export interface ServiceOption { id: string; name: string; englishName: string | null; category: string | null; defaultPrice: string | null }
export interface ProductOption {
  id: string;
  name: string;
  englishName: string | null;
  stockUnit: string;
  batches: { id: string; batchNo: string | null; expiryDate: Date | null; qtyOnHand: string }[];
}

interface MaterialRow { productId: string; batchId: string; qty: string }
interface ServiceRow { serviceId: string; description: string; linePrice: string }
interface MedicationRow { medicationId: string; name: string; qty: string; dose: string; instructions: string }

interface MedicationSuggestion { id: string; name: string }

function isReviewProcedure(description: string): boolean {
  return /بوتوكس|botox|فيلر|filler/i.test(description);
}

function MedicationPicker({ onPick }: { onPick: (m: MedicationSuggestion) => void }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MedicationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) return;
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/medications?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        if (res.ok) setResults(((await res.json()) as { items: MedicationSuggestion[] }).items);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  const pick = (m: MedicationSuggestion) => {
    onPick(m);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input value={query} placeholder={t("visits.medicationSearch")} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full right-0 left-0 mt-1 rounded-lg border border-ink-200 bg-white shadow-lg overflow-hidden">
          {results.map((m) => (
            <button key={m.id} type="button" onClick={() => pick(m)} className="block w-full text-right px-3 py-2 text-sm hover:bg-ink-50">
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TreatmentEntryForm({
  visitId,
  services,
  products,
  initial,
  inventoryDeductHint,
}: {
  visitId: string;
  services: ServiceOption[];
  products: ProductOption[];
  initial?: { services: ServiceRow[]; materials: MaterialRow[]; medications?: MedicationRow[]; basePrice: string; notes: string } | null;
  inventoryDeductHint: string;
}) {
  const router = useRouter();
  const { t, lang } = useLang();
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>(initial?.services ?? [{ serviceId: "", description: "", linePrice: "" }]);
  const [materialRows, setMaterialRows] = useState<MaterialRow[]>(initial?.materials ?? []);
  const [medicationRows, setMedicationRows] = useState<MedicationRow[]>(initial?.medications ?? []);
  const [basePrice, setBasePrice] = useState(initial?.basePrice ?? "");
  const [basePriceTouched, setBasePriceTouched] = useState(Boolean(initial?.basePrice));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");
  const { run, pending, error, success, setError } = useActionForm();
  const reviewProcedure = serviceRows.some((row) => isReviewProcedure(row.description));

  function updateServiceRows(nextRows: ServiceRow[]) {
    setServiceRows(nextRows);
    if (!basePriceTouched) {
      const total = nextRows.reduce((sum, row) => sum + (Number(row.linePrice) || 0), 0);
      setBasePrice(total > 0 ? String(total) : "");
    }
  }

  function addService() { setServiceRows([...serviceRows, { serviceId: "", description: "", linePrice: "" }]); }
  function addMaterial() { setMaterialRows([...materialRows, { productId: "", batchId: "", qty: "" }]); }
  function addMedication() { setMedicationRows([...medicationRows, { medicationId: "", name: "", qty: "", dose: "", instructions: "" }]); }

  const medicationsPayload = () =>
    medicationRows.filter((r) => r.name.trim()).map((r) => ({
      medicationId: r.medicationId || null,
      name: r.name.trim(),
      qty: r.qty.trim() || null,
      dose: r.dose.trim() || null,
      instructions: r.instructions.trim() || null,
    }));

  const draftPayload = () => ({
    services: serviceRows.filter((r) => r.description.trim()).map((r) => ({
      serviceId: r.serviceId || null,
      description: r.description,
      linePrice: r.linePrice ? Number(r.linePrice) : null,
    })),
    materials: materialRows.filter((r) => r.productId && Number(r.qty) > 0).map((r) => ({
      productId: r.productId,
      batchId: r.batchId || null,
      qtyUsed: Number(r.qty),
    })),
    medications: medicationsPayload(),
    notes: notes || null,
    basePrice: Number(basePrice) || 0,
  });

  function validateForm() {
    const errorKey = validateTreatmentForm({
      services: serviceRows,
      materials: materialRows,
      basePrice,
    });
    if (errorKey) {
      setError(t(errorKey));
      return false;
    }
    return true;
  }

  function saveDraft() {
    if (!validateForm()) return;
    run(() => saveTreatmentDraftAction({ visitId, data: draftPayload() }));
  }

  function sendToCashier() {
    if (!validateForm()) return;
    run(async () => {
      const draft = await saveTreatmentDraftAction({ visitId, data: draftPayload() });
      if (!draft.ok) return draft;
      const result = await sendToCashierAction({
        visitId,
        followUps: reviewProcedure || followUpDate ? [{
          dueDate: reviewProcedure ? undefined : followUpDate,
          notes: followUpNotes || (reviewProcedure ? t("visits.reviewFollowUpDefault") : t("visits.followUpDefault")),
          type: reviewProcedure ? "REMINDER" : "FOLLOW_UP",
          scheduleAppointment: reviewProcedure,
        }] : [],
      });
      return result;
    }, () => router.push("/ready-for-payment"));
  }

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); sendToCashier(); }}>
      <FormError message={translateServerError(error, t)} />
      <FormSuccess message={success} />

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-sm">{t("visits.proceduresTitle")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addService}>+ {t("visits.addService")}</Button>
        </div>
        <div className="space-y-2">
          {serviceRows.map((row, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
              <Select
                value={row.serviceId}
                onChange={(e) => {
                  const svc = services.find((s) => s.id === e.target.value);
                  updateServiceRows(serviceRows.map((r, j) => j === i ? {
                    ...r,
                    serviceId: e.target.value,
                    description: svc ? localizedName(svc.name, svc.englishName, lang) : r.description,
                    linePrice: svc?.defaultPrice ?? r.linePrice,
                  } : r));
                }}
              >
                <option value="">{t("visits.selectService")}</option>
                {services.map((s) => <option key={s.id} value={s.id}>{localizedName(s.name, s.englishName, lang)}</option>)}
              </Select>
              <Field label={t("visits.descCol")}>
                <Input value={row.description} onChange={(e) => setServiceRows(serviceRows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} />
              </Field>
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => updateServiceRows(serviceRows.filter((_, j) => j !== i))}>✕</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-sm">{t("visits.materialsTitle")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addMaterial}>+ {t("visits.addMaterial")}</Button>
        </div>
        <p className="text-[11px] text-ink-400 mb-2">{inventoryDeductHint}</p>
        <div className="space-y-2">
          {materialRows.map((row, i) => {
            const product = products.find((p) => p.id === row.productId);
            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                <Select
                  value={row.productId}
                  onChange={(e) => setMaterialRows(materialRows.map((r, j) => j === i ? { ...r, productId: e.target.value, batchId: "" } : r))}
                >
                  <option value="">{t("visits.selectProduct")}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{localizedName(p.name, p.englishName, lang)} ({localizedInventoryTerm(p.stockUnit, lang)})</option>)}
                </Select>
                {product && product.batches.length > 0 ? (
                  <Select value={row.batchId} onChange={(e) => setMaterialRows(materialRows.map((r, j) => j === i ? { ...r, batchId: e.target.value } : r))}>
                    <option value="">{t("visits.autoBatch")}</option>
                    {product.batches.map((b) => (
                      <option key={b.id} value={b.id}>{t("visits.batchOption").replace("{no}", b.batchNo ?? "—").replace("{qty}", b.qtyOnHand)}{b.expiryDate ? ` · ${new Date(b.expiryDate).toLocaleDateString(localeFor(lang))}` : ""}</option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-xs text-ink-400 py-2">{t("visits.autoConsume")}</span>
                )}
                <Field label={t("visits.qtyLabel").replace("{unit}", product?.stockUnit ?? "")}>
                  <Input value={row.qty} inputMode="decimal" placeholder="0" onChange={(e) => setMaterialRows(materialRows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} />
                </Field>
                <Button type="button" variant="ghost" size="sm" onClick={() => setMaterialRows(materialRows.filter((_, j) => j !== i))}>✕</Button>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold text-sm">{t("visits.medicationsTitle")}</h3>
          <Button type="button" variant="outline" size="sm" onClick={addMedication}>+ {t("visits.addMedication")}</Button>
        </div>
        <div className="space-y-2">
          {medicationRows.map((row, i) => (
            <div key={i} className="rounded-xl border border-ink-100 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_36px] gap-2 items-end">
                <MedicationPicker onPick={(m) => setMedicationRows(medicationRows.map((r, j) => j === i ? { ...r, medicationId: m.id, name: m.name } : r))} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setMedicationRows(medicationRows.filter((_, j) => j !== i))}>✕</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Field label={t("visits.medNameManual")}>
                  <Input value={row.name} onChange={(e) => setMedicationRows(medicationRows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} placeholder={t("visits.medNamePh")} />
                </Field>
                <Field label={t("visits.medicationQty")}>
                  <Input value={row.qty} onChange={(e) => setMedicationRows(medicationRows.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} placeholder={t("visits.qtyExample")} />
                </Field>
                <Field label={t("visits.medicationDose")}>
                  <Input value={row.dose} onChange={(e) => setMedicationRows(medicationRows.map((r, j) => j === i ? { ...r, dose: e.target.value } : r))} placeholder={t("visits.doseExample")} />
                </Field>
                <Field label={t("visits.medicationInstr")} className="sm:col-span-3">
                  <Input value={row.instructions} onChange={(e) => setMedicationRows(medicationRows.map((r, j) => j === i ? { ...r, instructions: e.target.value } : r))} placeholder={t("visits.instrPh")} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label={t("visits.basePriceLabel")} hint={t("visits.basePriceHint")}>
          <Input value={basePrice} inputMode="decimal" placeholder="0.000" onChange={(e) => { setBasePriceTouched(true); setBasePrice(e.target.value); }} />
        </Field>
        {reviewProcedure ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50/60 p-3 text-xs">
            <p className="font-semibold text-primary-900">{t("visits.reviewAppointmentAutomatic")}</p>
            <p className="mt-1 text-primary-700">{t("visits.reviewAppointmentBotoxHint")}</p>
          </div>
        ) : (
          <Field label={t("visits.followUpDate")}>
            <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </Field>
        )}
        <Field label={t("visits.followUpNotes")}>
          <Input value={followUpNotes} onChange={(e) => setFollowUpNotes(e.target.value)} />
        </Field>
      </div>

      <Field label={t("visits.sessionNotes")}>
        <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" loading={pending} onClick={saveDraft}>{t("visits.saveDraftBtn")}</Button>
        <Button type="submit" loading={pending}>{t("visits.sendToCashierBtn")} ←</Button>
      </div>
    </form>
  );
}
