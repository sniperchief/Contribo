"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { erc20Abi, getAddress, isAddress, parseUnits, zeroAddress, zeroHash, type Address, type Hex } from "viem";
import { useConfig, useConnection } from "wagmi";
import { getBalance, readContract, simulateContract, writeContract } from "wagmi/actions";
import { confirmProjectRegistration, syncApprover } from "@/app/founder/actions";
import { TxStatus } from "@/components/tx/tx-status";
import { useContractTx } from "@/components/tx/use-contract-tx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { BountyStatusOnchain, contriboRewards, isNativeAsset } from "@/lib/contracts/config";
import { formatAmount, formatDate, shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { sameHash } from "@/lib/policy";
import { projectMetadataUri } from "@/lib/projects";

export type OnchainSnapshot = {
  owner: string;
  pendingOwner: string;
  asset: string;
  policyHash: string;
  balances: { available: string; escrowed: string; committed: string; totalDeposited: string; totalPaid: string; totalWithdrawn: string };
};

export type BountyRow = { id: string; amount: string; deadline: number; status: number };

type Props = {
  projectId: string;
  onchainProjectId: string | null;
  verifiedWallet: string | null;
  publishedPolicy: { hash: string | null; rewardAsset: string } | null;
  onchain: OnchainSnapshot | null;
  asset: { symbol: string; decimals: number } | null;
  bounties: BountyRow[];
  approvers: Array<{ address: string; active: boolean }>;
};

const rewards = contriboRewards!;

function WalletGuard({ verifiedWallet, expected }: { verifiedWallet: string | null; expected?: string }) {
  const { address } = useConnection();
  const target = expected ?? verifiedWallet;
  if (!verifiedWallet) {
    return <p className="text-sm text-warning">Link and verify your wallet in the dashboard before sending transactions.</p>;
  }
  if (target && address?.toLowerCase() !== target.toLowerCase()) {
    return <p className="text-sm text-warning">Connect the project owner wallet {shortAddress(target)} to continue.</p>;
  }
  return null;
}

export function OnchainPanel(props: Props) {
  if (!props.onchainProjectId || !props.onchain) return <RegisterProject {...props} />;
  const owner = props.onchain.owner;
  return (
    <div className="flex flex-col gap-8">
      <Overview {...props} onchain={props.onchain} />
      <WalletGuard verifiedWallet={props.verifiedWallet} expected={owner} />
      <PolicyHashSync {...props} onchain={props.onchain} />
      <FundProject {...props} onchain={props.onchain} />
      <Bounties {...props} />
      <Approvers {...props} />
    </div>
  );
}

function Overview({ onchain, asset, onchainProjectId }: Props & { onchain: OnchainSnapshot }) {
  const fmt = (v: string) => (asset ? formatAmount(v, asset.decimals, asset.symbol) : v);
  const rows: Array<[string, string]> = [
    ["Available (unallocated)", fmt(onchain.balances.available)],
    ["Escrowed in open bounties", fmt(onchain.balances.escrowed)],
    ["Committed to contributors", fmt(onchain.balances.committed)],
    ["Total deposited", fmt(onchain.balances.totalDeposited)],
    ["Total paid", fmt(onchain.balances.totalPaid)],
    ["Total withdrawn", fmt(onchain.balances.totalWithdrawn)],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">Onchain project</dt>
        <dd className="text-right font-mono text-ink">#{onchainProjectId}</dd>
        <dt className="text-muted">Owner</dt>
        <dd className="text-right font-mono text-ink">{shortAddress(onchain.owner)}</dd>
        {onchain.pendingOwner !== zeroAddress && (
          <>
            <dt className="text-muted">Pending owner</dt>
            <dd className="text-right font-mono text-ink">{shortAddress(onchain.pendingOwner)}</dd>
          </>
        )}
        <dt className="text-muted">Asset</dt>
        <dd className="text-right font-mono text-ink">
          {isNativeAsset(onchain.asset) ? "MON (native)" : shortAddress(onchain.asset)}
        </dd>
      </dl>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-right font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-subtle sm:col-span-2">Balances are read from the contract. They change only after a transaction confirms.</p>
    </div>
  );
}

function RegisterProject({ projectId, verifiedWallet, publishedPolicy }: Props) {
  const config = useConfig();
  const router = useRouter();
  const tx = useContractTx();
  const [error, setError] = useState<string | null>(null);
  // Once a registration transaction confirms, never offer to register again:
  // only (re)try linking that transaction to this project.
  const [registeredTx, setRegisteredTx] = useState<Hex | null>(null);
  const [linking, setLinking] = useState(false);

  if (!publishedPolicy?.hash) {
    return <p className="text-sm text-muted">Publish a reward policy first. Its asset and hash are used to register the project onchain.</p>;
  }
  const asset: Address = publishedPolicy.rewardAsset.toUpperCase() === "MON" ? zeroAddress : getAddress(publishedPolicy.rewardAsset);

  async function link(txHash: Hex) {
    setLinking(true);
    setError(null);
    const result = await confirmProjectRegistration(projectId, txHash);
    if (!result.ok) setError(`Registered onchain, but linking failed: ${result.error}`);
    router.refresh();
    setLinking(false);
  }

  async function register() {
    if (registeredTx) return link(registeredTx);
    setError(null);
    const receipt = await tx.run("Register project", async (account) => {
      const { request } = await simulateContract(config, {
        address: rewards.address,
        abi: rewards.abi,
        functionName: "registerProject",
        args: [asset, projectMetadataUri(projectId), (publishedPolicy!.hash as Hex) ?? zeroHash],
        account,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    });
    if (receipt) {
      setRegisteredTx(receipt.transactionHash);
      await link(receipt.transactionHash);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Registers this project in the ContriboRewards contract with your verified wallet as owner. Rewards will be paid in{" "}
        <span className="font-medium text-ink">{asset === zeroAddress ? "MON" : shortAddress(asset)}</span>; the asset cannot
        change later.
      </p>
      <WalletGuard verifiedWallet={verifiedWallet} />
      <Button className="self-start" onClick={register} disabled={tx.busy || linking || !verifiedWallet}>
        {linking ? "Linking registration…" : registeredTx ? "Retry linking" : "Register onchain"}
      </Button>
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </div>
  );
}

function PolicyHashSync({ onchainProjectId, publishedPolicy, onchain }: Props & { onchain: OnchainSnapshot }) {
  const config = useConfig();
  const router = useRouter();
  const tx = useContractTx();
  const hash = publishedPolicy?.hash;
  if (!hash) return null;
  if (sameHash(hash, onchain.policyHash)) {
    return <Badge tone="success" className="self-start">Onchain policy hash matches the published policy</Badge>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-4">
      <p className="text-sm text-ink">The onchain policy hash does not match the published policy. Approvals are blocked until it does.</p>
      <Button
        size="sm"
        className="self-start"
        disabled={tx.busy}
        onClick={async () => {
          const receipt = await tx.run("Update policy hash", async (account) => {
            const { request } = await simulateContract(config, {
              address: rewards.address,
              abi: rewards.abi,
              functionName: "setPolicyHash",
              args: [BigInt(onchainProjectId!), hash as Hex],
              account,
              chainId: activeChain.id,
            });
            return writeContract(config, request);
          });
          if (receipt) router.refresh();
        }}
      >
        Update onchain policy hash
      </Button>
      <TxStatus state={tx.state} />
    </div>
  );
}

function FundProject({ onchainProjectId, onchain, asset }: Props & { onchain: OnchainSnapshot }) {
  const config = useConfig();
  const { address } = useConnection();
  const router = useRouter();
  const tx = useContractTx();
  const [error, setError] = useState<string | null>(null);
  if (!asset) return null;
  const native = isNativeAsset(onchain.asset);

  async function fund(amountText: string) {
    setError(null);
    let amount: bigint;
    try {
      amount = parseUnits(amountText, asset!.decimals);
    } catch {
      return setError("Enter a valid amount.");
    }
    if (amount <= 0n) return setError("Enter an amount greater than zero.");
    const projectId = BigInt(onchainProjectId!);

    if (native) {
      await tx.run("Deposit", async (account) => {
        const { value: balance } = await getBalance(config, { address: account, chainId: activeChain.id });
        if (balance < amount) throw Object.assign(new Error("Insufficient balance"), { name: "InsufficientFundsError" });
        const { request } = await simulateContract(config, {
          address: rewards.address,
          abi: rewards.abi,
          functionName: "deposit",
          args: [projectId, amount],
          value: amount,
          account,
          chainId: activeChain.id,
        });
        return writeContract(config, request);
      });
    } else {
      const token = getAddress(onchain.asset);
      if (address) {
        const [balance, allowance] = await Promise.all([
          readContract(config, { address: token, abi: erc20Abi, functionName: "balanceOf", args: [address], chainId: activeChain.id }),
          readContract(config, {
            address: token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, rewards.address],
            chainId: activeChain.id,
          }),
        ]);
        if (balance < amount) return setError(`Your ${asset!.symbol} balance is too low.`);
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
          if (!approved) return;
        }
      }
      await tx.run("Deposit", async (from) => {
        const { request } = await simulateContract(config, {
          address: rewards.address,
          abi: rewards.abi,
          functionName: "deposit",
          args: [projectId, amount],
          account: from,
          chainId: activeChain.id,
        });
        return writeContract(config, request);
      });
    }
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void fund(String(new FormData(event.currentTarget).get("amount") ?? ""));
      }}
    >
      <p className="text-sm font-medium text-ink">Fund the reward pool</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="amount" inputMode="decimal" required placeholder={`Amount in ${asset.symbol}`} aria-label="Amount" />
        <Button type="submit" variant="secondary" disabled={tx.busy}>
          Deposit
        </Button>
      </div>
      {!native && <p className="text-xs text-muted">ERC-20 deposits need two transactions: approve, then deposit.</p>}
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </form>
  );
}

