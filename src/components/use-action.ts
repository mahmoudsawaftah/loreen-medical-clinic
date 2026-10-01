"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang } from "@/components/i18n/lang-provider";

type ActionResult<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/**
 * Runs a server action, shows pending state, and surfaces errors.
 * Optionally refreshes the route after success for server components to re-render.
 */
export function useServerAction<A extends (...args: never[]) => Promise<ActionResult>>(action: A, opts: { refresh?: boolean } = {}) {
  const router = useRouter();
  const { t } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Parameters<typeof action>) => {
      setError(null);
      setOkMsg(null);
      let failed = false;
      startTransition(async () => {
        const result = await action(...args);
        if (!result.ok) {
          failed = true;
          setError(result.error);
          return;
        }
        if (opts.refresh !== false) router.refresh();
        setOkMsg(t("common.success"));
      });
      await new Promise((r) => setTimeout(r, 0));
      return { error: failed };
    },
    [action, opts.refresh, router, t],
  );

  return { run, pending, error, okMsg, setError, setOkMsg };
}

export function useActionForm() {
  const router = useRouter();
  const { t } = useLang();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const run = useCallback(
    (action: () => Promise<ActionResult>, onDone?: () => void) => {
      setError(null);
      setSuccess(null);
      startTransition(async () => {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSuccess(t("common.success"));
        formRef.current?.reset();
        router.refresh();
        onDone?.();
      });
    },
    [router, t],
  );

  return { run, pending, error, success, setError, formRef };
}