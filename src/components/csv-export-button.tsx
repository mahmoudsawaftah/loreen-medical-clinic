"use client";

import { useLang } from "@/components/i18n/lang-provider";

export function CsvExportButton({ filename, rows }: { filename: string; rows: Record<string, string | number>[] }) {
  const { t } = useLang();
  function download() {
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => {
        const v = r[h];
        const s = typeof v === "number" ? String(v) : String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={download} disabled={rows.length === 0} className="h-9 px-3 rounded-lg border border-ink-300 text-sm text-ink-600 hover:bg-ink-50 disabled:opacity-40">
      ⟱ {t("common.exportCsv")}
    </button>
  );
}
