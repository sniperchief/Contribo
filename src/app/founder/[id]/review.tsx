"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseUnits } from "viem";
import { useConfig, useAccount } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";
import { syncContribution } from "@/app/contributions/actions";
import { acceptContribution, prepareApproval, rejectContribution } from "@/app/founder/actions";
import { SyncContribution } from "@/components/contributions/claim-reward";
import { StageBadge } from "@/components/contributions/stage-badge";
import { TxStatus } from "@/components/tx/tx-status";
import { useContractTx } from "@/components/tx/use-contract-tx";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { Button } from "@/components/ui/button";
import { FormMessage, Input, Select } from "@/components/ui/field";
import { contriboRewards } from "@/lib/contracts/config";
import type { ContributionStage } from "@/lib/contributions";
import { formatAmount, formatDate, shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import type { BountyRow } from "./onchain-panel";
import { useServerAction } from "./use-action";

export type ReviewRow = {
  id: string;
  prUrl: string;
  prTitle: string | null;
  prNumber: number;
  githubLogin: string;
  mergedAt: string | null;
  stage: ContributionStage;
  rewardAmount: string | null;
  bountyId: string | null;
  contributorWallet: string | null;
  /** Contributor's current verified wallet (used when accepting). */
  verifiedWallet: string | null;
  policyVersion: number | null;
};

type Props = {
  rows: ReviewRow[];
  asset: { symbol: string; decimals: number } | null;
  openBounties: BountyRow[];
  onchainReady: boolean;
};

export function Review({ rows, ...rest }: Props) {
  if (rows.length === 0) return <p className="text-base text-deep-teal">No contributions have been submitted yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <ReviewItem key={row.id} row={row} {...rest} />
      ))}
    </ul>
  );
}

function ReviewItem({ row, asset, openBounties, onchainReady }: Omit<Props, "rows"> & { row: ReviewRow }) {
  const decision = useServerAction();
  const fmt = (v: string) => (asset ? formatAmount(v, asset.decimals, asset.symbol) : `${v} (base units)`);

  return (
    <li className="flex flex-col gap-3.5 rounded-badge border border-mist px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={row.prUrl} target="_blank" rel="noreferrer" className="block truncate text-base font-bold text-ink">
            {row.prTitle ?? `Pull request #${row.prNumber}`}
          </a>
          <p className="mt-1 text-[13px] text-deep-teal">
            @{row.githubLogin} · merged {formatDate(row.mergedAt)}
            {row.policyVersion !== null && ` · under policy v${row.policyVersion}`}
            {row.rewardAmount && ` · reward ${fmt(row.rewardAmount)}`}
            {row.bountyId && ` · bounty #${row.bountyId}`}
            {row.contributorWallet && ` · to ${shortAddress(row.contributorWallet)}`}
          </p>
        </div>
        <StageBadge stage={row.stage} />
      </div>

      {row.stage === "verified" && (
        <AcceptForm row={row} asset={asset} openBounties={openBounties} onchainReady={onchainReady} decision={decision} />
      )}
      {row.stage === "accepted" && (
        <>
          {row.verifiedWallet?.toLowerCase() !== row.contributorWallet?.toLowerCase() && (
            <p className="text-[13px] text-warning">
              The contributor has changed their payout wallet since this was accepted. Update the reward to use the new wallet.
            </p>
          )}
          <ApproveOnchain row={row} onchainReady={onchainReady} decision={decision} />
          <details className="text-sm">
            <summary className="cursor-pointer text-[13px] text-deep-teal">Change reward or payout wallet</summary>
            <div className="mt-2">
              <AcceptForm
                row={row}
                asset={asset}
                openBounties={openBounties}
                onchainReady={onchainReady}
                decision={decision}
                submitLabel="Update reward"
              />
            </div>
          </details>
        </>
      )}
      <FormMessage {...decision.message} />
    </li>
  );
}

