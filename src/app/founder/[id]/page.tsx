import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getAddress } from "viem";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { BandCard } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { BountyStatusOnchain, contriboRewards } from "@/lib/contracts/config";
import { contributionStage } from "@/lib/contributions";
import { sameHash } from "@/lib/policy";
import { createAdminClient } from "@/lib/server/admin";
import {
  readAssetInfo,
  readIsApprover,
  readOnchainProject,
  readProjectBounties,
  type AssetInfo,
  type OnchainProject,
} from "@/lib/server/chain";
import { getProjectAccess, getViewer } from "@/lib/server/viewer";
import { OnchainPanel, type BountyRow, type OnchainSnapshot } from "./onchain-panel";
import { PolicyEditor } from "./policy-editor";
import { ProjectSettings } from "./project-settings";
import { Repositories } from "./repositories";
import { Review, type ReviewRow } from "./review";

export default function ManageProjectPage({ params }: PageProps<"/founder/[id]">) {
  return (
    <Suspense fallback={<Container className="py-14 text-base text-deep-teal">Loading project…</Container>}>
      <ManageContent params={params} />
    </Suspense>
  );
}

async function ManageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="py-14">
        <Link href={`/login?next=/founder/${id}`} className={buttonStyles()}>
          Sign in with GitHub
        </Link>
      </Container>
    );
  }
  const admin = createAdminClient();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !admin) notFound();

  // Authorization happens here, before any privileged read.
  const { data: project } = await admin
    .from("projects")
    .select("*, project_repositories(*), reward_policies(*)")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();
  const access = await getProjectAccess(viewer, project);
  if (!access.isOwner && !access.isApprover) notFound();

  const policies = [...project.reward_policies].sort((a, b) => b.version - a.version);
  const published = policies.find((p) => p.status === "published") ?? null;

  let onchain: OnchainProject | null = null;
  let asset: AssetInfo | null = null;
  let bounties: BountyRow[] = [];
  let chainError = false;
  if (contriboRewards && project.onchain_project_id) {
    try {
      const onchainId = BigInt(project.onchain_project_id);
      const [p, b] = await Promise.all([readOnchainProject(onchainId), readProjectBounties(onchainId)]);
      onchain = p;
      asset = p ? await readAssetInfo(p.asset) : null;
      bounties = b.map((x) => ({ id: x.id.toString(), amount: x.amount.toString(), deadline: Number(x.deadline), status: x.status }));
    } catch {
      chainError = true;
    }
  }

  const [{ data: contributions }, { data: approverRows }] = await Promise.all([
    admin
      .from("contributions")
      .select("*, reward_policies(version), profiles:contributor_id(wallet_address, wallet_verified_at)")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    admin.from("project_approvers").select("address").eq("project_id", project.id),
  ]);

  const approvers = await Promise.all(
    (approverRows ?? []).map(async (row) => ({
      address: getAddress(row.address),
      active:
        !!project.onchain_project_id &&
        (await readIsApprover(BigInt(project.onchain_project_id), getAddress(row.address)).catch(() => false)),
    })),
  );

  const reviewRows: ReviewRow[] = (contributions ?? []).map((c) => ({
    id: c.id,
    prUrl: c.pr_url,
    prTitle: c.pr_title,
    prNumber: c.pr_number,
    githubLogin: c.github_login,
    mergedAt: c.merged_at,
    stage: contributionStage(c),
    rewardAmount: c.reward_amount,
    bountyId: c.bounty_id,
    contributorWallet: c.contributor_wallet,
    verifiedWallet: c.profiles?.wallet_verified_at ? c.profiles.wallet_address : null,
    policyVersion: c.reward_policies?.version ?? null,
  }));
  const pendingReview = reviewRows.filter((r) => r.stage === "verified" || r.stage === "accepted").length;

  const snapshot: OnchainSnapshot | null = onchain && {
    owner: onchain.owner,
    pendingOwner: onchain.pendingOwner,
    asset: onchain.asset,
    policyHash: onchain.policyHash,
    balances: Object.fromEntries(
      Object.entries(onchain.balances).map(([k, v]) => [k, v.toString()]),
    ) as OnchainSnapshot["balances"],
  };
  const policyMatches = !!snapshot && sameHash(published?.policy_hash, snapshot.policyHash);

  const menu = [
    ...(access.isOwner
      ? [
          { href: "#details", label: "Project details" },
          { href: "#repos", label: "Repositories" },
          { href: "#policy", label: "Reward policy" },
          { href: "#onchain", label: "Onchain" },
        ]
      : []),
    { href: "#review", label: "Review contributions", count: pendingReview },
  ];

  return (
    <>
      <section className="pt-10 pb-8">
        <Container className="flex flex-col gap-4">
          <p className="text-sm text-deep-teal">
            <Link href="/founder" className="font-medium text-ink">
              Your projects
            </Link>{" "}
            <span aria-hidden>/</span> {project.name}
          </p>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-[20px] bg-sky text-heading-sm font-bold">
                {project.name.charAt(0).toUpperCase()}
              </span>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={project.status === "published" ? "sky" : "neutral"}>
                    {project.status === "published" ? "Published" : project.status === "draft" ? "Draft" : "Archived"}
                  </Badge>
                  <Badge tone="lavender">{access.isOwner ? "Owner" : "Approver"}</Badge>
                </div>
                <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">{project.name}</h1>
              </div>
            </div>
            <Link href={`/projects/${project.slug}`} className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2" })}>
              View public page
            </Link>
          </div>
        </Container>
      </section>

      <section className="pb-20">
        <Container className="flex flex-wrap items-start gap-8">
          <nav aria-label="On this page" className="flex max-w-full flex-[1_1_220px] flex-col gap-1 rounded-card bg-paper p-6 lg:sticky lg:top-6">
            <Eyebrow className="mb-2">On this page</Eyebrow>
            {menu.map((item) => (
              <a key={item.href} href={item.href} className="flex items-center justify-between rounded-control px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-fog">
                {item.label}
                {"count" in item && item.count ? <Badge tone="ink" className="px-2 py-0.5">{item.count}</Badge> : null}
              </a>
            ))}
          </nav>

          <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6">
            {access.isOwner && (
              <>
                <section id="details" className="flex scroll-mt-6 flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
                  <div className="flex flex-col gap-1.5">
                    <Eyebrow>Project details</Eyebrow>
                    <h2 className="text-heading-sm">How your project appears</h2>
                  </div>
                  <ProjectSettings project={project} />
                </section>

                <BandCard
                  id="repos"
                  tone="sky"
                  label="Repositories"
                  description="Contributions are accepted only from repositories verified through the GitHub API."
                >
                  <Repositories projectId={project.id} repositories={project.project_repositories} githubLogin={viewer.github?.login ?? null} />
                </BandCard>

                <BandCard
                  id="policy"
                  tone="lavender"
                  label="Reward policy"
                  description="Publish explicit terms before contributors start. Published versions are frozen and anchored onchain by hash."
                >
                  <PolicyEditor projectId={project.id} policies={policies} onchainAsset={onchain?.asset.toLowerCase() ?? project.onchain_asset} />
                </BandCard>

                <BandCard
                  id="onchain"
                  tone="plum"
                  label={project.onchain_project_id ? `Onchain · project #${project.onchain_project_id}` : "Onchain"}
                  description="Registration, funding, bounties and approvers in the ContriboRewards contract."
                  aside={
                    snapshot && published?.policy_hash ? (
                      <Badge tone={policyMatches ? "lavender" : "cream"} className="py-2">
                        {policyMatches ? "Policy hash matches the published policy" : "Policy hash differs from the published policy"}
                      </Badge>
                    ) : undefined
                  }
                >
                  {!contriboRewards ? (
                    <ContractUnavailable />
                  ) : chainError ? (
                    <p className="text-base text-danger">Could not read the contract from the Monad RPC. Try again shortly.</p>
                  ) : (
                    <OnchainPanel
                      projectId={project.id}
                      onchainProjectId={project.onchain_project_id}
                      verifiedWallet={viewer.wallet}
                      publishedPolicy={published ? { hash: published.policy_hash, rewardAsset: published.reward_asset } : null}
                      onchain={snapshot}
                      asset={asset}
                      bounties={bounties}
                      approvers={approvers}
                    />
                  )}
                </BandCard>
              </>
            )}

            <section id="review" className="flex scroll-mt-6 flex-col gap-5 rounded-card bg-paper p-6 sm:p-9">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Review contributions</Eyebrow>
                <p className="text-base text-deep-teal">
                  Verified pull requests are evidence only. Decide a reward, then approve it onchain from an owner or approver
                  wallet.
                </p>
              </div>
              {!contriboRewards && <ContractUnavailable />}
              <Review
                rows={reviewRows}
                asset={asset}
                openBounties={bounties.filter((b) => b.status === BountyStatusOnchain.Open)}
                onchainReady={!!contriboRewards && !!snapshot}
              />
            </section>
          </div>
        </Container>
      </section>
    </>
  );
}
