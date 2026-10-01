import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLang } from "@/lib/i18n/server";
import { LangProvider } from "@/components/i18n/lang-provider";
import { PwaRegister } from "@/components/pwa/pwa-register";

export const metadata: Metadata = {
  icons: { icon: "/loreen-logo.svg" },
  title: { default: "LOREEN BEAUTY CLINIC", template: "%s | LOREEN BEAUTY CLINIC" },
  description: "LOREEN BEAUTY CLINIC management system - عيادة لورين للتجميل - نظام إدارة العيادة",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c8a15a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-ink-50 text-ink-900">
        <LangProvider lang={lang}>
          <PwaRegister />
          {children}
        </LangProvider>
      </body>
    </html>
  );
}
