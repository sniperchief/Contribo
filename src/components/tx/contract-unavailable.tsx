import { activeChain } from "@/lib/monad/chains";

/** Shown wherever onchain features would appear while no contract address is configured. */
export function ContractUnavailable() {
  return (
    <p className="rounded-md border border-line bg-surface-sunken p-4 text-sm text-muted">
      Onchain rewards are not available yet: no ContriboRewards contract is configured for {activeChain.name}. Set{" "}
      <code className="font-mono text-ink">NEXT_PUBLIC_CONTRIBO_REWARDS_ADDRESS</code> once the contract is deployed.
    </p>
  );
}
