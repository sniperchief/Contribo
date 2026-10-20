import "server-only";
import { after } from "next/server";
import type { Address, Hex } from "viem";
import { contriboRewards } from "@/lib/contracts/config";
import { activeChain } from "@/lib/monad/chains";
import { buildRewardLedger, isStaleBlock, type ProjectBalances, type RewardLedger, type RewardRecord } from "@/lib/transparency";
import type { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import { createAdminClient } from "./admin";
import { readAssetInfo, readProjectLedger, type AssetInfo } from "./chain";

type SupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type LastVerified = {
  balances: ProjectBalances;
  asset: AssetInfo;
  blockNumber: bigint;
  blockTimestamp: string;
  readAt: string;
};

export type ProjectTransparency =
  | { kind: "unconfigured" }
  | { kind: "unregistered" }
  | {
      kind: "verified";
      /** The RPC answered, but its latest block is older than STALE_AFTER_SECONDS. */
      stale: boolean;
      contract: Address;
      asset: AssetInfo & { address: Address };
      policyHash: Hex;
      ledger: RewardLedger;
      blockNumber: bigint;
      blockTimestamp: string;
      readAt: string;
    }
  | { kind: "failed"; lastVerified: LastVerified | null };

/**
 * Reads a project's reward figures from ContriboRewards. `known.records` are
 * the project's onchain-approved contributions known to Contribo (they only
 * name rows); the contract decides which are paid or still awaiting a claim.
 *
 * On a fresh, consistent read the figures are saved as the project's last
 * verified snapshot (after the response is sent). When a read fails, that
 * snapshot is returned only so the page can say when the figures were last
 * verified; it is never presented as current.
 */
export async function loadProjectTransparency(
  project: { id: string; onchain_project_id: string | null },
  known: { records: RewardRecord[]; bountyTitles: Map<string, string> },
  supabase: SupabaseClient | null,
): Promise<ProjectTransparency> {
  const { records, bountyTitles } = known;
  if (!contriboRewards) return { kind: "unconfigured" };
  if (!project.onchain_project_id) return { kind: "unregistered" };

  try {
    const onchainId = BigInt(project.onchain_project_id);
    const read = await readProjectLedger(onchainId, records.map((r) => r.ref as Hex));
    if (!read) throw new Error(`Onchain project ${onchainId} not found`);
    const asset = await readAssetInfo(read.project.asset);

    const ledger = buildRewardLedger({
      balances: read.balances,
      bounties: read.bounties.map((b) => ({ ...b, title: bountyTitles.get(b.id.toString()) ?? null })),
      records,
      onchain: read.contributions,
      // Bounty deadlines are compared with the read block's time, as the contract does.
      nowSeconds: read.block.timestamp,
    });
    const stale = isStaleBlock(read.block.timestamp, Date.now());
    const readAt = new Date().toISOString();
    const blockTimestamp = new Date(Number(read.block.timestamp) * 1000).toISOString();

    if (!stale && ledger.booksBalance) {
      after(() =>
        saveSnapshot({
          project_id: project.id,
          chain_id: activeChain.id,
          contract_address: contriboRewards!.address.toLowerCase(),
          onchain_project_id: onchainId.toString(),
          asset: read.project.asset.toLowerCase(),
          asset_symbol: asset.symbol.slice(0, 32),
          asset_decimals: asset.decimals,
          available: read.balances.available.toString(),
          escrowed: read.balances.escrowed.toString(),
          committed: read.balances.committed.toString(),
          total_deposited: read.balances.totalDeposited.toString(),
          total_paid: read.balances.totalPaid.toString(),
          total_withdrawn: read.balances.totalWithdrawn.toString(),
          block_number: read.block.number.toString(),
          block_timestamp: blockTimestamp,
          read_at: readAt,
        }),
      );
    }

    return {
      kind: "verified",
      stale,
      contract: contriboRewards.address,
      asset: { ...asset, address: read.project.asset },
      policyHash: read.project.policyHash,
      ledger,
      blockNumber: read.block.number,
      blockTimestamp,
      readAt,
    };
  } catch (error) {
    console.error("Reward transparency read failed", { projectId: project.id, error });
    return { kind: "failed", lastVerified: supabase ? await loadLastVerified(supabase, project.id) : null };
  }
}

async function saveSnapshot(row: TablesInsert<"project_chain_snapshots">) {
  const admin = createAdminClient();
  if (!admin) return;
  // A database trigger keeps the newer block if two reads race.
  const { error } = await admin.from("project_chain_snapshots").upsert(row, { onConflict: "project_id" });
  if (error) console.error("Could not save the chain snapshot", { projectId: row.project_id, error: error.message });
}

async function loadLastVerified(supabase: SupabaseClient, projectId: string): Promise<LastVerified | null> {
  const { data } = await supabase.from("project_chain_snapshots").select("*").eq("project_id", projectId).maybeSingle();
  // Ignore snapshots taken from another network or contract deployment.
  if (
    !data ||
    data.chain_id !== activeChain.id ||
    data.contract_address !== contriboRewards?.address.toLowerCase()
  ) {
    return null;
  }
  return {
    balances: {
      available: BigInt(data.available),
      escrowed: BigInt(data.escrowed),
      committed: BigInt(data.committed),
      totalDeposited: BigInt(data.total_deposited),
      totalPaid: BigInt(data.total_paid),
      totalWithdrawn: BigInt(data.total_withdrawn),
    },
    asset: { symbol: data.asset_symbol, decimals: data.asset_decimals },
    blockNumber: BigInt(data.block_number),
    blockTimestamp: data.block_timestamp,
    readAt: data.read_at,
  };
}

/** The most recent verified-snapshot time among several projects, for a list-level notice. */
export async function latestSnapshotTime(supabase: SupabaseClient, projectIds: string[]): Promise<string | null> {
  if (projectIds.length === 0) return null;
  const { data } = await supabase
    .from("project_chain_snapshots")
    .select("read_at")
    .in("project_id", projectIds)
    .eq("chain_id", activeChain.id)
    .order("read_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.read_at ?? null;
}
