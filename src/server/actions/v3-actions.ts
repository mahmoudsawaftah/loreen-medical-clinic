"use server";

import { requirePermission } from "@/lib/auth/authorize";
import { GRANULAR_PERMISSIONS } from "@/lib/permissions";
import * as users from "@/server/services/user-service";
import * as campaigns from "@/server/services/campaign-service";
import * as messages from "@/server/services/messages-service";
import { runAction, type ActionResult } from "./helpers";

export async function listCommunicationLogsAction(input: Parameters<typeof messages.listCommunicationLogs>[1]): Promise<ActionResult<Awaited<ReturnType<typeof messages.listCommunicationLogs>>>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_READ);
    return messages.listCommunicationLogs(actor, input);
  });
}

/** ---- Users & permissions (Owner) ---- */
export async function createUserV3Action(input: Parameters<typeof users.createUser>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    return users.createUser(actor, input);
  });
}

export async function updateUserV3Action(input: { userId: string; data: Parameters<typeof users.updateUser>[2] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.updateUser(actor, input.userId, input.data);
  });
}

export async function setUserPermissionsAction(input: { userId: string; granted: string[]; denied: string[] }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.setUserPermissions(actor, input.userId, input);
  });
}

export async function resetUserPermissionsAction(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.resetUserPermissions(actor, input.userId);
  });
}

export async function deactivateUserAction(input: { userId: string; reason: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.deactivateUser(actor, input.userId, input.reason);
  });
}

export async function reactivateUserAction(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.reactivateUser(actor, input.userId);
  });
}

export async function resetUserPasswordAction(input: { userId: string; password: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.resetPassword(actor, input.userId, input.password);
  });
}

export async function deleteUserAction(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.USERS_MANAGE);
    await users.deleteUser(actor, input.userId);
  });
}

/** ---- Promotional campaigns ---- */
export async function previewCampaignAction(input: Parameters<typeof campaigns.previewCampaign>[1]): Promise<ActionResult<ReturnType<typeof campaigns.previewCampaign> extends Promise<infer T> ? T : never>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE);
    return campaigns.previewCampaign(actor, input);
  });
}

export async function createCampaignAction(input: Parameters<typeof campaigns.createCampaign>[1]): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_CREATE);
    return campaigns.createCampaign(actor, input);
  });
}

export async function sendTestMessageAction(input: { campaignId: string; testPhone: string }): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
    return campaigns.sendTestMessage(actor, input.campaignId, input.testPhone);
  });
}

export async function sendCampaignAction(input: { campaignId: string }): Promise<ActionResult<{ status: string; total: number; failed: number }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
    return campaigns.sendCampaign(actor, input.campaignId);
  });
}

export async function scheduleCampaignAction(input: { campaignId: string; scheduledFor: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
    await campaigns.scheduleCampaign(actor, input.campaignId, input.scheduledFor);
  });
}

export async function cancelCampaignAction(input: { campaignId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
    await campaigns.cancelCampaign(actor, input.campaignId);
  });
}

export async function retryCampaignAction(input: { campaignId: string }): Promise<ActionResult<{ status: string; retried: number; failed: number }>> {
  return runAction(async () => {
    const actor = await requirePermission(GRANULAR_PERMISSIONS.MESSAGES_CAMPAIGN_SEND);
    return campaigns.retryFailedRecipients(actor, input.campaignId);
  });
}