"use server";

import { requirePermission } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS } from "@/lib/permissions";
import * as serviceCatalog from "@/server/services/service-catalog-service";
import * as medicationService from "@/server/services/medication-service";
import { runAction, type ActionResult } from "./helpers";

/** ---- Service catalog (كتالوج الخدمات) ---- */
export async function createServiceAction(input: Parameters<typeof serviceCatalog.createService>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_CREATE);
    return serviceCatalog.createService(actor, input);
  });
}

export async function updateServiceAction(input: { serviceId: string; data: Parameters<typeof serviceCatalog.updateService>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_EDIT);
    await serviceCatalog.updateService(actor, input.serviceId, input.data);
  });
}

export async function setServiceActiveAction(input: { serviceId: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(input.active ? GRANULAR_PERMISSIONS.SERVICES_EDIT : GRANULAR_PERMISSIONS.SERVICES_DISABLE);
    await serviceCatalog.setServiceActive(actor, input.serviceId, input.active);
  });
}

export async function deleteServiceAction(input: { serviceId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_DISABLE);
    await serviceCatalog.deleteService(actor, input.serviceId);
  });
}

/** ---- Medication catalog (دليل الأدوية) ---- */
export async function createMedicationAction(input: Parameters<typeof medicationService.createMedication>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_EDIT);
    return medicationService.createMedication(actor, input);
  });
}

export async function updateMedicationAction(input: { medicationId: string; data: Parameters<typeof medicationService.updateMedication>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_EDIT);
    await medicationService.updateMedication(actor, input.medicationId, input.data);
  });
}

export async function setMedicationActiveAction(input: { medicationId: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.SERVICES_EDIT);
    await medicationService.disableMedication(actor, input.medicationId, !input.active);
  });
}