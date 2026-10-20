import { describe, expect, it } from "vitest";
import { BountyStatusOnchain, ContributionStatusOnchain } from "@/lib/contracts/config";
import {
  assetLabels,
  booksBalance,
  bountyAvailability,
  buildRewardLedger,
  compareAssetAmountsDesc,
  isStaleBlock,
  STALE_AFTER_SECONDS,
  totalsByAsset,
  type AssetAmount,
  type BountyInput,
  type OnchainContribution,
  type ProjectBalances,
  type RewardRecord,
} from "@/lib/transparency";

const NOW = 1_800_000_000n;
const MON = "0x0000000000000000000000000000000000000000";
const USDC = "0x1111111111111111111111111111111111111111";
const FAKE_USDC = "0x2222222222222222222222222222222222222222";

/** Balances that satisfy the contract's identity. */
function balances(b: Omit<ProjectBalances, "totalDeposited">): ProjectBalances {
  return { ...b, totalDeposited: b.available + b.escrowed + b.committed + b.totalPaid + b.totalWithdrawn };
}

function bounty(id: bigint, amount: bigint, status: number, deadline = NOW + 86_400n): BountyInput {
  return { id, amount, deadline, status, title: `Bounty ${id}` };
}

function record(id: string, ref: string, claimedAt: string | null = null, claimTxHash: string | null = null): RewardRecord {
  return { id, ref, prTitle: `PR ${id}`, prNumber: 1, prUrl: `https://github.com/o/r/pull/1`, githubLogin: "dev", claimTxHash, claimedAt };
}

describe("contract accounting identity", () => {
  it("holds for balances the contract would produce, and fails otherwise", () => {
    expect(booksBalance(balances({ available: 5n, escrowed: 3n, committed: 2n, totalPaid: 7n, totalWithdrawn: 1n }))).toBe(true);
    expect(
      booksBalance({ available: 5n, escrowed: 3n, committed: 2n, totalPaid: 7n, totalWithdrawn: 1n, totalDeposited: 19n }),
    ).toBe(false);
  });
});

describe("bounty availability", () => {
  it("open bounties keep their full amount until awarded; the deadline matches the contract's cancel rule", () => {
    expect(bountyAvailability({ amount: 10n, deadline: NOW, status: BountyStatusOnchain.Open }, NOW)).toEqual({ state: "open", remaining: 10n });
    expect(bountyAvailability({ amount: 10n, deadline: NOW, status: BountyStatusOnchain.Open }, NOW + 1n)).toEqual({
      state: "past-deadline",
      remaining: 10n,
    });
    expect(bountyAvailability({ amount: 10n, deadline: NOW, status: BountyStatusOnchain.Awarded }, NOW)).toEqual({
      state: "awarded",
      remaining: 0n,
    });
    expect(bountyAvailability({ amount: 10n, deadline: NOW, status: BountyStatusOnchain.Cancelled }, NOW)).toEqual({
      state: "cancelled",
      remaining: 0n,
    });
  });
});

