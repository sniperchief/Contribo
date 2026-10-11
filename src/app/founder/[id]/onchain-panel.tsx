"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { erc20Abi, getAddress, isAddress, parseUnits, zeroAddress, zeroHash, type Address, type Hex } from "viem";
import { useConfig, useAccount } from "wagmi";
import { getBalance, readContract, simulateContract, writeContract } from "wagmi/actions";
import { confirmProjectRegistration, recordBountyDetails, syncApprover } from "@/app/founder/actions";
import { TxStatus } from "@/components/tx/tx-status";
import { useContractTx } from "@/components/tx/use-contract-tx";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
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

export type BountyRow = { id: string; amount: string; deadline: number; status: number; title?: string | null };

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
  const { address } = useAccount();
  const target = expected ?? verifiedWallet;
  const note = "rounded-badge bg-cream px-5 py-3.5 text-sm text-graphite";
  if (!verifiedWallet) {
    return (
      <p className={note}>
        Link and verify your wallet on your{" "}
        <a href="/profile#wallet" className="font-medium underline underline-offset-2">
          profile
        </a>{" "}
        before sending transactions.
      </p>
    );
  }
  if (target && address?.toLowerCase() !== target.toLowerCase()) {
    return (
      <div className={`${note} flex flex-wrap items-center justify-between gap-3`}>
        <span>
          {address ? "Switch to" : "Connect"} the project owner wallet {shortAddress(target)} to continue.
        </span>
        {!address && <ConnectWalletButton />}
      </div>
    );
  }
  return null;
}

export function OnchainPanel(props: Props) {
  if (!props.onchainProjectId || !props.onchain) return <RegisterProject {...props} />;
  const owner = props.onchain.owner;
  return (
    <div className="flex flex-col gap-7 [&>*+*]:border-t [&>*+*]:border-mist [&>*+*]:pt-7">
      <div className="flex flex-col gap-4">
        <Overview {...props} onchain={props.onchain} />
        <WalletGuard verifiedWallet={props.verifiedWallet} expected={owner} />
        <PolicyHashSync {...props} onchain={props.onchain} />
      </div>
      <FundProject {...props} onchain={props.onchain} />
      <Bounties {...props} />
      <Approvers {...props} />
    </div>
  );
}

