import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { env } from "@/lib/env";
import { contriboRewardsAbi } from "./abi";

export { contriboRewardsAbi };

/** `address(0)` in the contract means native MON. */
export const NATIVE_ASSET: Address = zeroAddress;

function parseAddress(value: string | undefined): Address | null {
  return value && isAddress(value) ? getAddress(value) : null;
}

/**
 * The ContriboRewards deployment for the configured Monad network, or `null`
 * when no address is configured. Callers must handle the unconfigured case by
 * showing a "not available" state — never by simulating transactions.
 */
export const contriboRewards = (() => {
  const address = parseAddress(env.contracts.rewardsAddress);
  return address ? ({ address, abi: contriboRewardsAbi } as const) : null;
})();

export function isNativeAsset(asset: string | null | undefined): boolean {
  return !asset || asset.toLowerCase() === NATIVE_ASSET;
}

/** Statuses as encoded by the contract's enums. */
export const ContributionStatusOnchain = { None: 0, Approved: 1, Claimed: 2 } as const;
export const BountyStatusOnchain = { None: 0, Open: 1, Awarded: 2, Cancelled: 3 } as const;
