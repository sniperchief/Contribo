import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimReward, SyncContribution } from "@/components/contributions/claim-reward";
import { StageBadge } from "@/components/contributions/stage-badge";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { contriboRewards } from "@/lib/contracts/config";
import { contributionStage, stageDescriptions, stageLabels, type ContributionStage } from "@/lib/contributions";
import { formatAmount, formatDate } from "@/lib/format";
import { readAssetInfo, type AssetInfo } from "@/lib/server/chain";
import { getViewer } from "@/lib/server/viewer";
import { WalletLink } from "./wallet-link";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Contributor dashboard</p>
        <h1 className="text-3xl font-bold text-ink">Your contributions and rewards</h1>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading your dashboard…</p>}>
        <DashboardContent />
      </Suspense>
    </Container>
  );
}

const STAGE_ORDER: ContributionStage[] = ["approved", "accepted", "verified", "submitted", "paid", "rejected"];

async function DashboardContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to see your dashboard</CardTitle>
          <CardDescription>Contribo uses your GitHub account to verify the pull requests you contribute.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login?next=/dashboard" className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { data: contributions } = await viewer.supabase
    .from("contributions")
    .select("*, projects!inner(id, slug, name, onchain_project_id, onchain_asset)")
    .eq("contributor_id", viewer.userId)
    .order("created_at", { ascending: false });

  const assets = new Map<string, AssetInfo>();
  if (contriboRewards) {
    for (const asset of new Set((contributions ?? []).map((c) => c.projects.onchain_asset).filter(Boolean))) {
      try {
        assets.set(asset!, await readAssetInfo(asset));
      } catch {
        // Unreadable token metadata: amounts fall back to raw units below.
      }
    }
  }

  const rows = (contributions ?? []).map((c) => ({ ...c, stage: contributionStage(c) }));
  rows.sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  const counts = STAGE_ORDER.map((stage) => ({ stage, count: rows.filter((r) => r.stage === stage).length }));

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>GitHub</CardTitle>
            <CardDescription>Pull requests are verified against this linked account.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {viewer.github ? (
              <p className="text-ink">
                Linked as{" "}
                <a href={`https://github.com/${viewer.github.login}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  @{viewer.github.login}
                </a>{" "}
                <span className="text-subtle">(GitHub ID {viewer.github.userId})</span>
              </p>
            ) : (
              <p className="text-warning">No GitHub identity found. Sign out and sign in with GitHub again.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Payout wallet</CardTitle>
            <CardDescription>Approved rewards are reserved for this wallet onchain.</CardDescription>
          </CardHeader>
          <CardContent>
            <WalletLink userId={viewer.userId} linkedWallet={viewer.wallet} />
          </CardContent>
        </Card>
      </div>

      {!contriboRewards && <ContractUnavailable />}

      <Card>
        <CardHeader>
          <CardTitle>Contributions</CardTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {counts
              .filter((c) => c.count > 0)
              .map((c) => (
                <span key={c.stage} title={stageDescriptions[c.stage]}>
                  {stageLabels[c.stage]}: <span className="font-medium text-ink">{c.count}</span>
                </span>
              ))}
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing yet. <Link href="/projects" className="text-accent hover:underline">Browse projects</Link> and submit
              a merged pull request.
            </p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {rows.map((c) => {
                const asset = c.projects.onchain_asset ? assets.get(c.projects.onchain_asset) : undefined;
                return (
                  <li key={c.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <a href={c.pr_url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                        {c.pr_title ?? `Pull request #${c.pr_number}`}
                      </a>
                      <p className="text-xs text-muted">
                        <Link href={`/projects/${c.projects.slug}`} className="hover:underline">{c.projects.name}</Link> · merged{" "}
                        {formatDate(c.merged_at)}
                        {c.reward_amount && (
                          <>
                            {" "}· reward{" "}
                            <span className="font-mono text-ink">
                              {asset ? formatAmount(c.reward_amount, asset.decimals, asset.symbol) : `${c.reward_amount} (base units)`}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {c.stage === "approved" && contriboRewards && c.projects.onchain_project_id && c.onchain_ref && c.contributor_wallet ? (
                        <ClaimReward
                          contributionId={c.id}
                          onchainProjectId={c.projects.onchain_project_id}
                          onchainRef={c.onchain_ref}
                          contributorWallet={c.contributor_wallet}
                        />
                      ) : c.stage === "accepted" && contriboRewards ? (
                        <div className="flex items-center gap-2">
                          <StageBadge stage="accepted" />
                          <SyncContribution contributionId={c.id} />
                        </div>
                      ) : (
                        <StageBadge stage={c.stage} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
