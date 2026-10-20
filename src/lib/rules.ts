import type { Address, Hex } from "viem";
import { BountyStatusOnchain, ContributionStatusOnchain, isNativeAsset } from "@/lib/contracts/config";
import { sameHash } from "@/lib/policy";
import type { ContributionStatus } from "@/types/database";

/**
 * Pure authorization and approval rules shared by server actions. Keeping them
 * free of I/O lets us unit-test every decision the backend makes.
 */

export type ProjectAccess = {
  /** Owner of the project in Contribo (Supabase). */
  isOwner: boolean;
  /** Viewer's verified wallet is an approver of the project onchain. */
  isApprover: boolean;
};

export type Decision<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

export function canManageProject(access: ProjectAccess): Decision {
  return access.isOwner ? { ok: true } : { ok: false, reason: "Only the project owner can do this." };
}

export function canReviewContributions(access: ProjectAccess): Decision {
  return access.isOwner || access.isApprover
    ? { ok: true }
    : { ok: false, reason: "Only the project owner or an onchain approver can review contributions." };
}

/**
 * Accepting = an approver decides a verified contribution deserves a specific
 * reward. An acceptance can be revised (new amount, bounty or payout wallet)
 * until the approval is confirmed onchain, after which it is final.
 */
export function checkAcceptance(input: {
  status: ContributionStatus;
  approvedOnchain: boolean;
  contributorWallet: string | null;
  /** Onchain project owner; the contract refuses to reward it. */
  projectOwnerWallet: string | null;
  amount: bigint;
  bounty?: { belongsToProject: boolean; status: number; amount: bigint } | null;
}): Decision {
  if (input.approvedOnchain) return { ok: false, reason: "This reward is already approved onchain and is final." };
  if (input.status !== "verified" && input.status !== "accepted") {
    return { ok: false, reason: "Only verified contributions can be accepted." };
  }
  if (!input.contributorWallet) {
    return { ok: false, reason: "The contributor has not linked a verified wallet yet." };
  }
  if (input.projectOwnerWallet && input.contributorWallet.toLowerCase() === input.projectOwnerWallet.toLowerCase()) {
    return {
      ok: false,
      reason:
        "The contributor's payout wallet is the project owner wallet, which the contract cannot reward. The contributor must link a different payout wallet first.",
    };
  }
  if (input.bounty) {
    if (!input.bounty.belongsToProject) return { ok: false, reason: "That bounty belongs to another project." };
    if (input.bounty.status !== BountyStatusOnchain.Open) return { ok: false, reason: "That bounty is not open." };
    if (input.amount !== input.bounty.amount) return { ok: false, reason: "Bounty rewards must equal the bounty amount." };
    return { ok: true };
  }
  if (input.amount <= 0n) return { ok: false, reason: "The reward must be greater than zero." };
  return { ok: true };
}

/** A policy's reward asset ("MON" or a token address) must be the asset the project registered onchain. */
export function policyAssetMatches(policyAsset: string, onchainAsset: string): boolean {
  if (policyAsset.toUpperCase() === "MON") return isNativeAsset(onchainAsset);
  return policyAsset.toLowerCase() === onchainAsset.toLowerCase();
}

export type ApprovalPlan =
  | { kind: "pool"; projectId: bigint; ref: Hex; contributor: Address; amount: bigint }
  | { kind: "bounty"; bountyId: bigint; ref: Hex; contributor: Address; amount: bigint };

/**
 * Final checks before an approver signs `approveContribution` / `awardBounty`.
 * The contract cannot see GitHub or Supabase, so these checks are the backend's
 * responsibility: the project must be the registered onchain project, its
 * onchain policy hash must match the published policy, and the contribution
 * must be eligible under a published policy and not already approved.
 */
