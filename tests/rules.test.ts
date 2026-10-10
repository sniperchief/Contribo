import { describe, expect, it } from "vitest";
import { zeroAddress, type Address, type Hex } from "viem";
import { contributionRef } from "@/lib/contributions";
import {
  canManageProject,
  canReviewContributions,
  checkAcceptance,
  planApproval,
  policyAssetMatches,
  reconcileContribution,
} from "@/lib/rules";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const WALLET = "0x00000000000000000000000000000000000000c1" as Address;
const REF = contributionRef(555, 12);

function baseInput(overrides: Partial<Parameters<typeof planApproval>[0]> = {}): Parameters<typeof planApproval>[0] {
  return {
    onchainProjectId: "7",
    contribution: {
      status: "accepted",
      rewardPolicyId: "policy-v1",
      contributorWallet: WALLET,
      rewardAmount: "1000",
      bountyId: null,
      onchainRef: REF,
      approvedOnchainAt: null,
    },
    publishedPolicy: { policyHash: HASH, rewardAsset: "MON" },
    onchain: { asset: zeroAddress, policyHash: HASH, available: 5000n, contributionStatus: 0, bounty: null },
    ...overrides,
  };
}

describe("authorization", () => {
  it("only owners manage projects", () => {
    expect(canManageProject({ isOwner: true, isApprover: false }).ok).toBe(true);
    expect(canManageProject({ isOwner: false, isApprover: true }).ok).toBe(false);
    expect(canManageProject({ isOwner: false, isApprover: false }).ok).toBe(false);
  });

  it("owners and onchain approvers review contributions; others cannot", () => {
    expect(canReviewContributions({ isOwner: true, isApprover: false }).ok).toBe(true);
    expect(canReviewContributions({ isOwner: false, isApprover: true }).ok).toBe(true);
    expect(canReviewContributions({ isOwner: false, isApprover: false }).ok).toBe(false);
  });
});

describe("acceptance", () => {
  const OWNER = "0x00000000000000000000000000000000000000a1";
  const accept = (overrides: Partial<Parameters<typeof checkAcceptance>[0]> = {}) =>
    checkAcceptance({
      status: "verified",
      approvedOnchain: false,
      contributorWallet: WALLET,
      projectOwnerWallet: OWNER,
      amount: 1n,
      ...overrides,
    });

  it("requires a verified contribution and a verified contributor wallet", () => {
    expect(accept().ok).toBe(true);
    expect(accept({ status: "submitted" }).ok).toBe(false);
    expect(accept({ status: "rejected" }).ok).toBe(false);
    expect(accept({ contributorWallet: null }).ok).toBe(false);
    expect(accept({ amount: 0n }).ok).toBe(false);
  });

  it("can be revised until the approval is confirmed onchain", () => {
    expect(accept({ status: "accepted" }).ok).toBe(true);
    expect(accept({ status: "accepted", approvedOnchain: true })).toMatchObject({ ok: false, reason: expect.stringContaining("final") });
  });

  it("refuses the project owner's wallet as payout wallet (the contract would revert)", () => {
    expect(accept({ contributorWallet: OWNER.toUpperCase().replace("0X", "0x") })).toMatchObject({
      ok: false,
      reason: expect.stringContaining("project owner wallet"),
    });
  });

  it("bounty rewards must be an open bounty of this project, for its exact amount", () => {
    const bounty = { belongsToProject: true, status: 1, amount: 50n };
    expect(accept({ amount: 50n, bounty }).ok).toBe(true);
    expect(accept({ amount: 49n, bounty }).ok).toBe(false);
    expect(accept({ amount: 50n, bounty: { ...bounty, belongsToProject: false } }).ok).toBe(false);
    expect(accept({ amount: 50n, bounty: { ...bounty, status: 2 } }).ok).toBe(false);
  });
});