function AcceptForm({
  row,
  asset,
  openBounties,
  onchainReady,
  decision,
  submitLabel = "Accept",
}: Omit<Props, "rows"> & { row: ReviewRow; decision: ReturnType<typeof useServerAction>; submitLabel?: string }) {
  const [bountyId, setBountyId] = useState("");

  if (!onchainReady || !asset) {
    return <p className="text-[13px] text-deep-teal">Register the project onchain to set rewards.</p>;
  }
  if (!row.verifiedWallet) {
    return <p className="text-[13px] text-warning">The contributor has not linked a verified wallet yet, so no reward can be set.</p>;
  }

  return (
    <form
      className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const bounty = openBounties.find((b) => b.id === bountyId);
        let amount: string;
        try {
          amount = bounty ? bounty.amount : parseUnits(String(form.get("amount") ?? ""), asset.decimals).toString();
        } catch {
          decision.setMessage({ error: "Enter a valid amount." });
          return;
        }
        decision.run(() => acceptContribution(row.id, { amount, bountyId: bounty?.id ?? null }), "Accepted. Approve it onchain next.");
      }}
    >
      <Select value={bountyId} onChange={(e) => setBountyId(e.target.value)} aria-label="Reward source" className="h-11 text-[15px] sm:w-56">
        <option value="">From the reward pool</option>
        {openBounties.map((b) => (
          <option key={b.id} value={b.id}>
            Bounty #{b.id} ({formatAmount(b.amount, asset.decimals, asset.symbol)})
          </option>
        ))}
      </Select>
      {!bountyId && <Input name="amount" inputMode="decimal" required placeholder={`Reward in ${asset.symbol}`} aria-label="Reward amount" className="h-11 text-[15px] sm:w-44" />}
      <Button type="submit" size="sm" disabled={decision.pending}>
        {submitLabel}
      </Button>
      {submitLabel === "Accept" && (
        <Button type="button" size="sm" variant="ghost" className="px-2.5" disabled={decision.pending} onClick={() => decision.run(() => rejectContribution(row.id))}>
          Reject
        </Button>
      )}
    </form>
  );
}

function ApproveOnchain({
  row,
  onchainReady,
  decision,
}: {
  row: ReviewRow;
  onchainReady: boolean;
  decision: ReturnType<typeof useServerAction>;
}) {
  const config = useConfig();
  const router = useRouter();
  const tx = useContractTx();
  const { address } = useAccount();
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setError(null);
    const plan = await prepareApproval(row.id);
    if (!plan.ok) return setError(plan.error);
    const p = plan.data;

    const receipt = await tx.run(p.kind === "pool" ? "Approve reward" : "Award bounty", async (account) => {
      if (p.kind === "pool") {
        const { request } = await simulateContract(config, {
          address: contriboRewards!.address,
          abi: contriboRewards!.abi,
          functionName: "approveContribution",
          args: [BigInt(p.projectId), p.ref, p.contributor, BigInt(p.amount)],
          account,
          chainId: activeChain.id,
        });
        return writeContract(config, request);
      }
      const { request } = await simulateContract(config, {
        address: contriboRewards!.address,
        abi: contriboRewards!.abi,
        functionName: "awardBounty",
        args: [BigInt(p.bountyId), p.ref, p.contributor],
        account,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    });
    if (receipt) {
      const result = await syncContribution(row.id, receipt.transactionHash);
      if (!result.ok) setError(`Approved onchain, but reconciliation failed: ${result.error}`);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" variant="accent" onClick={approve} disabled={!onchainReady || tx.busy || tx.state.phase === "confirmed"}>
          Approve onchain
        </Button>
        <Button size="sm" variant="ghost" className="px-2.5" disabled={decision.pending || tx.busy} onClick={() => decision.run(() => rejectContribution(row.id))}>
          Reject
        </Button>
        <SyncContribution contributionId={row.id} />
        {!address && <ConnectWalletButton />}
      </div>
      <p className="text-[13px] text-deep-teal">
        Your wallet must be the project owner or an approver. Approved rewards are final and reserved for the contributor.
      </p>
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </div>
  );
}
