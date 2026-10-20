import { BountyStatusOnchain, ContributionStatusOnchain, isNativeAsset } from "@/lib/contracts/config";

/**
 * Reward transparency accounting, derived from ContriboRewards:
 *
 *   available       unallocated funds: the only balance the owner can put into
 *                   new bounties or pool approvals (or withdraw)
 *   escrowed        locked in Open bounties; leaves only by awardBounty (→ committed)
 *                   or cancelBounty after the deadline (→ available)
 *   committed       approved rewards not yet claimed; owed to contributors and
 *                   untouchable by anyone else
 *   totalPaid       cumulative claims (history, not a current balance)
 *   totalDeposited / totalWithdrawn  cumulative history
 *
 * The contract keeps totalDeposited == available + escrowed + committed + totalPaid
 * + totalWithdrawn. The three current balances are disjoint, so a bounty that
 * is awarded moves from escrowed to committed and is never counted twice.
 * Each project has exactly one asset; amounts of different assets are never added.
 */

export type ProjectBalances = {
  available: bigint;
  escrowed: bigint;
  committed: bigint;
  totalDeposited: bigint;
  totalPaid: bigint;
  totalWithdrawn: bigint;
};

export function booksBalance(b: ProjectBalances): boolean {
  return b.totalDeposited === b.available + b.escrowed + b.committed + b.totalPaid + b.totalWithdrawn;
}

// -----------------------------------------------------------------------------
// Bounties
// -----------------------------------------------------------------------------

export type BountyInput = { id: bigint; amount: bigint; deadline: bigint; status: number; title: string | null };

/**
 * open           escrowed and before its deadline
 * past-deadline  still escrowed and still awardable; the owner may now cancel it
 * awarded        moved to an approved reward; nothing left to win
 * cancelled      returned to available; nothing left to win
 */
export type BountyState = "open" | "past-deadline" | "awarded" | "cancelled";

export function bountyAvailability(
  bounty: Pick<BountyInput, "amount" | "deadline" | "status">,
  nowSeconds: bigint,
): { state: BountyState; remaining: bigint } {
  if (bounty.status === BountyStatusOnchain.Awarded) return { state: "awarded", remaining: 0n };
  if (bounty.status !== BountyStatusOnchain.Open) return { state: "cancelled", remaining: 0n };
  // The contract allows cancelling only when block.timestamp > deadline.
  return { state: nowSeconds > bounty.deadline ? "past-deadline" : "open", remaining: bounty.amount };
}

// -----------------------------------------------------------------------------
// Ledger
// -----------------------------------------------------------------------------

/** A contribution Contribo recorded as approved onchain; the chain decides its real state. */
export type RewardRecord = {
  id: string;
  ref: string;
  prTitle: string | null;
  prNumber: number;
  prUrl: string;
  githubLogin: string;
  claimTxHash: string | null;
  claimedAt: string | null;
};

export type OnchainContribution = { status: number; amount: bigint };

export type RewardLedger = {
  balances: ProjectBalances;
  booksBalance: boolean;
  bounties: {
    active: (BountyInput & { state: "open" | "past-deadline"; remaining: bigint })[];
    awardedCount: number;
    cancelledCount: number;
    /** Sum of the active bounties found. Equals `escrowed` when every open bounty was found. */
    activeTotal: bigint;
    /** Escrow held by open bounties outside the scanned range (0 when all were found). */
    unlistedEscrow: bigint;
  };
  /** Claims confirmed by contract state, newest first. */
  payouts: (RewardRecord & { amount: bigint })[];
  /** Part of totalPaid not matched to a Contribo record (e.g. a claim never synced back). */
  unlistedPaid: bigint;
  /** Approved and not yet claimed, per contract state. */
  awaitingClaim: (RewardRecord & { amount: bigint })[];
  unlistedCommitted: bigint;
  /** False if any listed figure exceeds the contract totals it belongs to. */
  consistent: boolean;
};

/**
 * Builds the transparency ledger. Every figure comes from the contract (read at
 * one block); database records only name the rows, and only rows the contract
 * confirms are listed.
 */
