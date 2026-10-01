"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changePasswordAction } from "@/server/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Field, Input, FormError, FormSuccess } from "@/components/ui/form";
import { useLang } from "@/components/i18n/lang-provider";
import { translateServerError } from "@/lib/i18n/errors";

export function PasswordChangeForm() {
  const router = useRouter();
  const { t } = useLang();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const result = await changePasswordAction({
      currentPassword: String(form.get("currentPassword") ?? ""),
      newPassword: String(form.get("newPassword") ?? ""),
    });
    setLoading(false);
    if (!result.ok) {
      setError(translateServerError(result.error, t));
      return;
    }
    setSuccess(true);
    setTimeout(() => router.replace("/dashboard"), 800);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <FormSuccess message={success ? t("login.passwordChanged") : null} />
      <Field label={t("login.currentPassword")}>
        <Input name="currentPassword" type="password" dir="ltr" required />
      </Field>
      <Field label={t("login.newPassword")} hint={t("login.passwordHint")}>
        <Input name="newPassword" type="password" dir="ltr" required minLength={8} />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        {t("login.changePasswordTitle")}
      </Button>
    </form>
  );
}