describe("reward ledger", () => {
  // Project: deposited 100. Bounty #1 (30) open, #2 (20) awarded → committed, #3 (15) cancelled → back to available.
  // Pool approval of 10 claimed. Owner withdrew 5.
  const b = balances({ available: 35n, escrowed: 30n, committed: 20n, totalPaid: 10n, totalWithdrawn: 5n });
  const bounties = [
    bounty(1n, 30n, BountyStatusOnchain.Open),
    bounty(2n, 20n, BountyStatusOnchain.Awarded),
    bounty(3n, 15n, BountyStatusOnchain.Cancelled),
  ];
  const records = [record("awarded", "0xAA"), record("paid", "0xBB", "2026-10-01T00:00:00Z", `0x${"e".repeat(64)}`)];
  const onchain = new Map<string, OnchainContribution>([
    ["0xaa", { status: ContributionStatusOnchain.Approved, amount: 20n }],
    ["0xbb", { status: ContributionStatusOnchain.Claimed, amount: 10n }],
  ]);

  it("separates current balances from history and never double-counts an awarded bounty", () => {
    const ledger = buildRewardLedger({ balances: b, bounties, records, onchain, nowSeconds: NOW });
    expect(ledger.booksBalance).toBe(true);
    expect(ledger.consistent).toBe(true);
    // The awarded bounty is in committed (awaiting claim), not in the active bounty list or escrow.
    expect(ledger.bounties.active.map((x) => x.id)).toEqual([1n]);
    expect(ledger.bounties.activeTotal).toBe(b.escrowed);
    expect(ledger.bounties.unlistedEscrow).toBe(0n);
    expect(ledger.bounties.awardedCount).toBe(1);
    expect(ledger.bounties.cancelledCount).toBe(1);
    expect(ledger.awaitingClaim.map((r) => [r.id, r.amount])).toEqual([["awarded", 20n]]);
    expect(ledger.unlistedCommitted).toBe(0n);
    expect(ledger.payouts.map((r) => [r.id, r.amount])).toEqual([["paid", 10n]]);
    expect(ledger.unlistedPaid).toBe(0n);
    // The three current balances plus history add up to deposits.
    const { available, escrowed, committed, totalPaid, totalWithdrawn, totalDeposited } = ledger.balances;
    expect(available + escrowed + committed + totalPaid + totalWithdrawn).toBe(totalDeposited);
  });

  it("trusts the contract over the database: a record marked unpaid that the chain shows claimed is listed as paid", () => {
    const ledger = buildRewardLedger({
      balances: b,
      bounties,
      records: [record("awarded", "0xaa"), record("paid", "0xbb", null)],
      onchain,
      nowSeconds: NOW,
    });
    expect(ledger.payouts.map((r) => r.id)).toEqual(["paid"]);
  });

  it("does not list records the contract does not know about", () => {
    const ledger = buildRewardLedger({
      balances: b,
      bounties,
      records: [...records, record("forged", "0xcc", "2026-10-02T00:00:00Z")],
      onchain: new Map([...onchain, ["0xcc", { status: ContributionStatusOnchain.None, amount: 0n }]]),
      nowSeconds: NOW,
    });
    expect(ledger.payouts.map((r) => r.id)).toEqual(["paid"]);
    expect(ledger.consistent).toBe(true);
  });

  it("ignores duplicate records and duplicate bounties", () => {
    const ledger = buildRewardLedger({
      balances: b,
      bounties: [...bounties, bounty(1n, 30n, BountyStatusOnchain.Open)],
      records: [...records, record("paid-again", "0xBB", "2026-10-03T00:00:00Z")],
      onchain,
      nowSeconds: NOW,
    });
    expect(ledger.bounties.activeTotal).toBe(30n);
    expect(ledger.payouts).toHaveLength(1);
    expect(ledger.consistent).toBe(true);
  });

  it("reports claims and escrow it could not attribute instead of hiding them", () => {
    const ledger = buildRewardLedger({ balances: b, bounties: [], records: [], onchain: new Map(), nowSeconds: NOW });
    expect(ledger.bounties.unlistedEscrow).toBe(30n);
    expect(ledger.unlistedPaid).toBe(10n);
    expect(ledger.unlistedCommitted).toBe(20n);
    expect(ledger.consistent).toBe(true);
  });

  it("flags figures that exceed the contract totals", () => {
    const ledger = buildRewardLedger({
      balances: balances({ available: 0n, escrowed: 5n, committed: 0n, totalPaid: 0n, totalWithdrawn: 0n }),
      bounties: [bounty(1n, 30n, BountyStatusOnchain.Open)],
      records: [],
      onchain: new Map(),
      nowSeconds: NOW,
    });
    expect(ledger.consistent).toBe(false);
  });

  it("flags balances that break the identity", () => {
    const ledger = buildRewardLedger({
      balances: { ...b, totalDeposited: b.totalDeposited + 1n },
      bounties,
      records,
      onchain,
      nowSeconds: NOW,
    });
    expect(ledger.booksBalance).toBe(false);
    expect(ledger.consistent).toBe(false);
  });

  it("orders active bounties by deadline and marks expired ones", () => {
    const ledger = buildRewardLedger({
      balances: balances({ available: 0n, escrowed: 30n, committed: 0n, totalPaid: 0n, totalWithdrawn: 0n }),
      bounties: [bounty(5n, 10n, BountyStatusOnchain.Open, NOW + 100n), bounty(6n, 20n, BountyStatusOnchain.Open, NOW - 100n)],
      records: [],
      onchain: new Map(),
      nowSeconds: NOW,
    });
    expect(ledger.bounties.active.map((x) => [x.id, x.state])).toEqual([
      [6n, "past-deadline"],
      [5n, "open"],
    ]);
  });
});

describe("chain read freshness", () => {
  it("is current within the threshold and stale beyond it", () => {
    const nowMs = Number(NOW) * 1000;
    expect(isStaleBlock(NOW, nowMs)).toBe(false);
    expect(isStaleBlock(NOW - BigInt(STALE_AFTER_SECONDS), nowMs)).toBe(false);
    expect(isStaleBlock(NOW - BigInt(STALE_AFTER_SECONDS) - 1n, nowMs)).toBe(true);
  });
});

describe("multiple tokens", () => {
  const items: AssetAmount[] = [
    { asset: MON, symbol: "MON", decimals: 18, amount: 3n * 10n ** 18n },
    { asset: USDC, symbol: "USDC", decimals: 6, amount: 50_000_000n },
    { asset: MON, symbol: "MON", decimals: 18, amount: 10n ** 18n },
    { asset: USDC.toUpperCase().replace("0X", "0x"), symbol: "USDC", decimals: 6, amount: 1_000_000n },
    { asset: FAKE_USDC, symbol: "USDC", decimals: 18, amount: 7n },
  ];

  it("totals each asset separately, keyed by address, MON first", () => {
    expect(totalsByAsset(items).map((t) => [t.asset, t.amount])).toEqual([
      [MON, 4n * 10n ** 18n],
      [USDC, 51_000_000n],
      [FAKE_USDC, 7n],
    ]);
  });

  it("never compares raw amounts across different tokens", () => {
    const bigUsdc = { asset: USDC, symbol: "USDC", decimals: 6, amount: 10n ** 30n };
    const smallMon = { asset: MON, symbol: "MON", decimals: 18, amount: 1n };
    // MON sorts first as a group, regardless of the raw numbers.
    expect(compareAssetAmountsDesc(smallMon, bigUsdc)).toBeLessThan(0);
    expect(compareAssetAmountsDesc(bigUsdc, smallMon)).toBeGreaterThan(0);
    // Within one asset, larger first.
    expect(compareAssetAmountsDesc({ ...smallMon, amount: 5n }, smallMon)).toBeLessThan(0);
    // Unknown amounts last.
    expect(compareAssetAmountsDesc(null, smallMon)).toBeGreaterThan(0);
  });

  it("disambiguates tokens that share a symbol", () => {
    const labels = assetLabels(items);
    expect(labels.get(MON)).toBe("MON");
    expect(labels.get(USDC)).toMatch(/^USDC \(0x1111…1111\)$/);
    expect(labels.get(FAKE_USDC)).toMatch(/^USDC \(0x2222…2222\)$/);
  });
});
