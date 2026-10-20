import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { Badge } from "@/components/ui/badge";
import { BandCard } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { isNativeAsset } from "@/lib/contracts/config";
import { formatAmount, formatDate, formatDateTime, shortAddress, shortHash } from "@/lib/format";
import { activeChain, explorerAddressUrl, explorerBlockUrl, explorerTxUrl, sourcifyCheckUrl } from "@/lib/monad/chains";
import { sameHash } from "@/lib/policy";
import type { LastVerified, ProjectTransparency } from "@/lib/server/transparency";
import type { ProjectBalances } from "@/lib/transparency";

type Fmt = (value: bigint) => string;

/**
 * Project reward transparency: every figure is read from ContriboRewards at one
 * block. When the read fails, the last verified figures are shown only behind a
 * clear "could not refresh" notice, with the time they were verified.
 */
export function RewardTransparency({
  data,
  onchainProjectId,
  publishedHash,
}: {
  data: ProjectTransparency;
  onchainProjectId: string | null;
  publishedHash: string | null;
}) {
  let body: React.ReactNode;
  let aside: React.ReactNode = null;

  if (data.kind === "unconfigured") {
    body = <ContractUnavailable />;
  } else if (data.kind === "unregistered") {
    body = <p className="text-base text-deep-teal">Not registered onchain yet, so no rewards can be funded or paid.</p>;
  } else if (data.kind === "failed") {
    aside = <Badge tone="danger">Could not refresh</Badge>;
    body = <FailedRead lastVerified={data.lastVerified} />;
  } else {
    const { ledger, asset } = data;
    const fmt: Fmt = (v) => formatAmount(v, asset.decimals, asset.symbol);
    aside = (
      <div className="flex flex-wrap gap-2">
        {data.stale ? <Badge tone="warning">Possibly out of date</Badge> : <Badge tone="lavender">Verified onchain</Badge>}
        {sameHash(publishedHash, data.policyHash) ? (
          <Badge tone="fog">Matches published terms</Badge>
        ) : (
          <Badge tone="cream">Policy hash differs</Badge>
        )}
      </div>
    );
    body = (
      <div className="flex flex-col gap-7">
        {data.stale ? (
          <Notice tone="warning">
            The Monad node answered with block{" "}
            <span className="font-mono">#{data.blockNumber.toString()}</span> from {formatDateTime(data.blockTimestamp)},
            which is more than two minutes old. These figures may not be current.
          </Notice>
        ) : (
          <p className="text-caption text-deep-teal">
            Read from the contract at block{" "}
            <ExternalLink href={explorerBlockUrl(data.blockNumber)} className="font-mono">
              #{data.blockNumber.toString()}
            </ExternalLink>{" "}
            ({formatDateTime(data.blockTimestamp)}). Last successful read {formatDateTime(data.readAt)}.
          </p>
        )}

        <BalanceTiles balances={ledger.balances} fmt={fmt} />

        <p className="text-caption text-deep-teal">
          All-time deposits {fmt(ledger.balances.totalDeposited)} · withdrawn by the owner {fmt(ledger.balances.totalWithdrawn)}.{" "}
          {ledger.booksBalance ? (
            <>The books balance: deposits = available + bounties + awaiting claims + paid + withdrawn.</>
          ) : (
            <span className="font-medium text-danger">The contract&apos;s balances do not add up; treat these figures with caution.</span>
          )}
        </p>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <ActiveBounties ledger={ledger} fmt={fmt} />
          <Payouts ledger={ledger} fmt={fmt} />
        </div>

        <VerificationLinks
          contract={data.contract}
          asset={asset.address}
          onchainProjectId={onchainProjectId}
        />
      </div>
    );
  }

  return (
    <BandCard
      tone="plum"
      label="Reward transparency"
      description={`Funds and payouts read from the ContriboRewards contract on ${activeChain.name}.`}
      aside={aside}
    >
      {body}
    </BandCard>
  );
}

const tiles: { key: keyof ProjectBalances; label: string; hint: string; className: string; labelClass: string }[] = [
  {
    key: "available",
    label: "Available for new rewards",
    hint: "Unallocated. Can fund new bounties or pool rewards, or be withdrawn by the owner.",
    className: "bg-fog",
    labelClass: "text-deep-teal",
  },
  {
    key: "escrowed",
    label: "Locked in active bounties",
    hint: "Escrowed for open bounties. The owner can't withdraw it before a bounty's deadline.",
    className: "bg-terracotta/25",
    labelClass: "text-graphite",
  },
  {
    key: "committed",
    label: "Approved, awaiting claim",
    hint: "Reserved for contributors onchain. Nobody else can withdraw or redirect it.",
    className: "bg-lavender",
    labelClass: "text-plum",
  },
  {
    key: "totalPaid",
    label: "Total paid out",
    hint: "All-time claims confirmed by the contract. A history total, not a balance.",
    className: "bg-sky",
    labelClass: "text-deep-teal",
  },
];

