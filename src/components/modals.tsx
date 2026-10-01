"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/ui/form";

export function Modal({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-ink-900">{title}</h3>
            {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700 text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}

export function ModalFormStatus({ error, success }: { error: string | null; success: string | null }) {
  return (
    <>
      <FormError message={error} />
      <FormSuccess message={success} />
    </>
  );
}

export function CloseCancelRow({ onClose, loading }: { onClose: () => void; loading: boolean }) {
  return (
    <div className="flex gap-2 justify-end pt-1">
      <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={loading}>إغلاق</Button>
    </div>
  );
}