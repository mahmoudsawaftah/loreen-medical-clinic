import "server-only";
import type { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/authorize";
import { hasPermission, type Permission } from "@/lib/permissions";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";
import { ErrorBanner } from "@/components/ui/display";
import { AccessDenied } from "@/components/access-denied";

/**
 * Server-side route enforcement shared with the sidebar (see src/lib/navigation.ts).
 * Each guarded route has a tiny layout calling guardChildren with the same
 * roles/permissions the sidebar uses — hidden UI is never the security boundary.
 */
export default async function guardChildren(
  children: React.ReactNode,
  options: { roles?: Role[]; anyOf?: Permission[] },
): Promise<React.ReactNode> {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return <ErrorBanner title="غير مصرح بالدخول" description="الرجاء تسجيل الدخول للوصول إلى نظام إدارة العيادة." />;
    }
    if (e instanceof ForbiddenError) return <AccessDenied />;
    throw e;
  }
  const roleOk = !options.roles || options.roles.includes(user.role);
  const permOk = !options.anyOf || options.anyOf.some((p) => hasPermission(user, p));
  if (!roleOk || !permOk) return <AccessDenied />;
  return <>{children}</>;
}