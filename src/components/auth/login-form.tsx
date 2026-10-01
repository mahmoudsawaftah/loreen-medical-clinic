"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginAction } from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await loginAction({
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (!result.ok) {
      setError(translateServerError(result.error, t));
      setLoading(false);
      return;
    }
    router.replace(searchParams.get("next") || "/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <Field label={t("login.username")}>
        <Input name="username" autoComplete="username" required autoFocus dir="ltr" className="text-right" placeholder="username" />
      </Field>
      <Field label={t("login.password")}>
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" className="text-right" placeholder="••••••••" />
      </Field>
      <Button type="submit" loading={loading} className="w-full" size="lg">
        {loading ? t("login.signingIn") : t("login.signIn")}
      </Button>
    </form>
  );
}