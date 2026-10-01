"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkInVisitAction, startWithDoctorAction, returnToWaitingAction, cancelVisitAction, reopenVisitForCorrectionAction } from "@/server/actions/operations-actions";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function CheckInButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        loading={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await checkInVisitAction(visitId);
            if (!result.ok) { setError(translateServerError(result.error, t)); return; }
            router.refresh();
          });
        }}
      >
        {t("visits.checkIn")}
      </Button>
      {error && <p className="max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function StartWithDoctorButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="outline" loading={pending} onClick={() => {
        setError(null);
        start(async () => {
          const result = await startWithDoctorAction(visitId);
          if (!result.ok) { setError(translateServerError(result.error, t)); return; }
          router.refresh();
        });
      }}>
        {t("today.start")}
      </Button>
      {error && <p className="max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function ReturnToWaitingButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" variant="ghost" loading={pending} onClick={() => {
        setError(null);
        start(async () => {
          const result = await returnToWaitingAction(visitId);
          if (!result.ok) { setError(translateServerError(result.error, t)); return; }
          router.refresh();
        });
      }}>
        {t("visits.returnToWaiting")}
      </Button>
      {error && <p className="max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function CancelVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>{t("visits.cancelVisit")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = await cancelVisitAction({ visitId, reason });
                if (!r.ok) { setError(translateServerError(r.error, t)); return; }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <h3 className="font-bold">{t("visits.cancelConfirmTitle")}</h3>
            <p className="text-xs text-ink-500">{t("visits.cancelWarning")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={t("visits.cancelReasonPh")} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.dismiss")}</Button>
              <Button type="submit" variant="danger" size="sm" loading={pending}>{t("visits.confirmCancel")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function ReopenVisitButton({ visitId }: { visitId: string }) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t("visits.reopenForReview")}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <form
            className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                const r = await reopenVisitForCorrectionAction({ visitId, reason });
                if (!r.ok) { setError(translateServerError(r.error, t)); return; }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            <h3 className="font-bold">{t("visits.reopenTitle")}</h3>
            <p className="text-xs text-ink-500">{t("visits.reopenWarning")}</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <textarea className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm h-20" placeholder={t("visits.reopenReasonPh")} value={reason} onChange={(e) => setReason(e.target.value)} required />
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>{t("common.dismiss")}</Button>
              <Button type="submit" size="sm" loading={pending}>{t("visits.confirmReopen")}</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
