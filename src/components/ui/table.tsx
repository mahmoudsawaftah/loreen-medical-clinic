import { cn } from "@/lib/cn";
import Link from "next/link";

export function Table({ headers, children, empty, className }: { headers: string[]; children: React.ReactNode; empty?: boolean; className?: string }) {
  if (empty) return null;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/60">
            {headers.map((h, i) => (
              <th key={i} className="text-right px-4 py-3 text-xs font-semibold text-ink-500 whitespace-nowrap first:pr-5 last:pl-5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle first:pr-5 last:pl-5", className)}>{children}</td>;
}

export function Pagination({ page, pages, buildHref }: { page: number; pages: number; buildHref: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-ink-100 text-sm">
      <span className="text-xs text-ink-500">
        الصفحة {page} من {pages}
      </span>
      <div className="flex gap-1">
        {page > 1 && (
          <Link href={buildHref(page - 1)} className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-600 bg-ink-100 hover:bg-ink-200">
            السابق
          </Link>
        )}
        {page < pages && (
          <Link href={buildHref(page + 1)} className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-600 bg-ink-100 hover:bg-ink-200">
            التالي
          </Link>
        )}
      </div>
    </div>
  );
}

export function SortLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="hover:text-primary-600">
      {children}
    </Link>
  );
}