function Overview({ onchain, asset }: Props & { onchain: OnchainSnapshot }) {
  const fmt = (v: string) => (asset ? formatAmount(v, asset.decimals, asset.symbol) : v);
  const tiles: Array<{ label: string; value: string; className: string; labelClass: string }> = [
    { label: "Available", value: fmt(onchain.balances.available), className: "bg-fog", labelClass: "text-deep-teal" },
    { label: "Escrowed", value: fmt(onchain.balances.escrowed), className: "bg-cream", labelClass: "text-graphite" },
    { label: "Committed", value: fmt(onchain.balances.committed), className: "bg-lavender", labelClass: "text-plum" },
    { label: "Paid", value: fmt(onchain.balances.totalPaid), className: "bg-sky", labelClass: "text-deep-teal" },
    { label: "Withdrawn", value: fmt(onchain.balances.totalWithdrawn), className: "bg-fog", labelClass: "text-deep-teal" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className={`flex flex-col gap-1.5 rounded-badge px-5 py-4 ${tile.className}`}>
            <p className={`text-caption font-medium ${tile.labelClass}`}>{tile.label}</p>
            <p className="text-subheading leading-tight font-bold tracking-[-0.02em]">{tile.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-deep-teal">
        <span>
          Owner <strong className="font-mono text-ink">{shortAddress(onchain.owner)}</strong>
        </span>
        {onchain.pendingOwner !== zeroAddress && (
          <span>
            Pending owner <strong className="font-mono text-ink">{shortAddress(onchain.pendingOwner)}</strong>
          </span>
        )}
        <span>
          Asset <strong className="text-ink">{isNativeAsset(onchain.asset) ? "MON (native)" : shortAddress(onchain.asset)}</strong>
        </span>
        <span>Balances change only after a transaction confirms.</span>
      </div>
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
    return <p className="text-base text-deep-teal">Publish a reward policy first. Its asset and hash are used to register the project onchain.</p>;
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
    <div className="flex flex-col items-start gap-4">
      <p className="text-base text-deep-teal">
        Registers this project in the ContriboRewards contract with your verified wallet as owner. Rewards will be paid in{" "}
        <span className="font-medium text-ink">{asset === zeroAddress ? "MON" : shortAddress(asset)}</span>; the asset cannot
        change later.
      </p>
      <WalletGuard verifiedWallet={verifiedWallet} />
      <Button onClick={register} disabled={tx.busy || linking || !verifiedWallet}>
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
  if (sameHash(hash, onchain.policyHash)) return null;

  return (
    <div className="flex flex-col gap-3 rounded-badge bg-cream px-5 py-4">
      <p className="text-sm text-graphite">The onchain policy hash does not match the published policy. Approvals are blocked until it does.</p>
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
  const { address } = useAccount();
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
      <p className="text-body-lg font-bold">Fund the reward pool</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input name="amount" inputMode="decimal" required placeholder={`Amount in ${asset.symbol}`} aria-label="Amount" />
        <Button type="submit" disabled={tx.busy}>
          Deposit
        </Button>
      </div>
      {!native && <p className="text-[13px] text-deep-teal">ERC-20 deposits need two transactions: approve, then deposit.</p>}
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </form>
  );
}

function Bounties({ projectId, onchainProjectId, asset, bounties }: Props) {
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
    const title = String(form.get("title") ?? "").trim();
    if (title.length < 3) return setError("Give the bounty a title (at least 3 characters).");
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
    if (receipt) {
      const saved = await recordBountyDetails(projectId, receipt.transactionHash, [title]);
      if (!saved.ok) setError(saved.error);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-lg font-bold">Fixed bounties</p>
      {bounties.length > 0 && (
        <ul className="overflow-hidden rounded-badge border border-mist">
          {bounties.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-mist px-5 py-3.5 last:border-b-0">
              <span className="min-w-0 flex-[1_1_160px] truncate text-[15px] font-bold">{b.title ?? `Bounty #${b.id}`}</span>
              <span className="text-sm text-deep-teal">Deadline {formatDate(new Date(b.deadline * 1000).toISOString())}</span>
              <Badge tone={b.status === BountyStatusOnchain.Open ? "terracotta" : b.status === BountyStatusOnchain.Cancelled ? "cream" : "neutral"}>
                {statusLabel[b.status]}
              </Badge>
              <span className="text-base font-bold sm:w-28 sm:text-right">{fmt(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void create(new FormData(event.currentTarget));
        }}
      >
        <Input name="title" required minLength={3} maxLength={120} placeholder="Bounty title" aria-label="Bounty title" />
        <Input name="amount" inputMode="decimal" required placeholder={`Amount in ${asset.symbol}`} aria-label="Bounty amount" />
        <Input name="days" type="number" min={1} max={365} defaultValue={30} aria-label="Deadline in days" />
        <Button type="submit" variant="secondary" tone="terracotta" disabled={tx.busy}>
          Create bounty
        </Button>
      </form>
      <p className="text-[13px] text-deep-teal">Escrow comes from available funds and can only be reclaimed after the deadline if unawarded.</p>
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
      <p className="text-body-lg font-bold">Approvers</p>
      <p className="text-sm text-deep-teal">
        Approvers can commit your available and escrowed funds to contributors. Keep this list short. The owner wallet can
        always approve, and ownership transfers clear all approvers.
      </p>
      {approvers.length > 0 && (
        <ul className="flex flex-col">
          {approvers.map((a) => (
            <li key={a.address} className="flex flex-wrap items-center gap-3 border-b border-mist py-3">
              <span className="min-w-0 flex-[1_1_200px] truncate font-mono text-[15px]" title={a.address}>
                {shortAddress(a.address)}
              </span>
              <Badge tone={a.active ? "sky" : "cream"}>{a.active ? "Active onchain" : "Not active onchain"}</Badge>
              {a.active && (
                <Button size="sm" variant="ghost" className="px-2 text-sm" disabled={tx.busy} onClick={() => update(a.address, false)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void update(String(new FormData(event.currentTarget).get("address") ?? "").trim(), true);
        }}
      >
        <Field label="Approver address" className="flex-1">
          <Input name="address" required placeholder="0x…" />
        </Field>
        <Button type="submit" variant="secondary" tone="plum" disabled={tx.busy}>
          Add approver
        </Button>
      </form>
      <TxStatus state={tx.state} />
      <FormMessage error={error} />
    </div>
  );
}
