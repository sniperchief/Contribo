"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Hex } from "viem";
import { useConfig, useConnection } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { syncContribution } from "@/app/contributions/actions";
import { StageBadge } from "@/components/contributions/stage-badge";
import { TxStatus } from "@/components/tx/tx-status";
import { useContractTx } from "@/components/tx/use-contract-tx";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { contriboRewards } from "@/lib/contracts/config";
import { shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";

/** Claim control for an onchain-approved reward. Only the recorded contributor wallet can claim. */
export function ClaimReward({
  contributionId,
  onchainProjectId,
  onchainRef,
  contributorWallet,
}: {
  contributionId: string;
  onchainProjectId: string;
  onchainRef: string;
  contributorWallet: string;
}) {
  const router = useRouter();
  const config = useConfig();
  const { address } = useConnection();
  const tx = useContractTx();
  const [syncError, setSyncError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canClaim = !!address && address.toLowerCase() === contributorWallet.toLowerCase();

  async function claim() {
    setSyncError(null);
    const receipt = await tx.run("Claim reward", async (account) => {
      const { request } = await simulateContract(config, {
        address: contriboRewards!.address,
        abi: contriboRewards!.abi,
        functionName: "claim",
        args: [BigInt(onchainProjectId), onchainRef as Hex, account],
        account,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    });
    if (receipt) {
      startTransition(async () => {
        const result = await syncContribution(contributionId, receipt.transactionHash);
        if (!result.ok) setSyncError(`Claim confirmed onchain, but saving it failed: ${result.error}`);
        router.refresh();
      });
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <StageBadge stage={canClaim ? "claimable" : "approved"} />
        {canClaim && (
          <Button size="sm" variant="accent" onClick={claim} disabled={tx.busy || tx.state.phase === "confirmed"}>
            Claim
          </Button>
        )}
      </div>
      {!canClaim && <p className="text-xs text-muted">Connect {shortAddress(contributorWallet)} to claim.</p>}
      <TxStatus state={tx.state} className="text-right text-xs" />
      <FormMessage error={syncError} />
    </div>
  );
}

/** Re-reads a contribution's onchain status (e.g. after an approver confirmed an approval). */
export function SyncContribution({ contributionId, label = "Check onchain status" }: { contributionId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncContribution(contributionId);
            setError(result.ok ? null : result.error);
            router.refresh();
          })
        }
      >
        {pending ? "Checking…" : label}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