describe("approval planning (reward policy and project match)", () => {
  it("plans a pool approval when everything matches", () => {
    const result = planApproval(baseInput());
    expect(result).toEqual({
      ok: true,
      plan: { kind: "pool", projectId: 7n, ref: REF, contributor: WALLET, amount: 1000n },
    });
  });

  it("blocks when the onchain policy hash differs from the published policy", () => {
    const result = planApproval(baseInput({ onchain: { ...baseInput().onchain, policyHash: `0x${"cd".repeat(32)}` } }));
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("policy hash") });
  });

  it("blocks when the project has no published policy", () => {
    expect(planApproval(baseInput({ publishedPolicy: null })).ok).toBe(false);
  });

  it("blocks when the policy's reward asset differs from the onchain asset", () => {
    const result = planApproval(baseInput({ publishedPolicy: { policyHash: HASH, rewardAsset: "0x00000000000000000000000000000000000000ee" } }));
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("asset") });
  });

  it("blocks contributions merged before any policy (no policy in force)", () => {
    const input = baseInput();
    input.contribution.rewardPolicyId = null;
    expect(planApproval(input).ok).toBe(false);
  });

  it("blocks unregistered projects", () => {
    expect(planApproval(baseInput({ onchainProjectId: null })).ok).toBe(false);
  });

  it("blocks duplicates already approved onchain or recorded as approved", () => {
    expect(planApproval(baseInput({ onchain: { ...baseInput().onchain, contributionStatus: 1 } })).ok).toBe(false);
    const input = baseInput();
    input.contribution.approvedOnchainAt = "2026-01-01T00:00:00Z";
    expect(planApproval(input).ok).toBe(false);
  });

  it("blocks contributions that were not accepted with a reward", () => {
    const input = baseInput();
    input.contribution.status = "verified";
    expect(planApproval(input).ok).toBe(false);
  });

  it("blocks pool approvals above the available balance", () => {
    expect(planApproval(baseInput({ onchain: { ...baseInput().onchain, available: 999n } })).ok).toBe(false);
  });

  it("plans a bounty award only for an open bounty of this project with the same amount", () => {
    const input = baseInput();
    input.contribution.bountyId = "3";
    const bounty = { projectId: 7n, status: 1, amount: 1000n };

    expect(planApproval({ ...input, onchain: { ...input.onchain, bounty } })).toMatchObject({
      ok: true,
      plan: { kind: "bounty", bountyId: 3n },
    });
    expect(planApproval({ ...input, onchain: { ...input.onchain, bounty: { ...bounty, projectId: 8n } } }).ok).toBe(false);
    expect(planApproval({ ...input, onchain: { ...input.onchain, bounty: { ...bounty, status: 3 } } }).ok).toBe(false);
    expect(planApproval({ ...input, onchain: { ...input.onchain, bounty: { ...bounty, amount: 999n } } }).ok).toBe(false);
  });

  it("matches policy assets", () => {
    expect(policyAssetMatches("MON", zeroAddress)).toBe(true);
    expect(policyAssetMatches("mon", zeroAddress)).toBe(true);
    expect(policyAssetMatches("MON", "0x00000000000000000000000000000000000000ee")).toBe(false);
    expect(policyAssetMatches("0x00000000000000000000000000000000000000EE", "0x00000000000000000000000000000000000000ee")).toBe(true);
  });
});

describe("reconciling onchain state", () => {
  const stored = { contributorWallet: WALLET.toLowerCase(), rewardAmount: "1000" };

  it("reports nothing when not yet approved onchain", () => {
    expect(reconcileContribution({ stored, onchain: { contributor: zeroAddress, amount: 0n, status: 0 } })).toEqual({
      ok: true,
      approved: false,
      claimed: false,
    });
  });

  it("marks approved and claimed states", () => {
    expect(reconcileContribution({ stored, onchain: { contributor: WALLET, amount: 1000n, status: 1 } })).toMatchObject({
      approved: true,
      claimed: false,
    });
    expect(reconcileContribution({ stored, onchain: { contributor: WALLET, amount: 1000n, status: 2 } })).toMatchObject({
      approved: true,
      claimed: true,
    });
  });

  it("flags an onchain approval that differs from the accepted reward", () => {
    expect(reconcileContribution({ stored, onchain: { contributor: WALLET, amount: 999n, status: 1 } }).ok).toBe(false);
    expect(
      reconcileContribution({ stored, onchain: { contributor: "0x00000000000000000000000000000000000000c2", amount: 1000n, status: 1 } }).ok,
    ).toBe(false);
  });
});
