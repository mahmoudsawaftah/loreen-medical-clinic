"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Role } from "@prisma/client";
import { logoutAction } from "@/server/actions/auth-actions";
import { NAV_GROUPS, navItemsFor } from "@/lib/navigation";
import { LiveStatus } from "@/components/layout/live-status";
import type { NotificationAttention } from "@/components/layout/live-status";
import { useLang } from "@/components/i18n/lang-provider";
import { localizedName } from "@/lib/i18n/entities";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import type { I18nKey } from "@/lib/i18n/dict";

const ROLE_KEYS: Record<Role, I18nKey> = {
  OWNER: "role.owner",
  ACCOUNTANT: "role.accountant",
  MAIN_DOCTOR: "role.mainDoctor",
  DOCTOR: "role.doctor",
  SECRETARY: "role.secretary",
};

export function AppShell({ user, brand, children }: { user: { name: string; englishName?: string | null; role: Role; username: string; permissions: string[]; jobTitle?: string | null }; brand: { name: string; nameAr: string }; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [notificationAttention, setNotificationAttention] = useState<NotificationAttention>({});
  const { t, lang } = useLang();
  const ranked = navItemsFor(user);
  const bottom = ranked.slice(0, 5);

  const roleLabel = lang === "en" ? t(ROLE_KEYS[user.role]) : user.jobTitle?.trim() || t(ROLE_KEYS[user.role]);
  const displayUserName = localizedName(user.name, user.englishName, lang);
  const brandName = lang === "en" ? brand.name : brand.nameAr;
  const currentItem = ranked.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const grouped = NAV_GROUPS.map((group) => ({ group, items: ranked.filter((item) => group.hrefs.some((href) => href === item.href)) })).filter(({ items }) => items.length > 0);
  const currentGroup = grouped.find(({ items }) => items.some((item) => item.href === currentItem?.href))?.group.key;

  const linkCls = (href: string, attention = false) =>
    cn(
      "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
      (pathname === href || pathname.startsWith(href + "/")) ? "bg-primary-600 text-white font-medium shadow-sm" : "text-ink-300 hover:bg-ink-800 hover:text-white",
      attention && "nav-notification-attention",
    );

  const label = (href: string, labelKey: I18nKey | undefined, fallback: string) => (labelKey ? t(labelKey) : fallback);
  const isGroupExpanded = (key: string) => expandedGroups[key] ?? key === currentGroup;
  const toggleGroup = (key: string) => setExpandedGroups((previous) => ({ ...previous, [key]: !isGroupExpanded(key) }));
  const renderNavItem = (item: (typeof ranked)[number]) => (
    <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className={linkCls(item.href, (notificationAttention[item.href] ?? 0) > 0)}>
      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
      </svg>
      <span className="min-w-0 flex-1 truncate">{label(item.href, item.labelKey, item.label)}</span>
      {(notificationAttention[item.href] ?? 0) > 0 && (
        <span className="notification-attention-badge" aria-label={`${notificationAttention[item.href]} unread notifications`}>
          {notificationAttention[item.href] > 99 ? "99+" : notificationAttention[item.href]}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={cn(
          "app-sidebar fixed inset-y-0 right-0 z-40 w-64 bg-ink-950 text-ink-100 flex flex-col transition-transform lg:translate-x-0",
          open ? "app-sidebar-open translate-x-0" : "app-sidebar-closed translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-5 py-5 border-b border-ink-800">
          <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 shadow-[0_0_0_4px_rgba(200,161,90,0.08)]">
              <Image src="/loreen-logo.svg" alt="" width={44} height={44} unoptimized priority className="h-11 w-11" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">{brandName || t("app.brandFallback")}</p>
              <p className="text-[10px] text-primary-300/80">{brand.name}</p>
            </div>
          </Link>
        </div>
        <div className="px-4 pt-3 pb-1">
          <LanguageSwitcher className="w-full justify-center" />
        </div>
        <LiveStatus onAttentionChange={setNotificationAttention} />
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-2">
          {grouped.map(({ group, items }) => {
            const expanded = isGroupExpanded(group.key);
            const attentionCount = items.reduce((sum, item) => sum + (notificationAttention[item.href] ?? 0), 0);
            return (
              <section key={group.key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className={cn("w-full flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400 hover:bg-ink-900 hover:text-ink-100", attentionCount > 0 && "nav-notification-group-attention")}
                  aria-expanded={expanded}
                  aria-label={`${expanded ? t("nav.collapseGroup") : t("nav.expandGroup")}: ${t(group.labelKey)}`}
                >
                  <span className="flex-1 text-start">{t(group.labelKey)}</span>
                  {attentionCount > 0 && <span className="notification-attention-badge">{attentionCount > 99 ? "99+" : attentionCount}</span>}
                  <svg className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06Z" clipRule="evenodd" />
                  </svg>
                </button>
                {expanded && <div className="mt-1 space-y-0.5">{items.map(renderNavItem)}</div>}
              </section>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-ink-800 text-xs text-ink-400">
          <p className="font-medium text-ink-200 truncate">{displayUserName}</p>
          <p className="mt-0.5 text-primary-300">{roleLabel} · @{user.username}</p>
          <form action={async () => { await logoutAction(); }} className="mt-3">
            <button type="submit" className="w-full rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-white text-right">
              {t("app.logout")}
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="app-sidebar-content flex-1 lg:mr-64 min-w-0">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-ink-200 px-4 sm:px-6 h-14 flex items-center gap-2 lg:hidden">
          <button onClick={() => setOpen(!open)} className="p-2 rounded-lg text-ink-600 hover:bg-ink-100" aria-label={t("app.menu")}>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-medium text-ink-800 truncate">{currentItem ? label(currentItem.href, currentItem.labelKey, currentItem.label) : brandName || t("app.brandFallback")}</span>
          <div className="flex-1" />
          <LanguageSwitcher />
          <LiveStatus compact onAttentionChange={setNotificationAttention} />
        </header>
        <main className="px-4 sm:px-6 py-6 pb-24 lg:pb-6 max-w-7xl mx-auto">{children}</main>
      </div>

      {/* Mobile bottom navigation: the 5 highest-frequency actions for this role */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-ink-200 lg:hidden flex" aria-label={t("nav.quickNav")}>
        {bottom.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={cn("relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-primary-700 font-semibold" : "text-ink-500", (notificationAttention[item.href] ?? 0) > 0 && "nav-notification-attention-mobile")}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="truncate max-w-[72px]">{label(item.href, item.labelKey, item.label)}</span>
              {(notificationAttention[item.href] ?? 0) > 0 && <span className="notification-attention-dot" aria-hidden />}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
