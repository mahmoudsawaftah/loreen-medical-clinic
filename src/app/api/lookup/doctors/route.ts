import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get("cookie")?.match(/clinic_session=([^;]+)/)?.[1];
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || secret.length < 32) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const doctors = await db.user.findMany({
    where: { role: { in: ["OWNER", "MAIN_DOCTOR", "DOCTOR"] }, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ doctors });
}