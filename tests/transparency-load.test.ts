import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * loadProjectTransparency with the chain and database mocked: a failed or stale
 * read must never be presented as current, and only fresh, consistent reads are
 * saved as the last verified snapshot.
 */

const CONTRACT = "0xf2080fC3CDBeFa5577b5c185794dBfAB348DD5D3";
const NOW_S = 1_800_000_000n;

const chain = vi.hoisted(() => ({ readProjectLedger: vi.fn(), readAssetInfo: vi.fn() }));
const afterCalls = vi.hoisted(() => [] as (() => unknown)[]);

vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterCalls.push(fn) }));
vi.mock("@/lib/contracts/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/contracts/config")>()),
  contriboRewards: { address: CONTRACT, abi: [] },
}));
vi.mock("@/lib/server/chain", () => chain);
vi.mock("@/lib/server/admin", () => ({ createAdminClient: () => null }));

const { loadProjectTransparency } = await import("@/lib/server/transparency");

const project = { id: "p1", onchain_project_id: "4" };
const known = { records: [], bountyTitles: new Map<string, string>() };

function snapshotClient(row: Record<string, unknown> | null) {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: row }) };
  return { from: () => query } as never;
}

const savedRow = {
  chain_id: 10143,
  contract_address: CONTRACT.toLowerCase(),
  asset_symbol: "MON",
  asset_decimals: 18,
  available: "1",
  escrowed: "2",
  committed: "3",
  total_deposited: "10",
  total_paid: "4",
  total_withdrawn: "0",
  block_number: "500",
  block_timestamp: "2026-10-19T10:00:00.000Z",
  read_at: "2026-10-19T10:00:01.000Z",
};

function ledgerRead(blockTimestamp: bigint, totalDeposited = 10n) {
  return {
    block: { number: 900n, timestamp: blockTimestamp },
    project: { owner: "0x1", pendingOwner: "0x0", asset: "0x0000000000000000000000000000000000000000", policyHash: "0x00", metadataURI: "" },
    balances: { available: 1n, escrowed: 2n, committed: 3n, totalPaid: 4n, totalWithdrawn: 0n, totalDeposited },
    bounties: [],
    contributions: new Map(),
  };
}

beforeEach(() => {
  afterCalls.length = 0;
  chain.readProjectLedger.mockReset();
  chain.readAssetInfo.mockReset().mockResolvedValue({ symbol: "MON", decimals: 18 });
  vi.spyOn(Date, "now").mockReturnValue(Number(NOW_S) * 1000);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("chain read failures", () => {
  it("returns 'failed' with the last verified snapshot and its time, never as a live reading", async () => {
    chain.readProjectLedger.mockRejectedValue(new Error("RPC timeout"));
    const result = await loadProjectTransparency(project, known, snapshotClient(savedRow));
    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.lastVerified?.readAt).toBe(savedRow.read_at);
    expect(result.lastVerified?.blockNumber).toBe(500n);
    expect(result.lastVerified?.balances.totalPaid).toBe(4n);
    expect(afterCalls).toHaveLength(0);
  });

  it("ignores a snapshot from another contract deployment or network", async () => {
    chain.readProjectLedger.mockRejectedValue(new Error("RPC timeout"));
    const other = await loadProjectTransparency(project, known, snapshotClient({ ...savedRow, contract_address: "0x" + "9".repeat(40) }));
    const mainnet = await loadProjectTransparency(project, known, snapshotClient({ ...savedRow, chain_id: 143 }));
    expect(other).toEqual({ kind: "failed", lastVerified: null });
    expect(mainnet).toEqual({ kind: "failed", lastVerified: null });
  });

  it("fails without a snapshot when none was ever verified", async () => {
    chain.readAssetInfo.mockRejectedValue(new Error("token metadata unreadable"));
    chain.readProjectLedger.mockResolvedValue(ledgerRead(NOW_S));
    expect(await loadProjectTransparency(project, known, snapshotClient(null))).toEqual({ kind: "failed", lastVerified: null });
  });

  it("treats an unregistered onchain project as a failed read", async () => {
    chain.readProjectLedger.mockResolvedValue(null);
    expect((await loadProjectTransparency(project, known, null)).kind).toBe("failed");
  });
});

describe("successful reads", () => {
  it("a fresh, consistent read is verified and saved as the last snapshot", async () => {
    chain.readProjectLedger.mockResolvedValue(ledgerRead(NOW_S - 1n));
    const result = await loadProjectTransparency(project, known, null);
    expect(result).toMatchObject({ kind: "verified", stale: false, blockNumber: 900n });
    expect(afterCalls).toHaveLength(1);
  });

  it("a read from a lagging node is marked stale and not saved", async () => {
    chain.readProjectLedger.mockResolvedValue(ledgerRead(NOW_S - 600n));
    const result = await loadProjectTransparency(project, known, null);
    expect(result).toMatchObject({ kind: "verified", stale: true });
    expect(afterCalls).toHaveLength(0);
  });

  it("a read whose books don't balance is shown with a warning but not saved", async () => {
    chain.readProjectLedger.mockResolvedValue(ledgerRead(NOW_S, 11n));
    const result = await loadProjectTransparency(project, known, null);
    expect(result.kind === "verified" && result.ledger.booksBalance).toBe(false);
    expect(afterCalls).toHaveLength(0);
  });

  it("states unconfigured and unregistered projects plainly", async () => {
    expect(await loadProjectTransparency({ id: "p2", onchain_project_id: null }, known, null)).toEqual({ kind: "unregistered" });
    expect(chain.readProjectLedger).not.toHaveBeenCalled();
  });
});
