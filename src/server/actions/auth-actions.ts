"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, changePassword } from "@/server/services/auth-service";
import { getOptionalUser, requireUser } from "@/lib/auth/authorize";
import { runAction, clientMeta, type ActionResult } from "./helpers";
import { AppError } from "@/lib/errors";

const loginSchema = z.object({
  username: z.string().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export async function loginAction(input: { username: string; password: string }): Promise<ActionResult<{ mustChangePassword?: boolean }>> {
  return runAction(async () => {
    const parsed = loginSchema.parse(input);
    const meta = await clientMeta();
    const result = await login(parsed.username, parsed.password, meta.ip, meta.userAgent);
    if (!result.ok) throw new AppError(result.error ?? "فشل تسجيل الدخول");
    if (result.mustChangePassword) redirect("/password-change");
    redirect("/");
  });
}

export async function logoutAction(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await getOptionalUser();
    await logout(user?.id ?? null, user?.role ?? null);
  });
}

export async function changePasswordAction(input: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await changePassword(user.id, user.role, input.currentPassword, input.newPassword);
  });
}