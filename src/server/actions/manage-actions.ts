"use server";

import { requirePermission, requireRole } from "@/lib/auth/authorize";
import { PERMISSIONS, GRANULAR_PERMISSIONS } from "@/lib/permissions";
import * as inventory from "@/server/services/inventory-service";
import * as purchases from "@/server/services/purchase-service";
import * as expenses from "@/server/services/expense-service";
import * as payroll from "@/server/services/payroll-service";
import * as crm from "@/server/services/crm-service";
import * as closing from "@/server/services/closing-service";
import * as settingsSvc from "@/server/services/settings-service";
import * as users from "@/server/services/user-service";
import { runAction, type ActionResult } from "./helpers";

/** ---- Inventory ---- */
export async function createProductAction(input: Parameters<typeof inventory.createProduct>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_MANAGE);
    return inventory.createProduct(actor, input);
  });
}

export async function updateProductAction(input: { productId: string; data: Parameters<typeof inventory.updateProduct>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT);
    await inventory.updateProduct(actor, input.productId, input.data);
  });
}

export async function addStockAction(input: { productId: string; data: Parameters<typeof inventory.addStock>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.INVENTORY_ADD_STOCK);
    await inventory.addStock(actor, input.productId, input.data);
  });
}

export async function deleteProductAction(input: { productId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.INVENTORY_DELETE);
    await inventory.deleteProduct(actor, input.productId);
  });
}

export async function setProductActiveAction(input: { productId: string; active: boolean }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.INVENTORY_EDIT_PRODUCT);
    await inventory.setProductActive(actor, input.productId, input.active);
  });
}

export async function adjustStockAction(input: { productId: string; data: Parameters<typeof inventory.adjustStock>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_ADJUST);
    await inventory.adjustStock(actor, input.productId, input.data);
  });
}

export async function createSupplierAction(input: Parameters<typeof inventory.createSupplier>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.INVENTORY_MANAGE);
    return inventory.createSupplier(actor, input);
  });
}

export async function createServiceAction(input: Parameters<typeof settingsSvc.createService>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireRole(["OWNER"]);
    return settingsSvc.createService(actor, input);
  });
}

/** ---- Purchasing ---- */
export async function createPurchaseRequestAction(input: Parameters<typeof purchases.createPurchaseRequest>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PURCHASE_OPERATIONAL_CREATE);
    if (input.type === "MEDICAL") {
      await requirePermission(PERMISSIONS.PURCHASE_MEDICAL_CREATE);
    }
    return purchases.createPurchaseRequest(actor, input);
  });
}

export async function approvePurchaseRequestAction(input: { requestId: string; action: "APPROVED" | "REJECTED" | "NEEDS_CHANGES"; reason?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PURCHASE_APPROVE);
    await purchases.approvePurchaseRequest(actor, input.requestId, input.action, input.reason);
  });
}

export async function createPurchaseAction(input: Parameters<typeof purchases.createPurchase>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PURCHASE_RECEIVE);
    return purchases.createPurchase(actor, input);
  });
}

export async function voidPurchaseAction(input: { purchaseId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PURCHASE_RECEIVE);
    await purchases.voidPurchase(actor, input.purchaseId, input.reason);
  });
}

/** ---- Expenses ---- */
export async function createExpenseCategoryAction(input: Parameters<typeof expenses.createExpenseCategory>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireRole(["OWNER", "ACCOUNTANT"]);
    return expenses.createExpenseCategory(actor, input);
  });
}

export async function createExpenseAction(input: Parameters<typeof expenses.createExpense>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.EXPENSE_MANAGE);
    return expenses.createExpense(actor, input);
  });
}

export async function approveExpenseAction(input: { expenseId: string; action: "APPROVED" | "REJECTED"; reason?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.EXPENSE_APPROVE);
    await expenses.approveExpense(actor, input.expenseId, input.action, input.reason);
  });
}

export async function voidExpenseAction(input: { expenseId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.EXPENSE_MANAGE);
    await expenses.voidExpense(actor, input.expenseId, input.reason);
  });
}

/** ---- Payroll & employees ---- */
export async function createEmployeeAction(input: Parameters<typeof payroll.createEmployee>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    return payroll.createEmployee(actor, input);
  });
}

export async function updateEmployeeAction(input: { employeeId: string; data: Parameters<typeof payroll.updateEmployee>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    await payroll.updateEmployee(actor, input.employeeId, input.data);
  });
}

export async function changeSalaryAction(input: { employeeId: string; data: { monthlySalary: number; effectiveFrom: string; reason: string } }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    await payroll.changeSalary(actor, input.employeeId, input.data);
  });
}

export async function listSalaryHistoryAction(input: { employeeId: string }): Promise<ActionResult<Awaited<ReturnType<typeof payroll.listSalaryHistory>>>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    return payroll.listSalaryHistory(actor, input.employeeId);
  });
}

export async function endEmploymentAction(input: { employeeId: string; endDate: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    await payroll.endEmployment(actor, input.employeeId, input.endDate);
  });
}

export async function reactivateEmployeeAction(input: { employeeId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    await payroll.reactivateEmployee(actor, input.employeeId);
  });
}

export async function deleteEmployeeAction(input: { employeeId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    await payroll.deleteEmployee(actor, input.employeeId);
  });
}

export async function ensurePayrollPeriodAction(input: { month: number; year: number }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.PAYROLL_MANAGE);
    return payroll.ensurePayrollPeriod(actor, input.month, input.year);
  });
}

export async function createUserAction(input: Parameters<typeof users.createUser>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    return users.createUser(actor, input);
  });
}

export async function updateUserAction(input: { userId: string; data: Parameters<typeof users.updateUser>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.USERS_MANAGE);
    await users.updateUser(actor, input.userId, input.data);
  });
}

/** ---- CRM ---- */
export async function createFollowUpAction(input: Parameters<typeof crm.createFollowUp>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.CRM_MANAGE);
    return crm.createFollowUp(actor, input);
  });
}

export async function completeFollowUpAction(input: { taskId: string; status: "CONTACTED" | "BOOKED" | "NO_ANSWER" | "CLOSED"; notes?: string | null }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.CRM_MANAGE);
    await crm.completeFollowUp(actor, input.taskId, input.status, input.notes);
  });
}

export async function sendCommunicationAction(input: Parameters<typeof crm.sendCommunication>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.MESSAGING_SEND);
    return crm.sendCommunication(actor, input);
  });
}

/** ---- Day closing ---- */
export async function closeDayAction(input: { date: string; data: { actualCash: number; actualCliq: number; actualVisa: number; notes?: string | null; varianceExplanation?: string | null } }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.CLOSING_PREPARE);
    await closing.closeDay(actor, new Date(input.date), input.data);
  });
}

export async function approveDayAction(input: { date: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.CLOSING_APPROVE);
    await closing.approveDay(actor, new Date(input.date));
  });
}

export async function returnDayForReviewAction(input: { date: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.CLOSING_REVIEW);
    await closing.returnDayForReview(actor, new Date(input.date), input.reason);
  });
}

export async function reopenDayAction(input: { date: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireRole(["OWNER"]);
    await closing.reopenDay(actor, new Date(input.date), input.reason);
  });
}

/** ---- Settings ---- */
export async function updateSettingsAction(input: Parameters<typeof settingsSvc.updateClinicSettings>[1]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    await settingsSvc.updateClinicSettings(actor, input);
  });
}