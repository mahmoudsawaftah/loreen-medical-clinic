import "server-only";
import { AttachmentEntityType } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, assertFound } from "@/lib/errors";
import { writeAudit } from "@/lib/audit";
import { getStorage, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "@/lib/storage";
import type { AuthUser } from "@/lib/auth/authorize";

/**
 * Attachments module.
 * Metadata in DB, bytes through the storage adapter (local by default).
 * Access is role/record aware — documents are never publicly served.
 */

export const ENTITY_TYPES = Object.values(AttachmentEntityType);

export function canUploadEntityType(role: AuthUser["role"], entityType: AttachmentEntityType): boolean {
  switch (entityType) {
    case "PURCHASE_REQUEST":
    case "PURCHASE":
    case "EXPENSE":
    case "PAYMENT":
      return ["OWNER", "ACCOUNTANT", "SECRETARY", "DOCTOR"].includes(role);
    case "INVOICE":
      return ["OWNER", "ACCOUNTANT", "SECRETARY"].includes(role);
    case "TREATMENT":
    case "VISIT":
      return ["OWNER", "DOCTOR"].includes(role);
    case "CUSTOMER":
      return ["OWNER", "SECRETARY", "DOCTOR"].includes(role);
  }
}

export function canViewEntityType(role: AuthUser["role"], entityType: AttachmentEntityType): boolean {
  switch (entityType) {
    case "PURCHASE_REQUEST":
    case "PURCHASE":
    case "EXPENSE":
    case "INVOICE":
    case "PAYMENT":
      return ["OWNER", "ACCOUNTANT", "SECRETARY", "DOCTOR"].includes(role);
    case "TREATMENT":
    case "VISIT":
    case "CUSTOMER":
      return true; // record-level checks below
  }
}

/** Record-level authorization for viewing/serving an attachment. */
export async function canAccessAttachment(actor: AuthUser, attachment: { entityType: AttachmentEntityType; entityId: string }): Promise<boolean> {
  if (actor.role === "OWNER") return true;
  switch (attachment.entityType) {
    case "PURCHASE_REQUEST":
    case "PURCHASE":
    case "EXPENSE":
      return ["ACCOUNTANT", "SECRETARY", "DOCTOR"].includes(actor.role);
    case "PAYMENT":
    case "INVOICE": {
      if (!["ACCOUNTANT", "SECRETARY"].includes(actor.role)) return false;
      const payment = await db.payment.findUnique({ where: { id: attachment.entityId }, include: { invoice: true } });
      if (payment) return true;
      const invoice = await db.invoice.findUnique({ where: { id: attachment.entityId } });
      return Boolean(invoice);
    }
    case "TREATMENT": {
      if (actor.role === "DOCTOR") {
        const t = await db.treatment.findUnique({ where: { id: attachment.entityId } });
        return t?.doctorId === actor.id;
      }
      return actor.role === "SECRETARY" ? false : true;
    }
    case "VISIT": {
      if (actor.role === "DOCTOR") {
        const v = await db.visit.findUnique({ where: { id: attachment.entityId } });
        return v?.doctorId === actor.id;
      }
      return actor.role === "ACCOUNTANT";
    }
    case "CUSTOMER": {
      if (actor.role === "DOCTOR") {
        const visits = await db.visit.findMany({ where: { customerId: attachment.entityId, doctorId: actor.id }, select: { id: true } });
        return visits.length > 0 || actor.role === "DOCTOR";
      }
      return actor.role === "SECRETARY";
    }
  }
}

export async function uploadAttachment(
  actor: AuthUser,
  input: { entityType: AttachmentEntityType; entityId: string; fileName: string; mimeType: string; sizeBytes: number; buffer: Buffer },
): Promise<{ id: string }> {
  if (!ALLOWED_MIME_TYPES.includes(input.mimeType)) {
    throw new AppError("نوع الملف غير مسموح (الصور و PDF فقط)", "VALIDATION");
  }
  if (input.sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new AppError("حجم الملف يتجاوز الحد الأقصى (10 ميجابايت)", "VALIDATION");
  }
  if (input.sizeBytes <= 0) throw new AppError("الملف فارغ", "VALIDATION");
  if (!canUploadEntityType(actor.role, input.entityType)) throw new AppError("لا تملك صلاحية رفع ملفات لهذا النوع", "FORBIDDEN");

  // verify parent exists
  const parent = await findParent(input.entityType, input.entityId);
  assertFound(parent, "السجل المرتبط غير موجود");

  const storage = getStorage();
  const storedName = storage.nameFor(input.fileName);
  await storage.save(input.buffer, storedName);

  const attachment = await db.attachment.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      storedName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedById: actor.id,
    },
  });

  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "attachment.upload",
    entityType: "attachment",
    entityId: attachment.id,
    after: { entityType: input.entityType, entityId: input.entityId, fileName: input.fileName, sizeBytes: input.sizeBytes, mimeType: input.mimeType },
  });
  return { id: attachment.id };
}

async function findParent(entityType: AttachmentEntityType, entityId: string) {
  switch (entityType) {
    case "PURCHASE_REQUEST": return db.purchaseRequest.findUnique({ where: { id: entityId }, select: { id: true } });
    case "PURCHASE": return db.purchase.findUnique({ where: { id: entityId }, select: { id: true } });
    case "EXPENSE": return db.expense.findUnique({ where: { id: entityId }, select: { id: true } });
    case "PAYMENT": return db.payment.findUnique({ where: { id: entityId }, select: { id: true } });
    case "INVOICE": return db.invoice.findUnique({ where: { id: entityId }, select: { id: true } });
    case "TREATMENT": return db.treatment.findUnique({ where: { id: entityId }, select: { id: true } });
    case "VISIT": return db.visit.findUnique({ where: { id: entityId }, select: { id: true } });
    case "CUSTOMER": return db.customer.findUnique({ where: { id: entityId }, select: { id: true } });
  }
}

export async function listAttachments(actor: AuthUser, entityType: AttachmentEntityType, entityId: string) {
  const rows = await db.attachment.findMany({
    where: { entityType, entityId },
    orderBy: { uploadedAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  return rows;
}

export async function getAttachment(actor: AuthUser, attachmentId: string) {
  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  assertFound(attachment, "الملف غير موجود");
  if (!(await canAccessAttachment(actor, attachment))) throw new AppError("غير مصرح بالوصول لهذا الملف", "FORBIDDEN");
  return attachment;
}

export async function readAttachmentBytes(actor: AuthUser, attachmentId: string): Promise<{ attachment: Awaited<ReturnType<typeof getAttachment>>; buffer: Buffer }> {
  const attachment = await getAttachment(actor, attachmentId);
  const storage = getStorage();
  const buffer = await storage.read(attachment.storedName);
  return { attachment, buffer };
}

export async function deleteAttachment(actor: AuthUser, attachmentId: string): Promise<void> {
  const attachment = await db.attachment.findUnique({ where: { id: attachmentId } });
  assertFound(attachment, "الملف غير موجود");
  if (actor.role !== "OWNER" && attachment.uploadedById !== actor.id) throw new AppError("لا تملك صلاحية حذف هذا الملف", "FORBIDDEN");
  const before = { fileName: attachment.fileName, entityType: attachment.entityType, entityId: attachment.entityId };
  const storage = getStorage();
  await storage.delete(attachment.storedName);
  await db.attachment.delete({ where: { id: attachmentId } });
  await writeAudit({
    userId: actor.id,
    userRole: actor.role,
    action: "attachment.delete",
    entityType: "attachment",
    entityId: attachmentId,
    before,
  });
}