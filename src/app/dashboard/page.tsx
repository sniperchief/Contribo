import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClaimReward, SyncContribution } from "@/components/contributions/claim-reward";
import { StageBadge, stageTone } from "@/components/contributions/stage-badge";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { contriboRewards } from "@/lib/contracts/config";
import { contributionStage, stageDescriptions, stageLabels, type ContributionStage } from "@/lib/contributions";
import { formatAmount, formatDate } from "@/lib/format";
import { readAssetInfo, type AssetInfo } from "@/lib/server/chain";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "Contributions" };

export default function DashboardPage() {
  return (
    <>
      <section className="pt-14 pb-8">
        <Container className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>Contributions</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Your contributions and rewards</h1>
          </div>
          <Link href="/projects" className={buttonStyles({ size: "lg" })}>
            Browse projects
          </Link>
        </Container>
      </section>
      <Suspense fallback={<Container className="pb-20 text-base text-deep-teal">Loading your contributions…</Container>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

const STAGE_ORDER: ContributionStage[] = ["approved", "accepted", "verified", "submitted", "paid", "rejected"];

async function DashboardContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="pb-20">
        <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-9">
          <h2 className="text-heading-sm">Sign in to see your contributions</h2>
          <p className="text-base text-deep-teal">Contribo uses your GitHub account to verify the pull requests you contribute.</p>
          <Link href="/login?next=/dashboard" className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </div>
      </Container>
    );
  }

  const [{ data: contributions }, { data: profile }] = await Promise.all([
    viewer.supabase
      .from("contributions")
      .select("*, projects!inner(id, slug, name, onchain_project_id, onchain_asset)")
      .eq("contributor_id", viewer.userId)
      .order("created_at", { ascending: false }),
    viewer.supabase.from("profiles").select("skills").eq("id", viewer.userId).maybeSingle(),
  ]);
  const needsSkills = Array.isArray(profile?.skills) && profile.skills.length === 0;

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
      {!viewer.wallet && (
        <Container className="pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-cream px-6 py-5 sm:px-9">
            <p className="text-base text-graphite">Link a payout wallet so approved rewards can be reserved for you onchain.</p>
            <Link href="/profile#wallet" className={buttonStyles()}>
              Link wallet
            </Link>
          </div>
        </Container>
      )}

      {needsSkills && (
        <Container className="pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-lavender px-6 py-5 sm:px-9">
            <div className="flex flex-col gap-1">
              <Eyebrow className="text-plum">Next step</Eyebrow>
              <p className="text-base text-plum">Pick the tech stacks you&apos;re good at so founders can find you.</p>
            </div>
            <Link href="/profile#skills" className={buttonStyles({ className: "gap-2" })}>
              Pick your skills
            </Link>
          </div>
        </Container>
      )}

      {!contriboRewards && (
        <Container className="pb-6">
          <ContractUnavailable />
        </Container>
      )}

      <section className="pb-20">
        <Container>
          <div className="flex flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Pull requests</Eyebrow>
                <h2 className="text-heading-sm">By stage</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {counts
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <Badge key={c.stage} tone={stageTone(c.stage)} title={stageDescriptions[c.stage]} className="px-3.5 py-2">
                      {stageLabels[c.stage]} · {c.count}
                    </Badge>
                  ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-base text-deep-teal">
                Nothing yet.{" "}
                <Link href="/projects" className="font-medium underline underline-offset-2">
                  Browse projects
                </Link>{" "}
                and submit a merged pull request.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-badge border border-mist">
                {rows.map((c) => {
                  const asset = c.projects.onchain_asset ? assets.get(c.projects.onchain_asset) : undefined;
                  return (
                    <li
                      key={c.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-mist px-6 py-5 last:border-b-0",
                        c.stage === "approved" ? "bg-lavender/15" : "bg-paper",
                      )}
                    >
                      <div className="min-w-0 flex-[1_1_360px]">
                        <a href={c.pr_url} target="_blank" rel="noreferrer" className="block truncate text-base font-bold">
                          {c.pr_title ?? `Pull request #${c.pr_number}`}
                        </a>
                        <p className="mt-1 text-[13px] text-deep-teal">
                          <Link href={`/projects/${c.projects.slug}`} className="text-deep-teal underline underline-offset-2">
                            {c.projects.name}
                          </Link>{" "}
                          · merged {formatDate(c.merged_at)}
                          {c.reward_amount &&
                            ` · reward ${asset ? formatAmount(c.reward_amount, asset.decimals, asset.symbol) : `${c.reward_amount} (base units)`}`}
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
                          <div className="flex items-center gap-2.5">
                            <SyncContribution contributionId={c.id} />
                            <StageBadge stage="accepted" />
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
            <p className="text-sm text-deep-teal">Missing a PR? Open its project page and submit the merged pull request link.</p>
          </div>
        </Container>
      </section>
    </>
  );
}
