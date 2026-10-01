"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomerSourceAction, updateCustomerSourceAction } from "@/server/actions/v2-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { t } from "@/lib/i18n/dict";

export function CreateSourceForm() {
  const router = useRouter();
  const { lang } = useLang();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setLoading(true); setError(null); setSuccess(null);
      const result = await createCustomerSourceAction({ name });
      setLoading(false);
      if (!result.ok) { setError(result.error); return; }
      setSuccess(t("sources.addedSource", lang));
      setName("");
      router.refresh();
    }}>
      <FormError message={error} />
      <FormSuccess message={success} />
      <Field label={t("sources.addName", lang)}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("sources.namePh", lang)} required /></Field>
      <Button type="submit" loading={loading} size="sm">{t("sources.addButton", lang)}</Button>
    </form>
  );
}

export function SourceRow({ source }: { source: { id: string; name: string; active: boolean; _count: { customers: number } } }) {
  const router = useRouter();
  const { lang } = useLang();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true); setError(null);
    const result = await updateCustomerSourceAction({ sourceId: source.id, data: { active: !source.active } });
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{source.name}</p>
        <p className="text-[11px] text-ink-400">{t("patients.listSub", lang).replace("{n}", String(source._count.customers))}</p>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      <Button size="sm" variant="outline" loading={loading} onClick={toggle}>{source.active ? t("sources.stop", lang) : t("sources.activate", lang)}</Button>
    </div>
  );
}