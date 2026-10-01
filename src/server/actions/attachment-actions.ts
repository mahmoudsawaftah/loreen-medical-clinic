"use server";

import type { AttachmentEntityType } from "@prisma/client";
import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/permissions";
import { uploadAttachment, deleteAttachment } from "@/server/services/attachment-service";
import { runAction, type ActionResult } from "./helpers";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf", "image/heic"];

export async function uploadAttachmentAction(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.ATTACHMENT_UPLOAD);
    const entityType = String(formData.get("entityType") ?? "") as AttachmentEntityType;
    const entityId = String(formData.get("entityId") ?? "");
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("الملف مطلوب");
    if (file.size > MAX_BYTES) throw new Error("حجم الملف يتجاوز الحد الأقصى (10 ميجابايت)");
    if (!ALLOWED.includes(file.type)) throw new Error("نوع الملف غير مسموح");
    const buffer = Buffer.from(await file.arrayBuffer());
    return uploadAttachment(actor, {
      entityType,
      entityId,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      buffer,
    });
  });
}

export async function deleteAttachmentAction(attachmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.ATTACHMENT_UPLOAD);
    await deleteAttachment(actor, attachmentId);
  });
}