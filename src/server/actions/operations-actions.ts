"use server";

import { requirePermission } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import * as patientService from "@/server/services/patient-service";
import * as visitService from "@/server/services/visit-service";
import * as treatmentService from "@/server/services/treatment-service";
import * as billingService from "@/server/services/billing-service";
import { runAction, type ActionResult } from "./helpers";

/** ---- Patients ---- */
export async function createPatientAction(input: Parameters<typeof patientService.createPatient>[1]): Promise<ActionResult<{ id: string; customerNo: number }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PATIENTS_CREATE);
    return patientService.createPatient(actor, input);
  });
}

export async function updatePatientContactAction(input: { customerId: string; data: Parameters<typeof patientService.updatePatientContact>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PATIENTS_EDIT_DEMOGRAPHICS);
    await patientService.updatePatientContact(actor, input.customerId, input.data);
  });
}

export async function updateMedicalProfileAction(input: { customerId: string; data: Parameters<typeof patientService.updateMedicalProfile>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL);
    await patientService.updateMedicalProfile(actor, input.customerId, input.data);
  });
}

export async function addMedicalEventAction(input: { customerId: string; data: Parameters<typeof patientService.addMedicalEvent>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PATIENTS_EDIT_MEDICAL);
    await patientService.addMedicalEvent(actor, input.customerId, input.data);
  });
}

/** ---- Visits ---- */
export async function createVisitAction(input: Parameters<typeof visitService.createVisit>[1]): Promise<ActionResult<{ id: string; visitNo: number }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    return visitService.createVisit(actor, input);
  });
}

export async function checkInVisitAction(visitId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    await visitService.checkInVisit(actor, visitId);
  });
}

export async function startWithDoctorAction(visitId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    await visitService.startWithDoctor(actor, visitId);
  });
}

export async function assignVisitDoctorAction(input: { visitId: string; doctorId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_ASSIGN_DOCTOR);
    await visitService.assignVisitDoctor(actor, input.visitId, input.doctorId);
  });
}

export async function returnToWaitingAction(visitId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    await visitService.returnToWaiting(actor, visitId);
  });
}

export async function cancelVisitAction(input: { visitId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    await visitService.cancelVisit(actor, input.visitId, input.reason);
  });
}

export async function closeVisitAction(visitId: string): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.VISIT_MANAGE);
    await visitService.closeVisit(actor, visitId);
  });
}

/** ---- Treatments ---- */
export async function saveTreatmentDraftAction(input: { visitId: string; data: Parameters<typeof treatmentService.saveTreatmentDraft>[2] }): Promise<ActionResult<{ treatmentId: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.TREATMENTS_CREATE);
    return treatmentService.saveTreatmentDraft(actor, input.visitId, input.data);
  });
}

export async function sendToCashierAction(input: { visitId: string; followUps?: Parameters<typeof treatmentService.sendToCashier>[2] }): Promise<ActionResult<{ treatmentId: string; invoiceId: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.TREATMENTS_COMPLETE);
    return treatmentService.sendToCashier(actor, input.visitId, input.followUps ?? []);
  });
}

/** ---- Billing ---- */
export async function applyDiscountAction(input: { invoiceId: string; data: Parameters<typeof billingService.applyDiscount>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PRICING_DISCOUNT);
    await billingService.applyDiscount(actor, input.invoiceId, input.data);
  });
}

export async function applyTreatmentDiscountAction(input: { visitId: string; data: Parameters<typeof billingService.applyTreatmentDiscount>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PRICING_DISCOUNT);
    await billingService.applyTreatmentDiscount(actor, input.visitId, input.data);
  });
}

export async function reopenVisitForCorrectionAction(input: { visitId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PAYMENTS_VOID);
    await billingService.reopenVisitForCorrection(actor, input.visitId, input.reason);
  });
}

export async function collectPaymentAction(input: Parameters<typeof billingService.collectPayment>[1]): Promise<ActionResult<{ paymentId: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PAYMENTS_COLLECT);
    return billingService.collectPayment(actor, input);
  });
}

export async function adjustInvoiceAmountAction(input: Parameters<typeof billingService.adjustInvoiceAmount>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PAYMENTS_COLLECT);
    await billingService.adjustInvoiceAmount(actor, input);
  });
}

export async function voidPaymentAction(input: { paymentId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PAYMENTS_VOID);
    await billingService.voidPayment(actor, input.paymentId, input.reason);
  });
}

export async function voidInvoiceAction(input: { invoiceId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.PAYMENTS_VOID);
    await billingService.voidInvoice(actor, input.invoiceId, input.reason);
  });
}
