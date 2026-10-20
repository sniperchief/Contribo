import type { Chain } from "viem";
import { monad, monadTestnet } from "viem/chains";
import { env } from "@/lib/env";

/**
 * Monad network selection. Chain metadata comes from viem's maintained
 * definitions (Testnet: chain ID 10143, Mainnet: chain ID 143). Contribo
 * targets testnet until contracts are audited and deployed.
 */
const baseChain: Chain = env.monad.network === "mainnet" ? monad : monadTestnet;

/** Active Monad chain, with an optional dedicated RPC endpoint from the environment. */
export const activeChain: Chain = env.monad.rpcUrl
  ? {
      ...baseChain,
      rpcUrls: { ...baseChain.rpcUrls, default: { http: [env.monad.rpcUrl] } },
    }
  : baseChain;

export function explorerAddressUrl(address: string): string | undefined {
  const explorer = activeChain.blockExplorers?.default;
  return explorer ? `${explorer.url}/address/${address}` : undefined;
}

export function explorerTxUrl(hash: string): string | undefined {
  const explorer = activeChain.blockExplorers?.default;
  return explorer ? `${explorer.url}/tx/${hash}` : undefined;
}

export function explorerBlockUrl(blockNumber: bigint | string): string | undefined {
  const explorer = activeChain.blockExplorers?.default;
  return explorer ? `${explorer.url}/block/${blockNumber}` : undefined;
}

/** Sourcify's check that the deployed bytecode matches the published source ("perfect" = exact match). */
export function sourcifyCheckUrl(address: string): string {
  return `https://sourcify-api-monad.blockvision.org/check-by-addresses?addresses=${address}&chainIds=${activeChain.id}`;
}
