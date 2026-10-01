import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";
import { syncDueSecretaryTaskNotifications } from "@/server/services/notification-service";

/**
 * Light polling endpoint used by the app shell every ~20s:
 * unread notifications + reception/doctor queue counters.
 * Also materializes due secretary tasks into one-time notifications.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get("cookie")?.match(/clinic_session=([^;]+)/)?.[1];
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || secret.length < 32) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let sub: string | undefined;
  try {
    sub = (await jwtVerify(token, new TextEncoder().encode(secret))).payload.sub as string | undefined;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!sub) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: sub } });
  if (!user || user.status !== "ACTIVE") return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (user.role === "SECRETARY") await syncDueSecretaryTaskNotifications();

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [unreadNotifications, waitingToday, readyForPayment, withDoctor] = await Promise.all([
    db.notification.count({ where: { recipientId: user.id, readAt: null } }),
    user.role === "SECRETARY" || user.role === "OWNER"
      ? db.visit.count({ where: { createdAt: { gte: start }, status: { in: ["REGISTERED", "WAITING"] } } })
      : db.visit.count({ where: { createdAt: { gte: start }, doctorId: user.id, status: { in: ["REGISTERED", "WAITING"] } } }),
    user.role === "SECRETARY" || user.role === "OWNER"
      ? db.visit.count({ where: { status: "READY_FOR_PAYMENT" } })
      : 0,
    user.role === "DOCTOR" || user.role === "MAIN_DOCTOR"
      ? db.visit.count({ where: { createdAt: { gte: start }, doctorId: user.id, status: "WITH_DOCTOR" } })
      : 0,
  ]);

  return NextResponse.json({ unreadNotifications, waitingToday, readyForPayment, withDoctor });
}
