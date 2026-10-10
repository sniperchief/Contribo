import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { activeChain } from "@/lib/monad/chains";

/**
 * Wallet connectivity via wagmi + viem.
 *
 * Browser wallets (MetaMask, Rabby, Phantom, Backpack, ...) are discovered
 * automatically through EIP-6963; `injected()` is the fallback for wallets
 * that only expose `window.ethereum`. No API keys are required.
 */
export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
