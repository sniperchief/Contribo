import "server-only";
import {
  createPublicClient,
  erc20Abi,
  getAddress,
  http,
  parseEventLogs,
  type Address,
  type Hex,
  zeroAddress,
} from "viem";
import { BountyStatusOnchain, contriboRewards, isNativeAsset } from "@/lib/contracts/config";
import { activeChain } from "@/lib/monad/chains";
import { isStaleBlock } from "@/lib/transparency";

/**
 * Server-side reads from the Monad network. The chain is the source of truth
 * for funds and approvals; the database only stores reconciled results.
 */
export const publicClient = createPublicClient({ chain: activeChain, transport: http() });

function requireContract() {
  if (!contriboRewards) throw new Error("ContriboRewards is not configured.");
  return contriboRewards;
}

export type OnchainProject = {
  owner: Address;
  pendingOwner: Address;
  asset: Address;
  policyHash: Hex;
  metadataURI: string;
  balances: {
    available: bigint;
    escrowed: bigint;
    committed: bigint;
    totalDeposited: bigint;
    totalPaid: bigint;
    totalWithdrawn: bigint;
  };
};

export async function readOnchainProject(projectId: bigint): Promise<OnchainProject | null> {
  const { address, abi } = requireContract();
  const [project, balances] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address, abi, functionName: "getProject", args: [projectId] },
      { address, abi, functionName: "getBalances", args: [projectId] },
    ],
  });
  if (project.owner === "0x0000000000000000000000000000000000000000") return null;
  return { ...project, balances };
}

export async function readContribution(projectId: bigint, ref: Hex) {
  const { address, abi } = requireContract();
  return publicClient.readContract({ address, abi, functionName: "getContribution", args: [projectId, ref] });
}

export async function readIsApprover(projectId: bigint, account: Address) {
  const { address, abi } = requireContract();
  return publicClient.readContract({ address, abi, functionName: "isApprover", args: [projectId, account] });
}

export type OnchainBounty = {
  id: bigint;
  amount: bigint;
  deadline: bigint;
  status: number;
  contributionRef: Hex;
};

/** The most recent `limit` bounties across all projects, optionally as of a given block. */
async function readRecentBounties(limit = 200, blockNumber?: bigint) {
  const { address, abi } = requireContract();
  const count = await publicClient.readContract({ address, abi, functionName: "bountyCount", blockNumber });
  const ids: bigint[] = [];
  for (let id = count; id > 0n && ids.length < limit; id--) ids.push(id);
  if (ids.length === 0) return [];

  const bounties = await publicClient.multicall({
    allowFailure: false,
    blockNumber,
    contracts: ids.map((id) => ({ address, abi, functionName: "getBounty" as const, args: [id] as const })),
  });
  return bounties.map((bounty, index) => ({ ...bounty, id: ids[index], deadline: BigInt(bounty.deadline) }));
}

/** Bounties of a project, scanning the most recent `limit` bounty IDs. */
export async function readProjectBounties(projectId: bigint, limit = 200): Promise<OnchainBounty[]> {
  return (await readRecentBounties(limit))
    .filter((bounty) => bounty.projectId === projectId)
    .map(({ id, amount, deadline, status, contributionRef }) => ({ id, amount, deadline, status, contributionRef }));
}

/** The block every figure of one read is taken at, so balances, bounties and claims agree. */
export type ChainReadBlock = { number: bigint; timestamp: bigint };

async function readLatestBlock(): Promise<ChainReadBlock> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  return { number: block.number, timestamp: block.timestamp };
}

export type ProjectOverview = {
  asset: Address;
  balances: OnchainProject["balances"];
  openBounties: number;
};

/** Asset, balances and open bounty count for several onchain projects, all at one block. */
export async function readProjectsOverview(
  projectIds: bigint[],
): Promise<{ block: ChainReadBlock; stale: boolean; projects: Map<bigint, ProjectOverview> }> {
  const { address, abi } = requireContract();
  const block = await readLatestBlock();
  const stale = isStaleBlock(block.timestamp, Date.now());
  const projects = new Map<bigint, ProjectOverview>();
  if (projectIds.length === 0) return { block, stale, projects };

  const [details, balances, bounties] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      blockNumber: block.number,
      contracts: projectIds.map((id) => ({ address, abi, functionName: "getProject" as const, args: [id] as const })),
    }),
    publicClient.multicall({
      allowFailure: false,
      blockNumber: block.number,
      contracts: projectIds.map((id) => ({ address, abi, functionName: "getBalances" as const, args: [id] as const })),
    }),
    readRecentBounties(200, block.number),
  ]);
  projectIds.forEach((id, index) => {
    projects.set(id, {
      asset: details[index].asset,
      balances: balances[index],
      openBounties: bounties.filter((b) => b.projectId === id && b.status === BountyStatusOnchain.Open).length,
    });
  });
  return { block, stale, projects };
}