export function planApproval(input: {
  onchainProjectId: string | null;
  contribution: {
    status: ContributionStatus;
    rewardPolicyId: string | null;
    contributorWallet: string | null;
    rewardAmount: string | null;
    bountyId: string | null;
    onchainRef: string | null;
    approvedOnchainAt: string | null;
  };
  publishedPolicy: { policyHash: string | null; rewardAsset: string } | null;
  onchain: {
    asset: Address;
    policyHash: Hex;
    available: bigint;
    contributionStatus: number;
    bounty?: { projectId: bigint; status: number; amount: bigint } | null;
  };
}): Decision<{ plan: ApprovalPlan }> {
  const { contribution: c, onchain } = input;

  if (!input.onchainProjectId) return { ok: false, reason: "Register the project onchain first." };
  if (c.approvedOnchainAt || onchain.contributionStatus !== ContributionStatusOnchain.None) {
    return { ok: false, reason: "This contribution is already approved onchain." };
  }
  if (c.status !== "accepted") return { ok: false, reason: "Accept the contribution with a reward first." };
  if (!c.rewardPolicyId) {
    return { ok: false, reason: "The pull request was merged before any reward policy was published." };
  }
  const policy = input.publishedPolicy;
  if (!policy?.policyHash) return { ok: false, reason: "The project has no published reward policy." };
  if (!sameHash(policy.policyHash, onchain.policyHash)) {
    return { ok: false, reason: "The onchain policy hash does not match the published policy. Update it first." };
  }
  if (!policyAssetMatches(policy.rewardAsset, onchain.asset)) {
    return { ok: false, reason: "The published policy's reward asset differs from the project's onchain asset." };
  }
  if (!c.contributorWallet || !c.rewardAmount || !c.onchainRef) {
    return { ok: false, reason: "The contribution is missing reward details." };
  }

  const projectId = BigInt(input.onchainProjectId);
  const amount = BigInt(c.rewardAmount);
  const ref = c.onchainRef as Hex;
  const contributor = c.contributorWallet as Address;

  if (c.bountyId) {
    const bounty = onchain.bounty;
    if (!bounty || bounty.projectId !== projectId) return { ok: false, reason: "Bounty not found for this project." };
    if (bounty.status !== BountyStatusOnchain.Open) return { ok: false, reason: "The bounty is no longer open." };
    if (bounty.amount !== amount) return { ok: false, reason: "The bounty amount changed. Accept the contribution again." };
    return { ok: true, plan: { kind: "bounty", bountyId: BigInt(c.bountyId), ref, contributor, amount } };
  }

  if (amount > onchain.available) {
    return { ok: false, reason: "The project's available onchain balance is too low. Fund the project first." };
  }
  return { ok: true, plan: { kind: "pool", projectId, ref, contributor, amount } };
}

/**
 * Reconciles a stored contribution with the contract's record. A mismatch means
 * the approval onchain differs from what the backend verified.
 */
export function reconcileContribution(input: {
  stored: { contributorWallet: string | null; rewardAmount: string | null };
  onchain: { contributor: Address; amount: bigint; status: number };
}): Decision<{ approved: boolean; claimed: boolean }> {
  const { stored, onchain } = input;
  if (onchain.status === ContributionStatusOnchain.None) return { ok: true, approved: false, claimed: false };
  if (
    !stored.contributorWallet ||
    stored.contributorWallet.toLowerCase() !== onchain.contributor.toLowerCase() ||
    !stored.rewardAmount ||
    BigInt(stored.rewardAmount) !== onchain.amount
  ) {
    return { ok: false, reason: "The onchain approval does not match the accepted reward." };
  }
  return { ok: true, approved: true, claimed: onchain.status === ContributionStatusOnchain.Claimed };
}

export type ContributionSyncUpdate = {
  approved_onchain_at?: string;
  claimed_at?: string;
  approval_tx_hash?: string;
  claim_tx_hash?: string;
};

/**
 * The database update after reading a contribution from the contract. Stages
 * advance only from contract state: "approved" when the contract records the
 * approval, "paid" only when it records the claim (a failed or reverted claim
 * leaves it Approved). A transaction hash is stored only when its successful
 * receipt emitted the matching event. Already-recorded fields are never
 * rewritten, so repeated syncs produce an empty update and no new notification.
 */
export function planContributionSync(input: {
  stored: {
    approvedOnchainAt: string | null;
    claimedAt: string | null;
    approvalTxHash: string | null;
    claimTxHash: string | null;
  };
  reconciled: { approved: boolean; claimed: boolean };
  txHash: string | null;
  /** Whether `txHash` is a successful transaction that emitted the event for this contribution. */
  txEmitted: { approval: boolean; claim: boolean };
  now: string;
}): ContributionSyncUpdate {
  const { stored, reconciled, txHash, txEmitted } = input;
  const update: ContributionSyncUpdate = {};
  if (reconciled.approved && !stored.approvedOnchainAt) update.approved_onchain_at = input.now;
  if (reconciled.claimed && !stored.claimedAt) update.claimed_at = input.now;
  if (txHash && reconciled.approved && !stored.approvalTxHash && txEmitted.approval) update.approval_tx_hash = txHash;
  if (txHash && reconciled.claimed && !stored.claimTxHash && txEmitted.claim) update.claim_tx_hash = txHash;
  return update;
}
