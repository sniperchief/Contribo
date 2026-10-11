"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { erc20Abi, getAddress, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getBalance, readContract, simulateContract, writeContract } from "wagmi/actions";
import { confirmProjectRegistration, recordBountyDetails } from "@/app/founder/actions";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { TxStatus } from "@/components/tx/tx-status";
import { useContractTx } from "@/components/tx/use-contract-tx";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { buttonStyles, Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { contriboRewards } from "@/lib/contracts/config";
import { shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { planTotal, type SetupPlan, type SetupStep } from "@/lib/project-setup";
import { projectMetadataUri } from "@/lib/projects";
import { getAssetInfo, getLaunchProgress, goLive, publishSetupTerms } from "./actions";
import { SetupCard, SetupHeading } from "./setup-card";
import type { SetupState } from "./types";

type ItemStatus = "todo" | "active" | "done" | "failed";
type Item = { key: string; label: string; signs: boolean };

/** Step 3: review everything, then launch: publish terms, register onchain, lock funds, go live. */
export function StepLaunch({
  state,
  contractReady,
  onRegistered,
  onEdit,
}: {
  state: SetupState & { projectId: string; plan: SetupPlan };
  contractReady: boolean;
  onRegistered: (onchainProjectId: string) => void;
  onEdit: (step: SetupStep) => void;
}) {
  const { plan, projectId } = state;
  const config = useConfig();
  const { address } = useAccount();
  const tx = useContractTx();
  const [asset, setAsset] = useState<{ symbol: string; decimals: number } | null>(null);
  const [status, setStatus] = useState<Record<string, ItemStatus>>(
    (): Record<string, ItemStatus> => (state.onchainProjectId ? { terms: "done", register: "done" } : {}),
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A confirmed registration that still needs linking is never sent twice.
  const [registeredTx, setRegisteredTx] = useState<Hex | null>(null);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);

  useEffect(() => {
    void getAssetInfo(plan.asset).then((result) => (result.ok ? setAsset(result.data) : setError(result.error)));
  }, [plan.asset]);

  const isToken = plan.asset !== "MON";
  const items: Item[] = [
    { key: "terms", label: "Publish your reward terms", signs: false },
    { key: "register", label: "Register the project onchain", signs: true },
    {
      key: "deposit",
      label: `Lock ${planTotal(plan)} ${asset?.symbol ?? ""} in the vault${isToken ? " (approve, then deposit)" : ""}`,
      signs: true,
    },
    ...plan.bounties.map((b, i) => ({ key: `bounty-${i}`, label: `Create bounty: ${b.title}`, signs: true })),
    { key: "live", label: "List the project on Explore", signs: false },
  ];
  const signatures = items.filter((i) => i.signs).length + (isToken ? 1 : 0);
  const walletReady = !!state.verifiedWallet && address?.toLowerCase() === state.verifiedWallet.toLowerCase();
  const started = Object.keys(status).length > 0;

  const mark = (key: string, value: ItemStatus) => setStatus((s) => ({ ...s, [key]: value }));

  async function deposit(onchainId: bigint, amount: bigint): Promise<boolean> {
    const rewards = contriboRewards!;
    if (!isToken) {
      return !!(await tx.run("Deposit", async (account) => {
        const { value: balance } = await getBalance(config, { address: account, chainId: activeChain.id });
        if (balance < amount) throw Object.assign(new Error("Insufficient balance"), { name: "InsufficientFundsError" });
        const { request } = await simulateContract(config, {
          address: rewards.address,
          abi: rewards.abi,
          functionName: "deposit",
          args: [onchainId, amount],
          value: amount,
          account,
          chainId: activeChain.id,
        });
        return writeContract(config, request);
      }));
    }
    const token = getAddress(plan.asset);
    const owner = address as Address;
    const [balance, allowance] = await Promise.all([
      readContract(config, { address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner], chainId: activeChain.id }),
      readContract(config, { address: token, abi: erc20Abi, functionName: "allowance", args: [owner, rewards.address], chainId: activeChain.id }),
    ]);
    if (balance < amount) throw new Error(`Your ${asset?.symbol ?? "token"} balance is too low.`);
    if (allowance < amount) {
      const approved = await tx.run("Approve token", async (from) => {
        const { request } = await simulateContract(config, {
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [rewards.address, amount],
          account: from,
          chainId: activeChain.id,
        });
        return writeContract(config, request);
      });
      if (!approved) return false;
    }
    return !!(await tx.run("Deposit", async (from) => {
      const { request } = await simulateContract(config, {
        address: rewards.address,
        abi: rewards.abi,
        functionName: "deposit",
        args: [onchainId, amount],
        account: from,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    }));
  }

  async function launch() {
    if (!asset || !contriboRewards) return;
    const rewards = contriboRewards;
    setRunning(true);
    setError(null);
    let current = "terms";
    const stop = (message?: string) => {
      mark(current, "failed");
      if (message) setError(message);
      setRunning(false);
    };

    try {
      // 1. Terms (no signature).
      mark(current, "active");
      const terms = await publishSetupTerms(projectId);
      if (!terms.ok) return stop(terms.error);
      mark(current, "done");

      // 2. Register onchain, unless an earlier attempt already did.
      current = "register";
      mark(current, "active");
      let progress = await getLaunchProgress(projectId);
      if (!progress.ok) return stop(progress.error);
      let onchainId = progress.data.onchainProjectId;
      if (!onchainId) {
        let hash = registeredTx;
        if (!hash) {
          const assetAddress: Address = isToken ? getAddress(plan.asset) : zeroAddress;
          const receipt = await tx.run("Register project", async (account) => {
            const { request } = await simulateContract(config, {
              address: rewards.address,
              abi: rewards.abi,
              functionName: "registerProject",
              args: [assetAddress, projectMetadataUri(projectId), terms.data.policyHash as Hex],
              account,
              chainId: activeChain.id,
            });
            return writeContract(config, request);
          });
          if (!receipt) return stop();
          hash = receipt.transactionHash;
          setRegisteredTx(hash);
        }
        const linked = await confirmProjectRegistration(projectId, hash);
        if (!linked.ok) return stop(`Registered onchain, but linking failed: ${linked.error} Press Continue launch to retry.`);
        onchainId = linked.data.onchainProjectId;
        onRegistered(onchainId);
        progress = await getLaunchProgress(projectId);
        if (!progress.ok) return stop(progress.error);
      }
      mark(current, "done");
      const id = BigInt(onchainId);
      const available = BigInt(progress.data.available);

      // 3. Funding: deposit only what is still missing.
      current = "deposit";
      mark(current, "active");
      const remaining = plan.bounties.slice(progress.data.bountiesCreated);
      const needed =
        plan.type === "funding_share"
          ? available > 0n
            ? 0n
            : parseUnits(plan.deposit!, asset.decimals)
          : remaining.reduce((sum, b) => sum + parseUnits(b.amount, asset.decimals), 0n) - available;
      if (needed > 0n && !(await deposit(id, needed))) return stop();
      mark(current, "done");

      // 4. Bounties, one transaction each; already-created ones are skipped.
      for (let i = 0; i < plan.bounties.length; i++) {
        current = `bounty-${i}`;
        if (i < progress.data.bountiesCreated) {
          mark(current, "done");
          continue;
        }
        mark(current, "active");
        const bounty = plan.bounties[i];
        const deadline = BigInt(Math.floor(Date.now() / 1000) + bounty.days * 86400);
        const receipt = await tx.run(`Create bounty ${i + 1}`, async (account) => {
          const { request } = await simulateContract(config, {
            address: rewards.address,
            abi: rewards.abi,
            functionName: "createBounty",
            args: [id, parseUnits(bounty.amount, asset.decimals), deadline],
            account,
            chainId: activeChain.id,
          });
          return writeContract(config, request);
        });
        if (!receipt) return stop();
        // The bounty exists onchain either way; a missing title only affects its label.
        await recordBountyDetails(projectId, receipt.transactionHash, [bounty.title]);
        mark(current, "done");
      }

      // 5. Go live (the server re-checks everything onchain).
      current = "live";
      mark(current, "active");
      const live = await goLive(projectId);
      if (!live.ok) return stop(live.error);
      mark(current, "done");
      setLiveSlug(live.data.slug);
      setRunning(false);
    } catch (err) {
      stop(err instanceof Error ? err.message : "Something went wrong. Press Continue launch to retry.");
    }
  }

  if (liveSlug) {
    return (
      <SetupCard className="items-start">
        <span aria-hidden className="text-[40px] leading-none">🎉</span>
        <SetupHeading
          title={`${state.name} is live`}
          description="Your terms are published, the funds are locked onchain, and contributors can find the project on Explore."
        />
        <div className="flex flex-wrap gap-3">
          <Link href={`/projects/${liveSlug}`} className={buttonStyles({ size: "lg" })}>
            View public page
          </Link>
          <Link href={`/founder/${projectId}`} className={buttonStyles({ variant: "secondary", size: "lg" })}>
            Manage project
          </Link>
        </div>
      </SetupCard>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <SetupCard>
        <SetupHeading title="Review and launch" description="Check everything once. Your project goes on Explore only after the funds are locked." />
        <dl className="flex flex-col">
          <SummaryRow label="Repository" onEdit={started ? undefined : () => onEdit(1)}>
            {state.repo?.fullName} <span className="text-deep-teal">· verified</span>
          </SummaryRow>
          <SummaryRow label="Project" onEdit={started ? undefined : () => onEdit(1)}>
            {state.name}
            {state.tagline && <span className="block text-sm font-normal text-deep-teal">{state.tagline}</span>}
          </SummaryRow>
          <SummaryRow label="Rewards" onEdit={running ? undefined : () => onEdit(2)}>
            {plan.type === "bounty" ? (
              <ul className="flex flex-col gap-1">
                {plan.bounties.map((b, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-x-4">
                    <span>{b.title}</span>
                    <span className="text-deep-teal">
                      {b.amount} {asset?.symbol} · {b.days} days
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                Contributor pool · {plan.poolPercent}% of future funding
                <span className="block text-sm font-normal text-deep-teal">
                  First deposit {plan.deposit} {asset?.symbol}
                </span>
              </>
            )}
          </SummaryRow>
          <SummaryRow label="Terms">
            <span className="font-normal text-deep-teal">{state.copy?.summary}</span>
          </SummaryRow>
          <SummaryRow label="Total locked">
            {planTotal(plan)} {asset?.symbol ?? ""}
          </SummaryRow>
        </dl>
      </SetupCard>

      <SetupCard>
        <SetupHeading title="Launch" description={`Your wallet asks you to sign ${signatures} transaction${signatures === 1 ? "" : "s"}. If anything stops halfway, Continue launch picks up where it left off.`} />

        {!contractReady ? (
          <ContractUnavailable />
        ) : !state.verifiedWallet ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-badge border-2 border-terracotta px-5 py-4">
            <span className="text-sm text-ink">Link a payout wallet first. It will own the project onchain.</span>
            <Link href="/profile#wallet" className={buttonStyles({ size: "sm" })}>
              Link wallet
            </Link>
          </div>
        ) : !walletReady ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-badge border-2 border-mist px-5 py-4">
            <span className="text-sm text-ink">
              {address ? "Switch to" : "Connect"} your linked wallet {shortAddress(state.verifiedWallet)} to launch.
            </span>
            {!address && <ConnectWalletButton />}
          </div>
        ) : null}

        <ol className="flex flex-col">
          {items.map((item) => {
            const s = status[item.key] ?? "todo";
            return (
              <li key={item.key} className="flex items-center gap-3.5 border-b border-mist py-3.5 last:border-b-0">
                <StatusIcon status={s} />
                <span className={cn("min-w-0 flex-1 text-base", s === "done" ? "text-deep-teal" : "text-ink", s === "active" && "font-bold")}>
                  {item.label}
                </span>
                {item.signs && <span className="text-caption text-deep-teal">Wallet</span>}
              </li>
            );
          })}
        </ol>

        <TxStatus state={tx.state} />
        <FormMessage error={error} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mist pt-6">
          <Button variant="ghost" disabled={running} onClick={() => onEdit(2)}>
            ← Back
          </Button>
          <Button size="lg" disabled={running || !walletReady || !asset || !contractReady} onClick={launch}>
            {running ? "Launching…" : started ? "Continue launch" : "Launch project"}
          </Button>
        </div>
      </SetupCard>
    </div>
  );
}

function SummaryRow({ label, onEdit, children }: { label: string; onEdit?: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-mist py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6">
      <dt className="text-sm text-deep-teal sm:w-32 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 flex-1 text-base font-bold text-ink">{children}</dd>
      {onEdit && (
        <button type="button" onClick={onEdit} className="self-start text-sm font-medium text-deep-teal hover:text-ink">
          Edit
        </button>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === "done") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-paper" aria-label="Done">
        <svg aria-hidden viewBox="0 0 20 20" className="size-3.5">
          <path fill="currentColor" d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4z" />
        </svg>
      </span>
    );
  }
  if (status === "active") {
    return <span className="size-6 shrink-0 animate-spin rounded-full border-2 border-mist border-t-ink" aria-label="In progress" />;
  }
  if (status === "failed") {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-terracotta text-sm font-bold text-ink" aria-label="Stopped">
        !
      </span>
    );
  }
  return <span className="size-6 shrink-0 rounded-full border-2 border-mist" aria-label="Not started" />;
}
