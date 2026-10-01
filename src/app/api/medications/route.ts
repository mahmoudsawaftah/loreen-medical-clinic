import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { db } from "@/lib/db";

/** GET /api/medications?q=... — autocomplete over the medication catalog. */
export async function GET(request: Request): Promise<NextResponse> {
  const token = request.headers.get("cookie")?.match(/clinic_session=([^;]+)/)?.[1];
  const secret = process.env.SESSION_SECRET ?? "";
  if (!token || secret.length < 32) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const items = await db.medication.findMany({
    where: {
      active: true,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    take: 10,
    select: { id: true, name: true, form: true, strength: true },
  });
  return NextResponse.json({ items });
}