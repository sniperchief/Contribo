import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StageBadge } from "@/components/contributions/stage-badge";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { RewardTransparency } from "@/components/projects/reward-transparency";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { BandCard } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { contributionStage } from "@/lib/contributions";
import { formatDate, shortHash } from "@/lib/format";
import { createGitHubClient } from "@/lib/server/github";
import { loadProjectTransparency } from "@/lib/server/transparency";
import { getViewer, type Viewer } from "@/lib/server/viewer";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { SubmitPullRequest, type DetectedPull } from "./submit-pull-request";

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <Suspense fallback={<Container className="py-14 text-base text-deep-teal">Loading project…</Container>}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

const modelLabels = { bounty: "Bounties", funding_share: "Contributor pool", hybrid: "Bounties + contributor pool" };
const modelTile = { bounty: "bg-terracotta", funding_share: "bg-lavender", hybrid: "bg-sky" };

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
      <section className="pt-10 pb-8">
        <Container className="flex flex-col gap-4">
          <p className="text-sm text-deep-teal">
            <Link href="/projects" className="font-medium text-ink">
              Projects
            </Link>{" "}
            <span aria-hidden>/</span> {project.name}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-center gap-4">
              <span
                className={`grid size-16 shrink-0 place-items-center rounded-[20px] text-heading-sm font-bold ${
                  published ? modelTile[published.reward_model] : "bg-mist"
                }`}
              >
                {project.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <ProjectStatusBadge status={project.status} />
                  {project.onchain_project_id && <Badge tone="plum">Onchain #{project.onchain_project_id}</Badge>}
                </div>
                <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">{project.name}</h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {project.website_url && (
                <a href={project.website_url} target="_blank" rel="noreferrer" className={buttonStyles({ variant: "secondary", tone: "sky" })}>
                  Website
                </a>
              )}
              {viewer?.userId === project.owner_id && (
                <Link href={`/founder/${project.id}`} className={buttonStyles()}>
                  Manage project
                </Link>
              )}
            </div>
          </div>
          {project.tagline && <p className="max-w-2xl text-body-lg text-deep-teal">{project.tagline}</p>}
          {project.description && <p className="max-w-2xl text-base whitespace-pre-line text-deep-teal">{project.description}</p>}
        </Container>
      </section>

      <section className="pb-20">
        <Container className="flex flex-col gap-6">
          <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
            <RewardTerms policy={published} />
            <div className="flex flex-col gap-6">
              <BandCard tone="sky" label="Repositories" description="Ownership verified through the GitHub API.">
                {repos.length === 0 ? (
                  <p className="text-base text-deep-teal">No verified repositories yet.</p>
                ) : (
                  <ul className="flex flex-col">
                    {repos.map((repo) => (
                      <li key={repo.id} className="border-b border-mist py-3 last:border-b-0">
                        <a
                          href={`https://github.com/${repo.github_owner}/${repo.github_name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-base font-bold text-ink"
                        >
                          {repo.github_owner}/{repo.github_name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </BandCard>
            </div>
          </div>

          <Suspense fallback={<p className="rounded-card bg-paper p-9 text-base text-deep-teal">Reading reward funds from Monad…</p>}>
            <ProjectRewards project={project} publishedHash={published?.policy_hash ?? null} />
          </Suspense>

          {project.status === "published" && (
            <ContributePanel viewer={viewer} project={project} repos={repos} hasPolicy={!!published} />
          )}
        </Container>
      </section>
    </>
  );
}

function RewardTerms({ policy }: { policy: Tables<"reward_policies"> | null }) {
  if (!policy) {
    return (
      <BandCard tone="lavender" label="Reward terms">
        <p className="text-base text-deep-teal">
          This project has not published a reward policy yet. Contributions merged before a policy is published are not
          eligible for rewards.
        </p>
      </BandCard>
    );
  }
  return (
    <BandCard tone="lavender" label={`Reward terms · v${policy.version}`} description={policy.summary ?? undefined}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <h2 className="text-heading-sm">{policy.title}</h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone="lavender">{modelLabels[policy.reward_model]}</Badge>
            {policy.contributor_pool_bps !== null && <Badge>{policy.contributor_pool_bps / 100}% contributor pool</Badge>}
            <Badge>Paid in {policy.reward_asset === "MON" ? "MON" : shortHash(policy.reward_asset)}</Badge>
          </div>
        </div>
        {policy.terms && <p className="text-base whitespace-pre-line text-deep-teal">{policy.terms}</p>}
        <p className="border-t border-mist pt-4 text-caption text-deep-teal">
          Published {formatDate(policy.published_at)} · Policy hash{" "}
          <span className="font-mono">{shortHash(policy.policy_hash ?? "")}</span>. Published policies cannot be edited.
        </p>
      </div>
    </BandCard>
  );
}

/** Onchain-approved contributions name the payout rows; the contract decides their state. */
async function ProjectRewards({ project, publishedHash }: { project: Tables<"projects">; publishedHash: string | null }) {
  const supabase = await createClient();
  const [records, titles] = supabase
    ? await Promise.all([
        supabase
          .from("contributions")
          .select("id, onchain_ref, pr_title, pr_number, pr_url, github_login, claim_tx_hash, claimed_at")
          .eq("project_id", project.id)
          .not("approved_onchain_at", "is", null)
          .not("onchain_ref", "is", null)
          .limit(500),
        supabase.from("bounty_details").select("bounty_id, title").eq("project_id", project.id),
      ])
    : [null, null];
  const data = await loadProjectTransparency(
    project,
    {
      records: (records?.data ?? []).map((c) => ({
        id: c.id,
        ref: c.onchain_ref!,
        prTitle: c.pr_title,
        prNumber: c.pr_number,
        prUrl: c.pr_url,
        githubLogin: c.github_login,
        claimTxHash: c.claim_tx_hash,
        claimedAt: c.claimed_at,
      })),
      bountyTitles: new Map((titles?.data ?? []).map((row) => [String(row.bounty_id), row.title])),
    },
    supabase,
  );
  return <RewardTransparency data={data} onchainProjectId={project.onchain_project_id} publishedHash={publishedHash} />;
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
      <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-6 sm:p-9">
        <Eyebrow>Contribute</Eyebrow>
        <h2 className="text-heading-sm">Sign in to submit your pull requests</h2>
        <p className="text-base text-deep-teal">Sign in with GitHub to submit merged pull requests for this project.</p>
        <Link href={`/login?next=${encodeURIComponent(`/projects/${project.slug}`)}`} className={buttonStyles()}>
          Sign in with GitHub
        </Link>
      </div>
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
    <section className="flex flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
      <div className="flex flex-col gap-2">
        <Eyebrow>Contribute</Eyebrow>
        <h2 className="text-heading-sm">Submit your merged pull requests</h2>
        <p className="max-w-3xl text-base text-deep-teal">
          Merged pull requests you authored{viewer.github ? ` as @${viewer.github.login}` : ""} in the verified repositories.
          Verification checks the repository, author and merge status with GitHub. It is evidence for review, not an
          automatic reward.
        </p>
      </div>
      {!hasPolicy && <p className="rounded-badge bg-cream px-5 py-3.5 text-sm text-graphite">This project has no published reward policy yet.</p>}
      {detectionError && <p className="text-sm text-deep-teal">{detectionError}</p>}
      <SubmitPullRequest projectId={project.id} detected={detected} />
      {mine && mine.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-base font-bold">Your submissions</p>
          <ul className="overflow-hidden rounded-badge border border-mist">
            {mine.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 border-b border-mist px-5 py-4 last:border-b-0">
                <a href={c.pr_url} target="_blank" rel="noreferrer" className="truncate text-base font-bold text-ink">
                  {c.pr_title ?? `Pull request #${c.pr_number}`}
                </a>
                <StageBadge stage={contributionStage(c)} />
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2 self-start" })}>
            Track rewards and claims in Contributions
          </Link>
        </div>
      )}
    </section>
  );
}
