"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function MessagesFilterBar() {
  const router = useRouter();
  const sp = useSearchParams();

  const build = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const current: Record<string, string | null> = {
      category: sp.get("category"),
      status: sp.get("status"),
      from: sp.get("from"),
      to: sp.get("to"),
    };
    for (const [k, v] of Object.entries({ ...current, ...patch })) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `/messages?${q}` : "/messages";
  };

  const apply = (patch: Record<string, string | null>) => {
    router.replace(build(patch));
    router.refresh();
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    apply({
      category: String(fd.get("category") || ""),
      status: String(fd.get("status") || ""),
      from: String(fd.get("from") || ""),
      to: String(fd.get("to") || ""),
    });
  };

  return (
    <form className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end" onSubmit={onSubmit}>
      <Field label="النوع">
        <Select name="category" defaultValue={sp.get("category") ?? ""} onChange={(e) => apply({ category: e.target.value || null })}>
          <option value="">الكل</option>
          <option value="PROMOTIONAL">رسائل وعروض</option>
          <option value="TRANSACTIONAL">رسائل تشغيلية</option>
        </Select>
      </Field>
      <Field label="الحالة">
        <Select name="status" defaultValue={sp.get("status") ?? ""} onChange={(e) => apply({ status: e.target.value || null })}>
          <option value="">الكل</option>
          <option value="SENT">أُرسلت</option>
          <option value="FAILED">فشلت</option>
          <option value="SKIPPED">تم التجاهل</option>
        </Select>
      </Field>
      <Field label="من تاريخ"><Input type="date" name="from" defaultValue={sp.get("from") ?? ""} /></Field>
      <Field label="إلى تاريخ"><Input type="date" name="to" defaultValue={sp.get("to") ?? ""} /></Field>
      <Button type="submit" size="sm">تصفية</Button>
    </form>
  );
}