"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useLang } from "@/components/i18n/lang-provider";

interface LiveCounts {
  unreadNotifications: number;
  waitingToday: number;
  readyForPayment: number;
  withDoctor: number;
}

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationAttention = Record<string, number>;

function notificationRoute(item: NotificationItem): string {
  if (item.entityType?.toLowerCase() === "follow_up" || item.type === "SECRETARY_TASK") return "/crm";
  if (item.type === "TREATMENT_COMPLETED") return "/dashboard";
  if (item.entityType?.toLowerCase() === "visit" || item.type === "VISIT_ASSIGNED") return "/dashboard";
  return "/dashboard";
}

function attentionByRoute(items: NotificationItem[]): NotificationAttention {
  return items.reduce<NotificationAttention>((out, item) => {
    if (item.readAt) return out;
    const route = notificationRoute(item);
    out[route] = (out[route] ?? 0) + 1;
    return out;
  }, {});
}

const EMPTY_COUNTS: LiveCounts = { unreadNotifications: 0, waitingToday: 0, readyForPayment: 0, withDoctor: 0 };

function relativeTime(iso: string, lang: "ar" | "en", translate: (key: "notifications.now" | "notifications.minutes" | "notifications.hours") => string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return translate("notifications.now");
  if (mins < 60) return translate("notifications.minutes").replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return translate("notifications.hours").replace("{n}", String(hours));
  return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-JO" : "en-JO");
}

function notificationTitle(item: NotificationItem, lang: "ar" | "en", translate: (key: "notifications.visitAssigned" | "notifications.treatmentCompleted" | "notifications.secretaryTask" | "notifications.priceChanged" | "notifications.generic") => string): string {
  if (lang === "ar") return item.title;
  if (item.type === "VISIT_ASSIGNED") return translate("notifications.visitAssigned");
  if (item.type === "TREATMENT_COMPLETED") return translate("notifications.treatmentCompleted");
  if (item.type === "SECRETARY_TASK") return translate("notifications.secretaryTask");
  if (item.type === "PRICE_CHANGED") return translate("notifications.priceChanged");
  return translate("notifications.generic");
}

function notificationBody(item: NotificationItem, lang: "ar" | "en", translate: (key: "notifications.visitBody" | "notifications.treatmentBody" | "notifications.taskBody" | "notifications.priceChangedBody" | "notifications.genericBody") => string): string | null {
  if (lang === "ar") return item.body;
  if (item.type === "VISIT_ASSIGNED") return translate("notifications.visitBody");
  if (item.type === "TREATMENT_COMPLETED") return translate("notifications.treatmentBody");
  if (item.type === "SECRETARY_TASK") return translate("notifications.taskBody");
  if (item.type === "PRICE_CHANGED") return item.body || translate("notifications.priceChangedBody");
  return item.body || translate("notifications.genericBody");
}

