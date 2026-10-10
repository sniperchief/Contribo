import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StageBadge } from "@/components/contributions/stage-badge";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { BountyStatusOnchain, contriboRewards } from "@/lib/contracts/config";
import { contributionStage } from "@/lib/contributions";
import { formatAmount, formatDate, shortHash } from "@/lib/format";
import { sameHash } from "@/lib/policy";
import { readAssetInfo, readOnchainProject, readProjectBounties } from "@/lib/server/chain";
import { createGitHubClient } from "@/lib/server/github";
import { getViewer, type Viewer } from "@/lib/server/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { SubmitPullRequest, type DetectedPull } from "./submit-pull-request";

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading project…</p>}>
        <ProjectContent params={params} />
      </Suspense>
    </Container>
  );
}

const modelLabels = { bounty: "Bounties", funding_share: "Share of future funding", hybrid: "Bounties + funding share" };

async function ProjectContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const supabase = viewer?.supabase ?? (await createClient());
  if (!supabase) notFound();
  const { data: project } = await supabase
    .from("projects")
    .select("*, project_repositories(*), reward_policies(*)")
    .eq("slug", slug)
    .maybeSingle();
  if (!project) notFound();

  const policies = [...project.reward_policies].sort((a, b) => b.version - a.version);
  const published = policies.find((p) => p.status === "published") ?? null;
  const repos = project.project_repositories.filter((r) => r.verified_at);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {project.status !== "published" && <Badge tone="warning">{project.status}</Badge>}
          {project.onchain_project_id && <Badge tone="success">Onchain project #{project.onchain_project_id}</Badge>}
        </div>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">{project.name}</h1>
        {project.tagline && <p className="max-w-2xl text-lg text-muted">{project.tagline}</p>}
        {project.description && <p className="max-w-2xl whitespace-pre-line text-ink-soft">{project.description}</p>}
        <div className="flex flex-wrap gap-3">
          {project.website_url && (
            <a href={project.website_url} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Website
            </a>
          )}
          {viewer?.userId === project.owner_id && (
            <Link href={`/founder/${project.id}`} className={buttonStyles({ size: "sm" })}>
              Manage project
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RewardTerms policy={published} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
              <CardDescription>Ownership verified through the GitHub API.</CardDescription>
            </CardHeader>
            <CardContent>
              {repos.length === 0 ? (
                <p className="text-sm text-muted">No verified repositories yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {repos.map((repo) => (
                    <li key={repo.id}>
                      <a
                        href={`https://github.com/${repo.github_owner}/${repo.github_name}`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-sm text-ink hover:underline"
                      >
                        {repo.github_owner}/{repo.github_name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <OnchainSummary project={project} publishedHash={published?.policy_hash ?? null} />
        </div>
      </div>

      {project.status === "published" && (
        <ContributePanel viewer={viewer} project={project} repos={repos} hasPolicy={!!published} />
      )}
    </>
  );
}

function RewardTerms({ policy }: { policy: Tables<"reward_policies"> | null }) {
  if (!policy) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reward terms</CardTitle>
          <CardDescription>
            This project has not published a reward policy yet. Contributions merged before a policy is published are not
            eligible for rewards.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Version {policy.version}</Badge>
          <Badge>{modelLabels[policy.reward_model]}</Badge>
          {policy.contributor_pool_bps !== null && (
            <Badge>{policy.contributor_pool_bps / 100}% contributor pool</Badge>
          )}
          <Badge>Paid in {policy.reward_asset === "MON" ? "MON" : shortHash(policy.reward_asset)}</Badge>
        </div>
        <CardTitle className="text-xl">{policy.title}</CardTitle>
        {policy.summary && <CardDescription>{policy.summary}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {policy.terms && <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{policy.terms}</p>}
        {policy.eligibility && Object.keys(policy.eligibility as object).length > 0 && (
          <pre className="overflow-x-auto rounded-md bg-surface-sunken p-3 font-mono text-xs text-ink-soft">
            {JSON.stringify(policy.eligibility, null, 2)}
          </pre>
        )}
        <p className="text-xs text-subtle">
          Published {formatDate(policy.published_at)} · Policy hash <span className="font-mono">{shortHash(policy.policy_hash ?? "")}</span>.
          Published policies cannot be edited.
        </p>
      </CardContent>
    </Card>
  );
}

async function loadOnchainSummary(onchainProjectId: string) {
  try {
    const id = BigInt(onchainProjectId);
    const [onchain, bounties] = await Promise.all([readOnchainProject(id), readProjectBounties(id)]);
    if (!onchain) return null;
    const asset = await readAssetInfo(onchain.asset);
    return { onchain, asset, open: bounties.filter((b) => b.status === BountyStatusOnchain.Open) };
  } catch {
    return null;
  }
}

async function OnchainSummary({ project, publishedHash }: { project: Tables<"projects">; publishedHash: string | null }) {
  const data = contriboRewards && project.onchain_project_id ? await loadOnchainSummary(project.onchain_project_id) : null;

  let body: React.ReactNode;
  if (!contriboRewards) {
    body = <ContractUnavailable />;
  } else if (!project.onchain_project_id) {
    body = <p className="text-sm text-muted">Not registered onchain yet, so no rewards can be funded or paid.</p>;
  } else if (!data) {
    body = <p className="text-sm text-danger">Could not read onchain data from the Monad RPC. Try again shortly.</p>;
  } else {
    const { onchain, asset, open } = data;
    const fmt = (v: bigint) => formatAmount(v, asset.decimals, asset.symbol);
    body = (
      <div className="flex flex-col gap-3 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <dt className="text-muted">Available</dt>
          <dd className="text-right font-mono text-ink">{fmt(onchain.balances.available)}</dd>
          <dt className="text-muted">In open bounties</dt>
          <dd className="text-right font-mono text-ink">{fmt(onchain.balances.escrowed)}</dd>
          <dt className="text-muted">Owed to contributors</dt>
          <dd className="text-right font-mono text-ink">{fmt(onchain.balances.committed)}</dd>
          <dt className="text-muted">Paid out</dt>
          <dd className="text-right font-mono text-ink">{fmt(onchain.balances.totalPaid)}</dd>
        </dl>
        {sameHash(publishedHash, onchain.policyHash) ? (
          <Badge tone="success" className="self-start">Onchain policy matches published terms</Badge>
        ) : (
          <Badge tone="warning" className="self-start">Onchain policy hash differs from published terms</Badge>
        )}
        {open.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ink">Open bounties</p>
            <ul className="flex flex-col gap-1">
              {open.map((b) => (
                <li key={b.id.toString()} className="flex justify-between text-muted">
                  <span>Bounty #{b.id.toString()} · until {formatDate(new Date(Number(b.deadline) * 1000).toISOString())}</span>
                  <span className="font-mono text-ink">{fmt(b.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-subtle">Read live from the ContriboRewards contract.</p>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Onchain rewards</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

async function ContributePanel({
  viewer,
  project,
  repos,
  hasPolicy,
}: {
  viewer: Viewer | null;
  project: Tables<"projects">;
  repos: Tables<"project_repositories">[];
  hasPolicy: boolean;
}) {
  if (!viewer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contribute</CardTitle>
          <CardDescription>Sign in with GitHub to submit merged pull requests for this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={`/login?next=${encodeURIComponent(`/projects/${project.slug}`)}`} className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </CardContent>
      </Card>
    );
  }

  const { data: mine } = await viewer.supabase
    .from("contributions")
    .select("id, pr_url, pr_title, pr_number, status, approved_onchain_at, claimed_at")
    .eq("project_id", project.id)
    .eq("contributor_id", viewer.userId)
    .order("created_at", { ascending: false });
  const submitted = new Set((mine ?? []).map((c) => c.pr_url.toLowerCase()));

  let detected: DetectedPull[] = [];
  let detectionError: string | null = null;
  if (viewer.github && repos.length > 0) {
    try {
      const found = await createGitHubClient().searchMergedPulls(
        viewer.github.login,
        repos.map((r) => `${r.github_owner}/${r.github_name}`),
      );
      detected = found
        .filter((p) => !submitted.has(p.url.toLowerCase()))
        .map((p) => ({ url: p.url, title: p.title, repo: p.repoFullName, number: p.number }));
    } catch {
      detectionError = "Could not search GitHub right now. You can still submit a pull request URL.";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contribute</CardTitle>
        <CardDescription>
          Merged pull requests you authored{viewer.github ? ` as @${viewer.github.login}` : ""} in the verified repositories.
          Verification checks the repository, author and merge status with GitHub. It is evidence for review, not an
          automatic reward.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!hasPolicy && <p className="text-sm text-warning">This project has no published reward policy yet.</p>}
        {detectionError && <p className="text-sm text-muted">{detectionError}</p>}
        <SubmitPullRequest projectId={project.id} detected={detected} />
        {mine && mine.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Your submissions</p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {mine.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <a href={c.pr_url} target="_blank" rel="noreferrer" className="truncate text-sm text-ink hover:underline">
                    {c.pr_title ?? `Pull request #${c.pr_number}`}
                  </a>
                  <StageBadge stage={contributionStage(c)} />
                </li>
              ))}
            </ul>
            <Link href="/dashboard" className="text-sm text-accent hover:underline">
              Track rewards and claims in your dashboard →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
