"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Silent polling: revalidates the current server component page every `intervalMs`. */
export function AutoRefresh({ intervalMs = 20000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}