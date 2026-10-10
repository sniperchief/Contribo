import { keccak256, toBytes, type Hex } from "viem";
import type { ContributionStatus } from "@/types/database";

/**
 * The onchain contribution reference for a pull request. Derived from GitHub's
 * immutable numeric repository ID, so renames cannot create duplicates.
 */
export function contributionRef(githubRepoId: number | bigint | string, prNumber: number): Hex {
  return keccak256(toBytes(`github:${BigInt(githubRepoId)}:${prNumber}`));
}

/**
 * Lifecycle shown to users. "detected" PRs exist only on GitHub and are never stored.
 *
 * detected → verified (server checked GitHub evidence) → accepted (approver set a reward)
 *          → approved (approval confirmed onchain; claimable by the contributor wallet) → paid
 */
export type ContributionStage = "submitted" | "verified" | "accepted" | "approved" | "paid" | "rejected";

export function contributionStage(row: {
  status: ContributionStatus;
  approved_onchain_at: string | null;
  claimed_at: string | null;
}): ContributionStage {
  if (row.claimed_at) return "paid";
  if (row.approved_onchain_at) return "approved";
  return row.status;
}

export const stageLabels: Record<ContributionStage | "detected" | "claimable", string> = {
  detected: "Detected",
  submitted: "Submitted",
  verified: "Verified",
  accepted: "Accepted",
  approved: "Approved onchain",
  claimable: "Claimable",
  paid: "Paid",
  rejected: "Rejected",
};

export const stageDescriptions: Record<ContributionStage | "detected" | "claimable", string> = {
  detected: "Merged pull request found on GitHub. Not yet submitted or verified.",
  submitted: "Waiting for server-side verification.",
  verified: "GitHub evidence verified. Waiting for a project approver to decide on a reward.",
  accepted: "Reward amount set. Waiting for the approval transaction to confirm onchain.",
  approved: "Reward approved onchain and reserved for the contributor wallet.",
  claimable: "Approved onchain. Your connected wallet can claim it now.",
  paid: "Reward claimed onchain.",
  rejected: "Not eligible for a reward.",
};
