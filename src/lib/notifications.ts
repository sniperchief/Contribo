import type { BadgeTone } from "@/components/ui/badge";
import type { NotificationType } from "@/types/database";

/**
 * Notifications are created by the database when a contribution changes state
 * (see the contributions_notify trigger). This module only presents them.
 */

export type NotificationRow = {
  id: string;
  type: NotificationType;
  project_id: string | null;
  contribution_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
};

export const notificationLabels: Record<NotificationType, string> = {
  contribution_verified: "Verified",
  contribution_accepted: "Accepted",
  contribution_rejected: "Rejected",
  reward_approved: "Approved onchain · ready to claim",
  reward_claimed: "Paid",
  contribution_submitted: "Needs review",
};

/** Same colors as the contribution stage badges. */
export const notificationTones: Record<NotificationType, BadgeTone> = {
  contribution_verified: "neutral",
  contribution_accepted: "sky",
  contribution_rejected: "cream",
  reward_approved: "lavender",
  reward_claimed: "ink",
  contribution_submitted: "terracotta",
};

/** DOM id of a contribution row on the Contributions and project review pages. */
export function contributionAnchor(contributionId: string): string {
  return `contribution-${contributionId}`;
}

/**
 * Where a notification leads. Built from the stored IDs, never from a stored
 * URL, so a notification can only ever link inside the app.
 */
export function notificationHref(n: Pick<NotificationRow, "type" | "project_id" | "contribution_id">): string {
  if (n.type === "contribution_submitted") {
    if (!n.project_id) return "/founder";
    return `/founder/${n.project_id}${n.contribution_id ? `#${contributionAnchor(n.contribution_id)}` : "#review"}`;
  }
  return n.contribution_id ? `/dashboard#${contributionAnchor(n.contribution_id)}` : "/dashboard";
}

/** Badge text for an unread count: exact up to 99. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