export function LiveStatus({ compact = false, onAttentionChange }: { compact?: boolean; onAttentionChange?: (attention: NotificationAttention) => void }) {
  const { lang, t } = useLang();
  const [counts, setCounts] = useState<LiveCounts>(EMPTY_COUNTS);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const notifyLatestBrowserNotification = async () => {
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const items = ((await res.json()) as { items: NotificationItem[] }).items;
      onAttentionChange?.(attentionByRoute(items));
      const item = items.find((notification) => !notification.readAt);
      if (!item || localStorage.getItem("loreen-last-browser-notification") === item.id) return;
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
      }
      if (Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const url = item.entityType?.toLowerCase() === "visit" && item.entityId
        ? `/visits/${item.entityId}`
        : item.entityType?.toLowerCase() === "follow_up"
          ? "/crm"
          : "/dashboard";
      await registration.showNotification(notificationTitle(item, lang, t), {
        body: notificationBody(item, lang, t) ?? t("notifications.genericBody"),
        dir: lang === "ar" ? "rtl" : "ltr",
        lang,
        data: { url },
      });
      localStorage.setItem("loreen-last-browser-notification", item.id);
    } catch {
      /* browser notification support is optional */
    }
  };

  const refreshAttention = async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const items = ((await res.json()) as { items: NotificationItem[] }).items;
      onAttentionChange?.(attentionByRoute(items));
      if (items.some((item) => !item.readAt)) void notifyLatestBrowserNotification();
    } catch {
      /* notification attention is best effort */
    }
  };

  const refreshCounts = async () => {
    try {
      const res = await fetch("/api/live/counts", { cache: "no-store" });
      if (res.ok) {
        const next = (await res.json()) as LiveCounts;
        setCounts((previous) => {
          if (next.unreadNotifications !== previous.unreadNotifications || previous.unreadNotifications === 0) void refreshAttention();
          return next;
        });
      }
    } catch {
      /* offline polling failures are silent */
    }
  };

  useEffect(() => {
    const initial = setTimeout(() => void refreshCounts(), 0);
    const id = setInterval(() => void refreshCounts(), 20000);
    return () => { clearTimeout(initial); clearInterval(id); };
    // refreshCounts intentionally owns its polling lifecycle for the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && items === null) {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (res.ok) {
          const nextItems = ((await res.json()) as { items: NotificationItem[] }).items;
          setItems(nextItems);
          onAttentionChange?.(attentionByRoute(nextItems));
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
  };

  const markRead = async (id: string) => {
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) return;
      const wasUnread = items?.some((item) => item.id === id && !item.readAt) ?? false;
      const nextItems = items?.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item) ?? null;
      setItems(nextItems);
      if (wasUnread) setCounts((current) => ({ ...current, unreadNotifications: Math.max(0, current.unreadNotifications - 1) }));
      if (nextItems) onAttentionChange?.(attentionByRoute(nextItems));
    } catch {
      /* notification read state is best effort */
    }
  };

  const markAllRead = async () => {
      try {
        await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setItems((prev) => prev?.map((n) => ({ ...n, readAt: new Date().toISOString() })) ?? null);
      setCounts((c) => ({ ...c, unreadNotifications: 0 }));
      onAttentionChange?.({});
    } catch {
      /* silent */
    }
  };

  const chips: { value: number; label: string; href: string; tone: string }[] = [];
  if (counts.waitingToday > 0) chips.push({ value: counts.waitingToday, label: t("dash.inClinic"), href: "/dashboard", tone: "bg-sky-500/15 text-sky-300" });
  if (counts.withDoctor > 0) chips.push({ value: counts.withDoctor, label: t("dash.withDoctor"), href: "/dashboard", tone: "bg-violet-500/15 text-violet-300" });
  if (counts.readyForPayment > 0) chips.push({ value: counts.readyForPayment, label: t("dash.awaitingPayment"), href: "/dashboard", tone: "bg-amber-500/15 text-amber-300" });

  const bell = (
    <div className="relative">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={t("notifications.title")}
        className={cn(
          "relative rounded-lg p-2 transition-colors",
          compact ? "text-ink-600 hover:bg-ink-100" : "text-ink-300 hover:bg-ink-800 hover:text-white",
        )}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {counts.unreadNotifications > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 tabular-nums">
            {counts.unreadNotifications > 99 ? "99+" : counts.unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cn("absolute z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white border border-ink-200 shadow-xl overflow-hidden", compact ? "left-0" : "left-0")}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 bg-ink-50">
              <p className="text-sm font-semibold text-ink-800">{t("notifications.title")}</p>
              {items?.some((n) => !n.readAt) && (
                <button type="button" onClick={() => void markAllRead()} className="text-xs text-primary-700 hover:underline">
                  {t("notifications.markAllRead")}
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-sm text-ink-400 text-center">{t("notifications.loading")}</p>
              ) : items && items.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink-400 text-center">{t("notifications.empty")}</p>
              ) : (
                items?.map((n) => (
                  <Link
                    key={n.id}
                    href={n.entityType?.toLowerCase() === "visit" && n.entityId ? `/visits/${n.entityId}` : n.entityType?.toLowerCase() === "follow_up" ? "/crm" : "#"}
                    onClick={() => { void markRead(n.id); setOpen(false); }}
                    className={cn("block px-4 py-3 border-b border-ink-50 last:border-0 hover:bg-ink-50 transition-colors", !n.readAt && "bg-primary-50/60")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink-800">{notificationTitle(n, lang, t)}</p>
                      <span className="text-[10px] text-ink-400 shrink-0">{relativeTime(n.createdAt, lang, t)}</span>
                    </div>
                    {notificationBody(n, lang, t) && <p className="mt-0.5 text-xs text-ink-500 line-clamp-2">{notificationBody(n, lang, t)}</p>}
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  if (compact) return bell;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-ink-800 bg-ink-900/60">
      {chips.map((c) => (
        <Link key={c.label} href={c.href} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums", c.tone)}>
          {c.label} {c.value}
        </Link>
      ))}
      <div className="flex-1" />
      {bell}
    </div>
  );
}