export function buildRewardLedger(input: {
  balances: ProjectBalances;
  bounties: BountyInput[];
  records: RewardRecord[];
  /** getContribution results keyed by lowercase ref. */
  onchain: Map<string, OnchainContribution>;
  nowSeconds: bigint;
}): RewardLedger {
  const { balances } = input;

  const active: RewardLedger["bounties"]["active"] = [];
  let awardedCount = 0;
  let cancelledCount = 0;
  const seen = new Set<bigint>();
  for (const bounty of input.bounties) {
    if (seen.has(bounty.id)) continue;
    seen.add(bounty.id);
    const { state, remaining } = bountyAvailability(bounty, input.nowSeconds);
    if (state === "awarded") awardedCount++;
    else if (state === "cancelled") cancelledCount++;
    else active.push({ ...bounty, state, remaining });
  }
  active.sort((a, b) => (a.deadline === b.deadline ? Number(a.id - b.id) : a.deadline < b.deadline ? -1 : 1));
  const activeTotal = sum(active.map((b) => b.remaining));

  const payouts: RewardLedger["payouts"] = [];
  const awaitingClaim: RewardLedger["awaitingClaim"] = [];
  const seenRefs = new Set<string>();
  for (const record of input.records) {
    const ref = record.ref.toLowerCase();
    if (seenRefs.has(ref)) continue;
    seenRefs.add(ref);
    const onchain = input.onchain.get(ref);
    if (!onchain) continue;
    if (onchain.status === ContributionStatusOnchain.Claimed) payouts.push({ ...record, amount: onchain.amount });
    else if (onchain.status === ContributionStatusOnchain.Approved) awaitingClaim.push({ ...record, amount: onchain.amount });
  }
  payouts.sort((a, b) => (b.claimedAt ?? "").localeCompare(a.claimedAt ?? ""));

  const paidListed = sum(payouts.map((p) => p.amount));
  const committedListed = sum(awaitingClaim.map((p) => p.amount));
  const books = booksBalance(balances);

  return {
    balances,
    booksBalance: books,
    bounties: {
      active,
      awardedCount,
      cancelledCount,
      activeTotal,
      unlistedEscrow: nonNegative(balances.escrowed - activeTotal),
    },
    payouts,
    unlistedPaid: nonNegative(balances.totalPaid - paidListed),
    awaitingClaim,
    unlistedCommitted: nonNegative(balances.committed - committedListed),
    consistent:
      books && activeTotal <= balances.escrowed && paidListed <= balances.totalPaid && committedListed <= balances.committed,
  };
}

function sum(values: bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function nonNegative(value: bigint): bigint {
  return value > 0n ? value : 0n;
}

// -----------------------------------------------------------------------------
// Freshness
// -----------------------------------------------------------------------------

/** A read whose block is older than this is shown as stale (the RPC node is lagging). */
export const STALE_AFTER_SECONDS = 120;

export function isStaleBlock(blockTimestampSeconds: bigint, nowMs: number): boolean {
  return BigInt(Math.floor(nowMs / 1000)) - blockTimestampSeconds > BigInt(STALE_AFTER_SECONDS);
}

// -----------------------------------------------------------------------------
// Several projects, several assets
// -----------------------------------------------------------------------------

/** An amount of one asset. `asset` is the token address (zero address for native MON). */
export type AssetAmount = { asset: string; symbol: string; decimals: number; amount: bigint };

/** Native MON first, then tokens by symbol and address. */
function assetOrder(a: Pick<AssetAmount, "asset" | "symbol">, b: Pick<AssetAmount, "asset" | "symbol">): number {
  const nativeA = isNativeAsset(a.asset);
  const nativeB = isNativeAsset(b.asset);
  if (nativeA !== nativeB) return nativeA ? -1 : 1;
  return a.symbol.localeCompare(b.symbol) || a.asset.toLowerCase().localeCompare(b.asset.toLowerCase());
}

/** Sums amounts per asset address. Different assets are never added together, even with equal symbols. */
export function totalsByAsset(items: AssetAmount[]): AssetAmount[] {
  const totals = new Map<string, AssetAmount>();
  for (const item of items) {
    const key = item.asset.toLowerCase();
    const current = totals.get(key);
    totals.set(key, current ? { ...current, amount: current.amount + item.amount } : { ...item, asset: key });
  }
  return [...totals.values()].sort(assetOrder);
}

/**
 * Orders by amount, largest first, only within the same asset; different
 * assets are grouped (MON first) rather than compared by raw units.
 */
export function compareAssetAmountsDesc(a: AssetAmount | null, b: AssetAmount | null): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  if (a.asset.toLowerCase() !== b.asset.toLowerCase()) return assetOrder(a, b);
  return a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1;
}

/** Symbols for display; a symbol shared by different tokens gets its address suffix. */
export function assetLabels(assets: Pick<AssetAmount, "asset" | "symbol">[]): Map<string, string> {
  const bySymbol = new Map<string, Set<string>>();
  for (const { asset, symbol } of assets) {
    bySymbol.set(symbol, (bySymbol.get(symbol) ?? new Set()).add(asset.toLowerCase()));
  }
  const labels = new Map<string, string>();
  for (const { asset, symbol } of assets) {
    const ambiguous = (bySymbol.get(symbol)?.size ?? 0) > 1;
    labels.set(asset.toLowerCase(), ambiguous ? `${symbol} (${asset.slice(0, 6)}…${asset.slice(-4)})` : symbol);
  }
  return labels;
}
