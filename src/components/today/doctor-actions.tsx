"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startWithDoctorAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function AcceptVisitButton({ visitId, label }: { visitId: string; label?: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const res = await startWithDoctorAction(visitId);
      if (!res.ok) {
        setError(translateServerError(res.error, t));
        return;
      }
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button type="button" size="sm" onClick={accept} loading={pending}>{label ?? t("today.accepting")}</Button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}