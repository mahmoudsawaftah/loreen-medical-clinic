import { db } from "@/lib/db";
import type { ServiceOption, ProductOption } from "./treatment-entry-form";

export async function getServices(): Promise<ServiceOption[]> {
  const rows = await db.service.findMany({
    where: { active: true },
    select: { id: true, name: true, englishName: true, category: true, defaultPrice: true },
    orderBy: { name: "asc" },
  });
  return rows.map((s) => ({ id: s.id, name: s.name, englishName: s.englishName, category: s.category, defaultPrice: s.defaultPrice != null ? s.defaultPrice.toString() : null }));
}

export async function getProductsWithBatches(): Promise<ProductOption[]> {
  const rows = await db.product.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      englishName: true,
      stockUnit: true,
      batches: {
        where: { qtyOnHand: { gt: 0 } },
        select: { id: true, batchNo: true, expiryDate: true, qtyOnHand: true },
        orderBy: [{ expiryDate: "asc" as const }, { createdAt: "asc" as const }],
      },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    englishName: p.englishName,
    stockUnit: p.stockUnit,
    batches: p.batches.map((b) => ({ id: b.id, batchNo: b.batchNo, expiryDate: b.expiryDate, qtyOnHand: b.qtyOnHand.toString() })),
  }));
}
