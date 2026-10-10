import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
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
import { WalletLink } from "@/components/wallet/wallet-link";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <section className="pt-14 pb-8">
        <Container className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-3.5">
            <Eyebrow>Contributor dashboard</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Your contributions and rewards</h1>
          </div>
          <Link href="/projects" className={buttonStyles({ size: "lg" })}>
            Browse projects
          </Link>
        </Container>
      </section>
      <Suspense fallback={<Container className="pb-20 text-base text-deep-teal">Loading your dashboard…</Container>}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

const STAGE_ORDER: ContributionStage[] = ["approved", "accepted", "verified", "submitted", "paid", "rejected"];

function IdentityCard({ icon, tint, title, description, children }: { icon: ReactNode; tint: string; title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-card bg-paper p-6 sm:p-9">
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-[14px]", tint)}>{icon}</span>
        <h2 className="text-heading-sm">{title}</h2>
      </div>
      <p className="text-base text-deep-teal">{description}</p>
      {children}
    </div>
  );
}

const githubIcon = (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--deep-teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  </svg>
);

const walletIcon = (
  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--plum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18M16 14.5h2" />
  </svg>
);

async function DashboardContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="pb-20">
        <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-9">
          <h2 className="text-heading-sm">Sign in to see your dashboard</h2>
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
      <section className="pb-6">
        <Container className="grid gap-6 md:grid-cols-2">
          <IdentityCard icon={githubIcon} tint="bg-sky" title="GitHub" description="Pull requests are verified against this linked account.">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-badge bg-fog px-5 py-4">
              {viewer.github ? (
                <>
                  <span className="text-base">
                    Linked as{" "}
                    <a href={`https://github.com/${viewer.github.login}`} target="_blank" rel="noreferrer" className="font-bold">
                      @{viewer.github.login}
                    </a>
                  </span>
                  <span className="text-[13px] text-deep-teal">GitHub ID {viewer.github.userId}</span>
                </>
              ) : (
                <span className="text-base text-warning">No GitHub identity found. Sign out and sign in with GitHub again.</span>
              )}
            </div>
          </IdentityCard>
          <IdentityCard icon={walletIcon} tint="bg-lavender" title="Payout wallet" description="Approved rewards are reserved for this wallet onchain.">
            <WalletLink userId={viewer.userId} linkedWallet={viewer.wallet} />
          </IdentityCard>
        </Container>
      </section>

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
                <Eyebrow>Contributions</Eyebrow>
                <h2 className="text-heading-sm">Your pull requests, by stage</h2>
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
