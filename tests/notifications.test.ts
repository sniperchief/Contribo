import { describe, expect, it } from "vitest";
import { ContributionStatusOnchain } from "@/lib/contracts/config";
import { contributionAnchor, notificationHref, unreadBadge } from "@/lib/notifications";
import { planContributionSync, reconcileContribution } from "@/lib/rules";

const WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
const TX = `0x${"a".repeat(64)}`;
const NOW = "2026-10-20T12:00:00.000Z";

const unsynced = { approvedOnchainAt: null, claimedAt: null, approvalTxHash: null, claimTxHash: null };

function reconciled(status: number) {
  const result = reconcileContribution({
    stored: { contributorWallet: WALLET, rewardAmount: "100" },
    onchain: { contributor: WALLET, amount: 100n, status },
  });
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("contribution sync (what can trigger reward notifications)", () => {
  it("an onchain approval records approval only, never payment", () => {
    const update = planContributionSync({
      stored: unsynced,
      reconciled: reconciled(ContributionStatusOnchain.Approved),
      txHash: TX,
      txEmitted: { approval: true, claim: false },
      now: NOW,
    });
    expect(update).toEqual({ approved_onchain_at: NOW, approval_tx_hash: TX });
  });

  it("a failed or reverted claim leaves the reward approved and unpaid", () => {
    const update = planContributionSync({
      stored: { ...unsynced, approvedOnchainAt: NOW },
      reconciled: reconciled(ContributionStatusOnchain.Approved),
      txHash: TX,
      // The receipt was not successful, so it emitted nothing.
      txEmitted: { approval: false, claim: false },
      now: NOW,
    });
    expect(update).toEqual({});
  });

  it("a confirmed claim records payment; the hash only if its receipt emitted RewardClaimed", () => {
    const stored = { ...unsynced, approvedOnchainAt: NOW };
    expect(
      planContributionSync({
        stored,
        reconciled: reconciled(ContributionStatusOnchain.Claimed),
        txHash: TX,
        txEmitted: { approval: false, claim: true },
        now: NOW,
      }),
    ).toEqual({ claimed_at: NOW, claim_tx_hash: TX });
    // Claim confirmed by contract state, but the supplied hash is some other transaction.
    expect(
      planContributionSync({
        stored,
        reconciled: reconciled(ContributionStatusOnchain.Claimed),
        txHash: TX,
        txEmitted: { approval: false, claim: false },
        now: NOW,
      }),
    ).toEqual({ claimed_at: NOW });
  });

  it("re-syncing an already recorded state is a no-op (page reloads, retries)", () => {
    const update = planContributionSync({
      stored: { approvedOnchainAt: NOW, claimedAt: NOW, approvalTxHash: TX, claimTxHash: TX },
      reconciled: reconciled(ContributionStatusOnchain.Claimed),
      txHash: TX,
      txEmitted: { approval: true, claim: true },
      now: "2026-10-21T00:00:00.000Z",
    });
    expect(update).toEqual({});
  });

  it("nothing is recorded while the contract has no approval", () => {
    const result = reconcileContribution({
      stored: { contributorWallet: WALLET, rewardAmount: "100" },
      onchain: { contributor: "0x0000000000000000000000000000000000000000", amount: 0n, status: ContributionStatusOnchain.None },
    });
    expect(result).toEqual({ ok: true, approved: false, claimed: false });
    if (!result.ok) return;
    expect(planContributionSync({ stored: unsynced, reconciled: result, txHash: TX, txEmitted: { approval: true, claim: true }, now: NOW })).toEqual({});
  });

  it("an approval that differs from the accepted reward is refused", () => {
    const result = reconcileContribution({
      stored: { contributorWallet: WALLET, rewardAmount: "100" },
      onchain: { contributor: WALLET, amount: 999n, status: ContributionStatusOnchain.Approved },
    });
    expect(result.ok).toBe(false);
  });
});

describe("notification links", () => {
  const contribution = "11111111-2222-4333-8444-555555555555";
  const project = "66666666-7777-4888-8999-aaaaaaaaaaaa";

  it("lead contributors to the contribution on Contributions", () => {
    for (const type of ["contribution_verified", "contribution_accepted", "contribution_rejected", "reward_approved", "reward_claimed"] as const) {
      expect(notificationHref({ type, project_id: project, contribution_id: contribution })).toBe(
        `/dashboard#${contributionAnchor(contribution)}`,
      );
    }
  });

  it("lead founders to the contribution in the project's review list", () => {
    expect(notificationHref({ type: "contribution_submitted", project_id: project, contribution_id: contribution })).toBe(
      `/founder/${project}#contribution-${contribution}`,
    );
    expect(notificationHref({ type: "contribution_submitted", project_id: project, contribution_id: null })).toBe(
      `/founder/${project}#review`,
    );
  });

  it("always stay inside the app", () => {
    expect(notificationHref({ type: "reward_claimed", project_id: null, contribution_id: null })).toBe("/dashboard");
    expect(notificationHref({ type: "contribution_submitted", project_id: null, contribution_id: null })).toBe("/founder");
  });

  it("show an unread badge only when there is something unread", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(7)).toBe("7");
    expect(unreadBadge(250)).toBe("99+");
  });
});
