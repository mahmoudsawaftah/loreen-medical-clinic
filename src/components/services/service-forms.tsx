"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Select } from "@/components/ui/form";
import { Modal, useModal, ModalFormStatus } from "@/components/modals";
import { createServiceAction, updateServiceAction, setServiceActiveAction, deleteServiceAction } from "@/server/actions/catalog-actions";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

interface ServiceFormData {
  id: string;
  name: string;
  englishName: string | null;
  category: string | null;
  defaultPrice: number | null;
  durationMinutes: number | null;
  notes: string | null;
  materials: { name: string; qty: string | number; unit: string | null }[];
  active: boolean;
}

const CATEGORIES = ["حقن", "تقشير", "تنظيف", "علاج", "عن العناية"];

function ServiceForm({ initial, onDone }: { initial?: ServiceFormData; onDone: () => void }) {
  const { lang } = useLang();
  const [name, setName] = useState(initial?.name ?? "");
  const [englishName, setEnglishName] = useState(initial?.englishName ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [defaultPrice, setDefaultPrice] = useState(initial?.defaultPrice != null ? String(initial.defaultPrice) : "");
  const [durationMinutes, setDurationMinutes] = useState(initial?.durationMinutes != null ? String(initial.durationMinutes) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [materials, setMaterials] = useState(initial?.materials ?? []);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setSuccess(null);
    const input = {
      name,
      englishName: englishName || null,
      category: category || null,
      defaultPrice: defaultPrice ? Number(defaultPrice) : null,
      durationMinutes: durationMinutes ? Number(durationMinutes) : null,
      notes: notes || null,
      defaultMaterials: materials.map((m) => ({ name: m.name, qty: m.qty, unit: m.unit })),
    };
    startTransition(async () => {
      const res = initial
        ? await updateServiceAction({ serviceId: initial.id, data: input })
        : await createServiceAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(initial ? t("services.updated", lang) : t("services.added", lang));
      setTimeout(onDone, 400);
    });
  };

  return (
    <div className="space-y-3">
      <ModalFormStatus error={error} success={success} />
      <Field label={t("services.name", lang)}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("services.namePh", lang)} />
      </Field>
      <Field label={t("services.englishName", lang)}>
        <Input value={englishName} onChange={(e) => setEnglishName(e.target.value)} dir="ltr" placeholder="Botox forehead" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("services.category", lang)}>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t("services.without", lang)}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label={t("services.duration", lang)}>
          <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </Field>
      </div>
      <Field label={t("services.priceLabel", lang)}>
        <Input type="number" min={0} step="0.5" value={defaultPrice} onChange={(e) => setDefaultPrice(e.target.value)} />
      </Field>
      <Field label={t("services.defaultMaterials", lang)} hint={t("services.materialsHint", lang)}>
        <div className="space-y-2">
          {materials.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_80px_36px] gap-2">
              <Input value={m.name} onChange={(e) => setMaterials((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder={t("services.materialPh", lang)} />
              <Input value={String(m.qty)} onChange={(e) => setMaterials((prev) => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} placeholder={t("services.qtyPh", lang)} />
              <Input value={m.unit ?? ""} onChange={(e) => setMaterials((prev) => prev.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} placeholder={t("services.unitPh", lang)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setMaterials((prev) => prev.filter((_, j) => j !== i))}>✕</Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={() => setMaterials((prev) => [...prev, { name: "", qty: "", unit: "" }])}>{t("services.addMaterial", lang)}</Button>
        </div>
      </Field>
      <Field label={t("patients.notes", lang)}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={onDone} disabled={pending}>{t("common.close", lang)}</Button>
        <Button type="button" size="sm" onClick={submit} disabled={pending || !name.trim()}>{pending ? t("services.saving", lang) : initial ? t("services.saveEdits", lang) : t("services.add", lang)}</Button>
      </div>
    </div>
  );
}

export function ServiceCreateModal() {
  const { open, openModal, closeModal } = useModal();
  const { lang } = useLang();
  return (
    <>
      <Button size="sm" onClick={openModal}>+ {t("services.new", lang)}</Button>
      <Modal open={open} onClose={closeModal} title={t("services.newTitle", lang)} subtitle={t("services.newSub", lang)}>
        <ServiceForm onDone={closeModal} />
      </Modal>
    </>
  );
}

export function ServiceEditModal({ service }: { service: ServiceFormData }) {
  const { open, openModal, closeModal } = useModal();
  const { lang } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggleActive = () => {
    startTransition(async () => {
      const res = await setServiceActiveAction({ serviceId: service.id, active: !service.active });
      if (!res.ok) setError(res.error);
      else window.location.reload();
    });
  };

  const remove = () => {
    if (!window.confirm(t("services.deleteConfirm", lang).replace("{name}", service.name))) return;
    startTransition(async () => {
      const res = await deleteServiceAction({ serviceId: service.id });
      if (!res.ok) setError(res.error);
      else window.location.reload();
    });
  };

  return (
    <>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openModal}>{t("services.edit", lang)}</Button>
        <Button type="button" variant="outline" size="sm" onClick={toggleActive} disabled={pending}>{service.active ? t("services.disable", lang) : t("services.enable", lang)}</Button>
        <Button type="button" variant="ghost" size="sm" onClick={remove} disabled={pending}>{t("services.delete", lang)}</Button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      <Modal open={open} onClose={closeModal} title={t("services.editTitle", lang)} subtitle={service.name}>
        <ServiceForm initial={service} onDone={closeModal} />
      </Modal>
    </>
  );
}