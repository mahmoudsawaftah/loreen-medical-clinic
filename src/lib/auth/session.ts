import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSettings } from "../settings";

const SESSION_COOKIE = "clinic_session";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

export interface SessionPayload {
  userId: string;
  role: string;
  name: string;
  ttlMinutes: number;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const ttl = payload.ttlMinutes || (await getSettings()).sessionTtlMinutes;
  return new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${ttl}m`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      userId: payload.sub,
      role: String(payload.role ?? ""),
      name: String(payload.name ?? ""),
      ttlMinutes: Number(payload.ttlMinutes ?? 720),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  const settings = await getSettings();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: settings.sessionTtlMinutes * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
