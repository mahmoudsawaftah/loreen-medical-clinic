import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

/** GET: recent notifications for the logged-in user. */
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
  const items = await db.notification.findMany({
    where: { recipientId: sub },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, title: true, body: true, type: true, entityType: true, entityId: true, readAt: true, createdAt: true },
  });
  return NextResponse.json({ items });
}

/** POST: mark notifications as read (all when no ids provided). */
export async function POST(request: Request): Promise<NextResponse> {
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
  const body = (await request.json().catch(() => ({}))) as { ids?: string[] };
  await db.notification.updateMany({
    where: {
      recipientId: sub,
      ...(body.ids && body.ids.length > 0 ? { id: { in: body.ids } } : { readAt: null }),
    },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}