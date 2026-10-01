"use server";

import { requireUser } from "@/lib/auth/authorize";
import * as notificationService from "@/server/services/notification-service";
import { runAction, type ActionResult } from "./helpers";

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireUser();
    await notificationService.markNotificationsRead(actor, ids);
  });
}

export async function listNotificationsAction(limit = 30): Promise<ActionResult<Awaited<ReturnType<typeof notificationService.listNotifications>>>> {
  return runAction(async () => {
    const actor = await requireUser();
    return notificationService.listNotifications(actor, limit);
  });
}