function Bounties({ onchainProjectId, asset, bounties }: Props) {
  const config = useConfig();
  const router = useRouter();
  const tx = useContractTx();
  const [error, setError] = useState<string | null>(null);
  if (!asset) return null;
  const fmt = (v: string) => formatAmount(v, asset.decimals, asset.symbol);
  const statusLabel = ["", "Open", "Awarded", "Cancelled"];

  async function create(form: FormData) {
    setError(null);
    let amount: bigint;
    try {
      amount = parseUnits(String(form.get("amount") ?? ""), asset!.decimals);
    } catch {
      return setError("Enter a valid amount.");
    }
    const days = Number(form.get("days"));
    if (amount <= 0n || !Number.isInteger(days) || days < 1 || days > 365) {
      return setError("Enter an amount and a deadline between 1 and 365 days.");
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
    const receipt = await tx.run("Create bounty", async (account) => {
      const { request } = await simulateContract(config, {
        address: rewards.address,
        abi: rewards.abi,
        functionName: "createBounty",
        args: [BigInt(onchainProjectId!), amount, deadline],
        account,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    });
    if (receipt) router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">Fixed bounties</p>
      {bounties.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {bounties.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span className="text-ink">
                Bounty #{b.id} · cancellable after {formatDate(new Date(b.deadline * 1000).toISOString())}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-ink">{fmt(b.amount)}</span>
                <Badge tone={b.status === BountyStatusOnchain.Open ? "accent" : "neutral"}>{statusLabel[b.status]}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void create(new FormData(event.currentTarget));
        }}
      >
        <Input name="amount" inputMode="decimal" required placeholder={`Amount in ${asset.symbol}`} aria-label="Bounty amount" />
        <Input name="days" type="number" min={1} max={365} defaultValue={30} aria-label="Deadline in days" />
        <Button type="submit" variant="secondary" disabled={tx.busy}>
          Escrow bounty
        </Button>
      </form>
      <p className="text-xs text-muted">Escrow comes from available funds and can only be reclaimed after the deadline if unawarded.</p>
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </div>
  );
}

function Approvers({ projectId, onchainProjectId, approvers }: Props) {
  const config = useConfig();
  const router = useRouter();
  const tx = useContractTx();
  const [error, setError] = useState<string | null>(null);

  async function update(address: string, allowed: boolean) {
    setError(null);
    if (!isAddress(address)) return setError("Enter a valid address.");
    const receipt = await tx.run(allowed ? "Add approver" : "Remove approver", async (account) => {
      const { request } = await simulateContract(config, {
        address: rewards.address,
        abi: rewards.abi,
        functionName: "setApprover",
        args: [BigInt(onchainProjectId!), getAddress(address), allowed],
        account,
        chainId: activeChain.id,
      });
      return writeContract(config, request);
    });
    if (receipt) {
      const result = await syncApprover(projectId, address, receipt.transactionHash);
      if (!result.ok) setError(result.error);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">Approvers</p>
      <p className="text-xs text-muted">
        The owner wallet can always approve. Approvers can commit available and escrowed funds to contributors, so add only
        wallets you trust. Ownership transfers clear all approvers.
      </p>
      {approvers.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {approvers.map((a) => (
            <li key={a.address} className="flex items-center justify-between gap-2 px-4 py-2">
              <span className="font-mono text-ink">{a.address}</span>
              <span className="flex items-center gap-2">
                <Badge tone={a.active ? "success" : "warning"}>{a.active ? "Active onchain" : "Not active onchain"}</Badge>
                {a.active && (
                  <Button size="sm" variant="ghost" disabled={tx.busy} onClick={() => update(a.address, false)}>
                    Remove
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void update(String(new FormData(event.currentTarget).get("address") ?? "").trim(), true);
        }}
      >
        <Field label="Approver address" className="flex-1">
          <Input name="address" required placeholder="0x…" />
        </Field>
        <Button type="submit" variant="secondary" className="sm:self-end" disabled={tx.busy}>
          Add approver
        </Button>
      </form>
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </div>
  );
}