function BalanceTiles({ balances, fmt, muted = false }: { balances: ProjectBalances; fmt: Fmt; muted?: boolean }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className={cn("flex flex-col gap-1.5 rounded-badge px-4 py-3.5", muted ? "bg-fog opacity-70" : tile.className)}
        >
          <dt className={cn("text-caption font-medium", muted ? "text-deep-teal" : tile.labelClass)}>{tile.label}</dt>
          <dd className="text-body-lg font-bold tracking-[-0.02em] break-words">{fmt(balances[tile.key])}</dd>
          <dd className="text-caption text-deep-teal">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActiveBounties({ ledger, fmt }: { ledger: Extract<ProjectTransparency, { kind: "verified" }>["ledger"]; fmt: Fmt }) {
  const { active, awardedCount, cancelledCount, unlistedEscrow } = ledger.bounties;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="active-bounties">
      <h3 id="active-bounties" className="text-base font-bold">
        Active bounties
      </h3>
      {active.length === 0 ? (
        <p className="text-sm text-deep-teal">No open bounties right now.</p>
      ) : (
        <ul className="overflow-hidden rounded-badge border border-mist">
          {active.map((b) => (
            <li key={b.id.toString()} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-mist px-4 py-3 last:border-b-0">
              <span className="min-w-0 text-sm">
                <span className="block font-bold">{b.title ?? `Bounty #${b.id.toString()}`}</span>
                <span className="text-deep-teal">
                  {b.state === "open"
                    ? `Open until ${formatDate(new Date(Number(b.deadline) * 1000).toISOString())}`
                    : `Deadline ${formatDate(new Date(Number(b.deadline) * 1000).toISOString())} passed · still open until the owner cancels it`}
                </span>
              </span>
              <Badge tone="terracotta">{fmt(b.remaining)}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-deep-teal">
        Each bounty pays its full amount to one contribution; the amount shown remains available until it is awarded.
        {awardedCount + cancelledCount > 0 && ` ${awardedCount} awarded, ${cancelledCount} cancelled.`}
        {unlistedEscrow > 0n &&
          ` ${fmt(unlistedEscrow)} is escrowed in older bounties not listed here (only the 200 most recent bounties are scanned).`}
      </p>
    </section>
  );
}

function Payouts({ ledger, fmt }: { ledger: Extract<ProjectTransparency, { kind: "verified" }>["ledger"]; fmt: Fmt }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="payouts">
      <h3 id="payouts" className="text-base font-bold">
        Confirmed payouts
      </h3>
      {ledger.payouts.length === 0 ? (
        <p className="text-sm text-deep-teal">No rewards have been claimed yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-badge border border-mist">
          {ledger.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-mist px-4 py-3 last:border-b-0">
              <span className="min-w-0 text-sm">
                <a href={p.prUrl} target="_blank" rel="noreferrer" className="block truncate font-bold text-ink">
                  {p.prTitle ?? `Pull request #${p.prNumber}`}
                </a>
                <span className="text-deep-teal">
                  @{p.githubLogin}
                  {p.claimTxHash ? (
                    <>
                      {" · "}
                      <ExternalLink href={explorerTxUrl(p.claimTxHash)} className="font-mono">
                        {shortHash(p.claimTxHash)}
                      </ExternalLink>
                    </>
                  ) : (
                    " · confirmed by contract state"
                  )}
                </span>
              </span>
              <Badge tone="sky">{fmt(p.amount)}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-deep-teal">
        Listed only when the contract reports the reward as claimed. Transaction links come from receipts that emitted the
        RewardClaimed event.
        {ledger.awaitingClaim.length > 0 &&
          ` ${ledger.awaitingClaim.length} approved ${ledger.awaitingClaim.length === 1 ? "reward is" : "rewards are"} waiting to be claimed.`}
        {ledger.unlistedPaid > 0n && ` ${fmt(ledger.unlistedPaid)} of the total was claimed without a matching Contribo record.`}
      </p>
    </section>
  );
}

function VerificationLinks({
  contract,
  asset,
  onchainProjectId,
}: {
  contract: string;
  asset: string;
  onchainProjectId: string | null;
}) {
  const native = isNativeAsset(asset);
  return (
    <div className="flex flex-col gap-2 border-t border-mist pt-5">
      <p className="text-caption font-medium text-deep-teal">Verify it yourself</p>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <li>
          Network: <span className="font-medium">{activeChain.name}</span> (chain ID {activeChain.id})
        </li>
        <li>
          <ExternalLink href={explorerAddressUrl(contract)}>Contract {shortAddress(contract)}</ExternalLink>
        </li>
        <li>
          <ExternalLink href={sourcifyCheckUrl(contract)}>Source code verification (Sourcify)</ExternalLink>
        </li>
        {onchainProjectId && <li>Onchain project #{onchainProjectId}</li>}
        <li>
          {native ? (
            `Paid in native ${activeChain.nativeCurrency.symbol}`
          ) : (
            <ExternalLink href={explorerAddressUrl(asset)}>Reward token {shortAddress(asset)}</ExternalLink>
          )}
        </li>
      </ul>
    </div>
  );
}

function FailedRead({ lastVerified }: { lastVerified: LastVerified | null }) {
  if (!lastVerified) {
    return (
      <Notice tone="danger">
        Could not read this project&apos;s figures from the Monad network, and there is no earlier verified reading to show.
        Try again shortly.
      </Notice>
    );
  }
  const fmt: Fmt = (v) => formatAmount(v, lastVerified.asset.decimals, lastVerified.asset.symbol);
  return (
    <div className="flex flex-col gap-5">
      <Notice tone="danger">
        Could not refresh these figures from the Monad network. Below is the last verified reading, taken at block{" "}
        <span className="font-mono">#{lastVerified.blockNumber.toString()}</span> on {formatDateTime(lastVerified.readAt)}.
        Balances may have changed since then.
      </Notice>
      <p className="text-caption font-medium text-deep-teal">Last verified {formatDateTime(lastVerified.readAt)} · not current</p>
      <BalanceTiles balances={lastVerified.balances} fmt={fmt} muted />
    </div>
  );
}

function Notice({ tone, children }: { tone: "warning" | "danger"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-badge px-5 py-3.5 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-cream text-graphite",
      )}
    >
      {children}
    </p>
  );
}

function ExternalLink({ href, className, children }: { href: string | undefined; className?: string; children: React.ReactNode }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cn("font-medium text-ink underline underline-offset-2", className)}>
      {children}
    </a>
  );
}
