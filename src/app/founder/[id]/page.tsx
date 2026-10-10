import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getAddress } from "viem";
import { ContractUnavailable } from "@/components/tx/contract-unavailable";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { BountyStatusOnchain, contriboRewards } from "@/lib/contracts/config";
import { contributionStage } from "@/lib/contributions";
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
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading project…</p>}>
        <ManageContent params={params} />
      </Suspense>
    </Container>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function ManageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href={`/login?next=/founder/${id}`} className={buttonStyles({ className: "self-start" })}>
        Sign in with GitHub
      </Link>
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

  const snapshot: OnchainSnapshot | null = onchain && {
    owner: onchain.owner,
    pendingOwner: onchain.pendingOwner,
    asset: onchain.asset,
    policyHash: onchain.policyHash,
    balances: Object.fromEntries(
      Object.entries(onchain.balances).map(([k, v]) => [k, v.toString()]),
    ) as OnchainSnapshot["balances"],
  };

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={project.status === "published" ? "success" : "neutral"}>{project.status}</Badge>
          {access.isOwner ? <Badge tone="accent">Owner</Badge> : <Badge tone="accent">Approver</Badge>}
        </div>
        <h1 className="text-3xl font-bold text-ink">{project.name}</h1>
        <Link href={`/projects/${project.slug}`} className="text-sm text-accent hover:underline">
          View public page →
        </Link>
      </div>

      {access.isOwner && (
        <>
          <Section title="Project details">
            <ProjectSettings project={project} />
          </Section>
          <Section title="Repositories" description="Contributions are accepted only from repositories verified through the GitHub API.">
            <Repositories
              projectId={project.id}
              repositories={project.project_repositories}
              githubLogin={viewer.github?.login ?? null}
            />
          </Section>
          <Section
            title="Reward policy"
            description="Publish explicit terms before contributors start. Published versions are frozen and anchored onchain by hash."
          >
            <PolicyEditor projectId={project.id} policies={policies} onchainAsset={onchain?.asset.toLowerCase() ?? project.onchain_asset} />
          </Section>
          <Section title="Onchain" description="Registration, funding, bounties and approvers in the ContriboRewards contract.">
            {!contriboRewards ? (
              <ContractUnavailable />
            ) : chainError ? (
              <p className="text-sm text-danger">Could not read the contract from the Monad RPC. Try again shortly.</p>
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
          </Section>
        </>
      )}

      <Section
        title="Review contributions"
        description="Verified pull requests are evidence only. Decide a reward, then approve it onchain from an owner or approver wallet."
      >
        {!contriboRewards && <div className="mb-4"><ContractUnavailable /></div>}
        <Review
          rows={reviewRows}
          asset={asset}
          openBounties={bounties.filter((b) => b.status === BountyStatusOnchain.Open)}
          onchainReady={!!contriboRewards && !!snapshot}
        />
      </Section>
    </>
  );
}
