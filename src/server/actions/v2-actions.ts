"use server";

import { requirePermission } from "@/lib/auth/authorize";
import { PERMISSIONS } from "@/lib/permissions";
import * as counts from "@/server/services/inventory-count-service";
import * as sources from "@/server/services/customer-source-service";
import { runAction, type ActionResult } from "./helpers";

/** ---- Physical inventory counts ---- */
export async function createInventoryCountAction(input: Parameters<typeof counts.createInventoryCount>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT);
    const created = await counts.createInventoryCount(actor, input);
    return { id: created.id };
  });
}

export async function startInventoryCountAction(countId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT);
    await counts.startInventoryCount(actor, countId);
  });
}

export async function updateCountedQtyAction(input: { countId: string; lineId: string; countedQty: number }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT);
    await counts.updateCountedQty(actor, input.countId, input.lineId, input.countedQty);
  });
}

export async function submitInventoryCountAction(countId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT);
    await counts.submitInventoryCount(actor, countId);
  });
}

export async function reviewInventoryCountAction(countId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT_POST);
    await counts.reviewInventoryCount(actor, countId);
  });
}

export async function postInventoryCountAction(countId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_COUNT_POST);
    await counts.postInventoryCount(actor, countId);
  });
}

/** ---- Customer sources ---- */
export async function createCustomerSourceAction(input: Parameters<typeof sources.createCustomerSource>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.CRM_MANAGE);
    const created = await sources.createCustomerSource(actor, input);
    return { id: created.id };
  });
}

export async function updateCustomerSourceAction(input: { sourceId: string; data: Parameters<typeof sources.updateCustomerSource>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.CRM_MANAGE);
    await sources.updateCustomerSource(actor, input.sourceId, input.data);
  });
}