export type ProjectLedgerRead = {
  block: ChainReadBlock;
  project: Omit<OnchainProject, "balances">;
  balances: OnchainProject["balances"];
  /** The project's bounties among the most recent 200 bounty IDs. */
  bounties: OnchainBounty[];
  /** getContribution for each requested ref, keyed by lowercase ref. */
  contributions: Map<string, { contributor: Address; amount: bigint; status: number }>;
};

/**
 * Everything the reward transparency view shows for one project, read at a
 * single block. Returns `null` when the project is not registered.
 */
export async function readProjectLedger(projectId: bigint, refs: Hex[]): Promise<ProjectLedgerRead | null> {
  const { address, abi } = requireContract();
  const block = await readLatestBlock();
  const [[project, balances], recent, contributions] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      blockNumber: block.number,
      contracts: [
        { address, abi, functionName: "getProject", args: [projectId] },
        { address, abi, functionName: "getBalances", args: [projectId] },
      ],
    }),
    readRecentBounties(200, block.number),
    refs.length === 0
      ? Promise.resolve([])
      : publicClient.multicall({
          allowFailure: false,
          blockNumber: block.number,
          contracts: refs.map((ref) => ({
            address,
            abi,
            functionName: "getContribution" as const,
            args: [projectId, ref] as const,
          })),
        }),
  ]);
  if (project.owner === zeroAddress) return null;

  return {
    block,
    project,
    balances,
    bounties: recent
      .filter((b) => b.projectId === projectId)
      .map(({ id, amount, deadline, status, contributionRef }) => ({ id, amount, deadline, status, contributionRef })),
    contributions: new Map(
      contributions.map((c, index) => [
        refs[index].toLowerCase(),
        { contributor: c.contributor, amount: c.amount, status: c.status },
      ]),
    ),
  };
}

/** Total native MON claimed by contributors across every MON-denominated project in the contract. */
export async function readTotalPaid(): Promise<bigint> {
  const { address, abi } = requireContract();
  const count = await publicClient.readContract({ address, abi, functionName: "projectCount" });
  if (count === 0n) return 0n;
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
  const [projects, balances] = await Promise.all([
    publicClient.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({ address, abi, functionName: "getProject" as const, args: [id] as const })),
    }),
    publicClient.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({ address, abi, functionName: "getBalances" as const, args: [id] as const })),
    }),
  ]);
  return balances.reduce((sum, b, i) => (isNativeAsset(projects[i].asset) ? sum + b.totalPaid : sum), 0n);
}

export async function readBounty(bountyId: bigint) {
  const { address, abi } = requireContract();
  const bounty = await publicClient.readContract({ address, abi, functionName: "getBounty", args: [bountyId] });
  return bounty.status === 0 ? null : bounty;
}

/**
 * Whether a confirmed transaction emitted `ContributionApproved` or `RewardClaimed`
 * for this exact contribution. Used before storing a client-supplied tx hash.
 */
export async function txEmittedContributionEvent(
  txHash: Hex,
  eventName: "ContributionApproved" | "RewardClaimed",
  projectId: bigint,
  ref: Hex,
): Promise<boolean> {
  const { address, abi } = requireContract();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") return false;
  const events = parseEventLogs({
    abi,
    eventName,
    logs: receipt.logs.filter((log) => getAddress(log.address) === address),
  });
  return events.some(
    (event) => event.args.projectId === projectId && event.args.contributionRef.toLowerCase() === ref.toLowerCase(),
  );
}

/** Decodes the ProjectRegistered event emitted by our contract in a confirmed transaction. */
export async function readProjectRegistration(txHash: Hex) {
  const { address, abi } = requireContract();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return null;
  const [event] = parseEventLogs({
    abi,
    eventName: "ProjectRegistered",
    logs: receipt.logs.filter((log) => getAddress(log.address) === address),
  });
  return event ? event.args : null;
}

/** BountyCreated events emitted by the contract in a successful transaction. */
export async function readBountyCreations(txHash: Hex) {
  const { address, abi } = requireContract();
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (receipt.status !== "success") return [];
  return parseEventLogs({
    abi,
    eventName: "BountyCreated",
    logs: receipt.logs.filter((log) => getAddress(log.address) === address),
  }).map((event) => event.args);
}

export type AssetInfo = { symbol: string; decimals: number };

export async function readAssetInfo(asset: string | null): Promise<AssetInfo> {
  if (isNativeAsset(asset)) return { symbol: activeChain.nativeCurrency.symbol, decimals: 18 };
  const token = getAddress(asset!);
  const [symbol, decimals] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "decimals" },
    ],
  });
  return { symbol, decimals };
}

/** Verifies EOA and smart-account (ERC-1271/6492) signatures. */
export function verifyWalletSignature(address: Address, message: string, signature: Hex) {
  return publicClient.verifyMessage({ address, message, signature });
}
