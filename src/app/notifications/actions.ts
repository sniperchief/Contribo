"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { NotificationRow } from "@/lib/notifications";
import { runAction } from "@/lib/server/run-action";
import { requireViewer } from "@/lib/server/viewer";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Most recent notifications shown in the header panel; older ones stay stored. */
const PANEL_LIMIT = 20;

/** The viewer's latest notifications. Row Level Security returns only their own. */
export async function listNotifications(): Promise<ActionResult<NotificationRow[]>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { data, error } = await viewer.supabase
      .from("notifications")
      .select("id, type, project_id, contribution_id, message, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(PANEL_LIMIT);
    return error ? fail("Could not load notifications.") : ok((data ?? []) as NotificationRow[]);
  });
}

/**
 * Marks notifications read with the viewer's own session. Row Level Security
 * limits the update to the viewer's notifications, and column privileges limit
 * it to read_at, so no ID passed here can touch anyone else's.
 */
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!UUID_RE.test(notificationId)) return fail("Notification not found.");
    const { error } = await viewer.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .is("read_at", null);
    return error ? fail("Could not update the notification.") : ok();
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { error } = await viewer.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", viewer.userId)
      .is("read_at", null);
    return error ? fail("Could not update notifications.") : ok();
  });
}
