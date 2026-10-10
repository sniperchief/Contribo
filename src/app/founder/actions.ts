"use server";

import { getAddress, isAddress, type Hex } from "viem";
import { fail, HASH_RE, isUniqueViolation, ok, type ActionResult } from "@/lib/action-result";
import { contriboRewards } from "@/lib/contracts/config";
import { contributionRef } from "@/lib/contributions";
import {
  checkRepositoryOwnership,
  parseRepoInput,
  VERIFICATION_FILE_PATH,
} from "@/lib/github/verification";
import { computePolicyHash } from "@/lib/policy";
import { PROJECT_SLUG_RE, projectMetadataUri } from "@/lib/projects";
import { canManageProject, canReviewContributions, checkAcceptance, planApproval } from "@/lib/rules";
import { createAdminClient } from "@/lib/server/admin";
import {
  readBounty,
  readContribution,
  readIsApprover,
  readOnchainProject,
  readProjectRegistration,
} from "@/lib/server/chain";
import { createGitHubClient } from "@/lib/server/github";
import { runAction } from "@/lib/server/run-action";
import { getProjectAccess, requireViewer, type Viewer } from "@/lib/server/viewer";
import type { Json, ProjectStatus, RewardModel } from "@/types/database";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function requireAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  return admin;
}

async function loadOwnedProject(viewer: Viewer, projectId: string) {
  const { data: project } = await viewer.supabase
    .from("projects")
    .select("id, owner_id, status, onchain_project_id, onchain_asset")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  const decision = canManageProject(await getProjectAccess(viewer, project));
  return decision.ok ? project : null;
}

function text(value: FormDataEntryValue | null, max: number): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
}

// -----------------------------------------------------------------------------
// Projects
// -----------------------------------------------------------------------------

export async function createProject(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const name = text(formData.get("name"), 80);
    const slug = text(formData.get("slug"), 64)?.toLowerCase() ?? "";
    if (!name || name.length < 2) return fail("Enter a project name (at least 2 characters).");
    if (!PROJECT_SLUG_RE.test(slug)) {
      return fail("Slugs use 3–64 lowercase letters, numbers and hyphens, and cannot start or end with a hyphen.");
    }

    const { data, error } = await viewer.supabase
      .from("projects")
      .insert({ name, slug, tagline: text(formData.get("tagline"), 160) })
      .select("id")
      .single();
    if (isUniqueViolation(error)) return fail("That slug is already taken.");
    if (error || !data) return fail("Could not create the project.");
    return ok({ id: data.id });
  });
}

export async function updateProjectDetails(projectId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const name = text(formData.get("name"), 80);
    if (!name || name.length < 2) return fail("Enter a project name (at least 2 characters).");
    const website = text(formData.get("website_url"), 200);
    if (website && !/^https:\/\/\S+$/.test(website)) return fail("Website must be an https:// URL.");

    const { error, count } = await viewer.supabase
      .from("projects")
      .update(
        {
          name,
          tagline: text(formData.get("tagline"), 160),
          description: text(formData.get("description"), 4000),
          website_url: website,
        },
        { count: "exact" },
      )
      .eq("id", projectId);
    if (error || count !== 1) return fail("Could not update the project.");
    return ok();
  });
}

export async function setProjectStatus(projectId: string, status: ProjectStatus): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!["draft", "published", "archived"].includes(status)) return fail("Invalid status.");
    const { error, count } = await viewer.supabase
      .from("projects")
      .update({ status }, { count: "exact" })
      .eq("id", projectId);
    if (error || count !== 1) return fail("Could not change the project status.");
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Repositories
// -----------------------------------------------------------------------------

export async function addRepository(projectId: string, input: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const repo = parseRepoInput(input);
    if (!repo) return fail("Enter a repository as owner/name or a github.com URL.");

    const { error } = await viewer.supabase
      .from("project_repositories")
      .insert({ project_id: projectId, github_owner: repo.owner, github_name: repo.name });
    if (isUniqueViolation(error)) return fail("This repository is already connected to the project.");
    if (error) return fail("Could not add the repository.");
    return ok();
  });
}

export async function removeRepository(repositoryId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { error, count } = await viewer.supabase
      .from("project_repositories")
      .delete({ count: "exact" })
      .eq("id", repositoryId);
    if (error?.code === "23503") return fail("This repository has recorded contributions and cannot be removed.");
    if (error || count !== 1) return fail("Could not remove the repository.");
    return ok();
  });
}

/** Verifies repository control through the GitHub API (owner match or committed verification file). */
export async function verifyRepository(repositoryId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!viewer.github) return fail("Your GitHub identity is not linked. Sign out and sign in with GitHub again.");

    const { data: repo } = await viewer.supabase
      .from("project_repositories")
      .select("id, project_id, github_owner, github_name, verification_token, verified_at")
      .eq("id", repositoryId)
      .maybeSingle();
    if (!repo || !(await loadOwnedProject(viewer, repo.project_id))) return fail("Repository not found.");
    if (repo.verified_at) return ok();

    const github = createGitHubClient();
    const ghRepo = await github.getRepo(repo.github_owner, repo.github_name);
    if (!ghRepo) return fail("Repository not found on GitHub (private repositories are not supported).");

    const ownedByFounder = ghRepo.owner.type === "User" && ghRepo.owner.id === viewer.github.userId;
    const verificationFile = ownedByFounder
      ? null
      : await github.getFileContent(repo.github_owner, repo.github_name, VERIFICATION_FILE_PATH, ghRepo.default_branch);

    const check = checkRepositoryOwnership({
      repo: ghRepo,
      founderGithubUserId: viewer.github.userId,
      verificationFile,
      verificationToken: repo.verification_token,
    });
    if (!check.ok) return fail(check.reason);

    const { error } = await requireAdmin()
      .from("project_repositories")
      .update({
        verified_at: new Date().toISOString(),
        verification_method: check.method,
        github_repo_id: ghRepo.id,
        default_branch: ghRepo.default_branch,
      })
      .eq("id", repo.id);
    if (isUniqueViolation(error)) return fail("This repository is already verified by another Contribo project.");
    if (error) return fail("Could not save the verification.");
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Reward policies
// -----------------------------------------------------------------------------

const REWARD_MODELS: RewardModel[] = ["bounty", "funding_share", "hybrid"];

export async function savePolicyDraft(
  projectId: string,
  policyId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!(await loadOwnedProject(viewer, projectId))) return fail("Project not found.");

    const title = text(formData.get("title"), 120);
    const rewardModel = formData.get("reward_model") as RewardModel;
    const poolRaw = text(formData.get("contributor_pool_bps"), 6);
    const pool = poolRaw === null ? null : Number(poolRaw);
    const rewardAsset = text(formData.get("reward_asset"), 42) ?? "MON";
    const eligibilityRaw = text(formData.get("eligibility"), 4000) ?? "{}";

    if (!title || title.length < 3) return fail("Enter a policy title (at least 3 characters).");
    if (!REWARD_MODELS.includes(rewardModel)) return fail("Choose a reward model.");
    if (pool !== null && (!Number.isInteger(pool) || pool < 0 || pool > 10000)) {
      return fail("Contributor pool must be 0–10000 basis points.");
    }
    if (rewardModel !== "bounty" && pool === null) return fail("Funding-share policies need a contributor pool share.");
    if (rewardAsset !== "MON" && !isAddress(rewardAsset)) return fail("Reward asset must be MON or a token address.");

    let eligibility: Json;
    try {
      eligibility = JSON.parse(eligibilityRaw);
    } catch {
      return fail("Eligibility rules must be valid JSON.");
    }
    if (!eligibility || typeof eligibility !== "object" || Array.isArray(eligibility)) {
      return fail("Eligibility rules must be a JSON object.");
    }

    const fields = {
      title,
      summary: text(formData.get("summary"), 500),
      terms: text(formData.get("terms"), 20000) ?? "",
      reward_model: rewardModel,
      contributor_pool_bps: pool,
      reward_asset: rewardAsset,
      eligibility,
    };

    if (policyId) {
      const { error, count } = await viewer.supabase
        .from("reward_policies")
        .update(fields, { count: "exact" })
        .eq("id", policyId)
        .eq("project_id", projectId)
        .eq("status", "draft");
      if (error || count !== 1) return fail("Only draft policies can be edited.");
      return ok({ id: policyId });
    }

    const { data: latest } = await viewer.supabase
      .from("reward_policies")
      .select("version")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await viewer.supabase
      .from("reward_policies")
      .insert({ project_id: projectId, version: (latest?.version ?? 0) + 1, ...fields })
      .select("id")
      .single();
    if (error || !data) return fail("Could not save the draft.");
    return ok({ id: data.id });
  });
}

/** Publishes a draft: computes its hash and retires the previously published version. */
export async function publishPolicy(policyId: string): Promise<ActionResult<{ policyHash: string }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { data: policy } = await viewer.supabase
      .from("reward_policies")
      .select("*")
      .eq("id", policyId)
      .maybeSingle();
    if (!policy || !(await loadOwnedProject(viewer, policy.project_id))) return fail("Policy not found.");
    if (policy.status !== "draft") return fail("Only drafts can be published.");

    const policyHash = computePolicyHash({
      projectId: policy.project_id,
      version: policy.version,
      title: policy.title,
      summary: policy.summary,
      terms: policy.terms,
      rewardModel: policy.reward_model,
      contributorPoolBps: policy.contributor_pool_bps,
      rewardAsset: policy.reward_asset,
      eligibility: policy.eligibility,
    });

    const admin = requireAdmin();
    const retire = await admin
      .from("reward_policies")
      .update({ status: "retired" })
      .eq("project_id", policy.project_id)
      .eq("status", "published");
    if (retire.error) return fail("Could not retire the current policy.");

    const { error } = await admin
      .from("reward_policies")
      .update({ status: "published", policy_hash: policyHash })
      .eq("id", policy.id)
      .eq("status", "draft");
    if (error) return fail("Could not publish the policy.");
    return ok({ policyHash });
  });
}

// -----------------------------------------------------------------------------
// Onchain reconciliation
// -----------------------------------------------------------------------------

/** Links a confirmed `registerProject` transaction to the Contribo project. */
export async function confirmProjectRegistration(projectId: string, txHash: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!contriboRewards) return fail("The rewards contract is not configured.");
    if (!HASH_RE.test(txHash)) return fail("Invalid transaction hash.");
    if (!viewer.wallet) return fail("Link and verify your wallet first.");

    const project = await loadOwnedProject(viewer, projectId);
    if (!project) return fail("Project not found.");
    if (project.onchain_project_id) return fail("This project is already registered onchain.");

    const event = await readProjectRegistration(txHash as Hex);
    if (!event) return fail("No confirmed ProjectRegistered event found in that transaction.");
    if (event.metadataURI !== projectMetadataUri(projectId)) {
      return fail("That onchain project was registered for a different Contribo project.");
    }
    if (getAddress(event.owner) !== viewer.wallet) {
      return fail("That onchain project is owned by a different wallet than your verified wallet.");
    }

    const { error } = await requireAdmin()
      .from("projects")
      .update({
        onchain_project_id: event.projectId.toString(),
        onchain_asset: event.asset.toLowerCase(),
        onchain_registration_tx: txHash,
      })
      .eq("id", projectId)
      .is("onchain_project_id", null);
    if (isUniqueViolation(error)) return fail("That onchain project is already linked.");
    if (error) return fail("Could not save the registration.");
    return ok();
  });
}

/** Records an approver change after reading `isApprover` from the contract. */
export async function syncApprover(projectId: string, address: string, txHash?: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!isAddress(address)) return fail("Invalid address.");
    if (txHash && !HASH_RE.test(txHash)) return fail("Invalid transaction hash.");
    const project = await loadOwnedProject(viewer, projectId);
    if (!project?.onchain_project_id) return fail("Register the project onchain first.");

    const admin = requireAdmin();
    const account = getAddress(address);
    const approved = await readIsApprover(BigInt(project.onchain_project_id), account);
    const row = { project_id: projectId, address: account.toLowerCase() };
    const { error } = approved
      ? await admin.from("project_approvers").upsert({ ...row, tx_hash: txHash ?? null })
      : await admin.from("project_approvers").delete().match(row);
    if (error) return fail("Could not record the approver.");
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Contribution review
// -----------------------------------------------------------------------------

async function loadReviewableContribution(viewer: Viewer, contributionId: string) {
  const admin = requireAdmin();
  const { data: contribution } = await admin
    .from("contributions")
    .select("*, projects!inner(id, owner_id, onchain_project_id)")
    .eq("id", contributionId)
    .maybeSingle();
  if (!contribution) return null;
  const decision = canReviewContributions(await getProjectAccess(viewer, contribution.projects));
  return decision.ok ? { admin, contribution, project: contribution.projects } : null;
}

/**
 * Accepts a verified contribution for a specific reward (pool amount or an open
 * bounty), or revises an acceptance that is not yet approved onchain. The payout
 * wallet is always the contributor's current verified wallet.
 */
export async function acceptContribution(
  contributionId: string,
  input: { amount: string; bountyId?: string | null },
): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const loaded = await loadReviewableContribution(viewer, contributionId);
    if (!loaded) return fail("Contribution not found.");
    const { admin, contribution, project } = loaded;
    if (!/^\d{1,78}$/.test(input.amount)) return fail("Invalid amount.");
    if (input.bountyId && !/^\d{1,78}$/.test(input.bountyId)) return fail("Invalid bounty.");
    if (!contribution.github_repo_id) return fail("Missing repository evidence.");

    const { data: contributor } = contribution.contributor_id
      ? await admin
          .from("profiles")
          .select("wallet_address, wallet_verified_at")
          .eq("id", contribution.contributor_id)
          .maybeSingle()
      : { data: null };
    const wallet = contributor?.wallet_verified_at ? contributor.wallet_address : null;

    const onchainProject = project.onchain_project_id
      ? await readOnchainProject(BigInt(project.onchain_project_id))
      : null;

    let bounty: { belongsToProject: boolean; status: number; amount: bigint } | null = null;
    if (input.bountyId) {
      if (!project.onchain_project_id) return fail("Register the project onchain first.");
      const onchain = await readBounty(BigInt(input.bountyId));
      if (!onchain) return fail("Bounty not found.");
      bounty = {
        belongsToProject: onchain.projectId === BigInt(project.onchain_project_id),
        status: onchain.status,
        amount: onchain.amount,
      };
    }

    const decision = checkAcceptance({
      status: contribution.status,
      approvedOnchain: !!contribution.approved_onchain_at,
      contributorWallet: wallet,
      projectOwnerWallet: onchainProject?.owner ?? null,
      amount: BigInt(input.amount),
      bounty,
    });
    if (!decision.ok) return fail(decision.reason);

    const { error } = await admin
      .from("contributions")
      .update({
        status: "accepted",
        contributor_wallet: wallet!.toLowerCase(),
        reward_amount: input.amount,
        bounty_id: input.bountyId ?? null,
        onchain_ref: contributionRef(contribution.github_repo_id, contribution.pr_number),
      })
      .eq("id", contribution.id)
      .in("status", ["verified", "accepted"])
      .is("approved_onchain_at", null);
    if (isUniqueViolation(error)) return fail("A contribution with the same reference is already accepted.");
    if (error) return fail("Could not accept the contribution.");
    return ok();
  });
}

export async function rejectContribution(contributionId: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const loaded = await loadReviewableContribution(viewer, contributionId);
    if (!loaded) return fail("Contribution not found.");
    const { admin, contribution } = loaded;
    if (contribution.approved_onchain_at) return fail("Approved rewards cannot be rejected; they are final onchain.");
    if (!["verified", "accepted"].includes(contribution.status)) return fail("This contribution cannot be rejected.");

    const { error } = await admin
      .from("contributions")
      .update({ status: "rejected", reward_amount: null, bounty_id: null, onchain_ref: null })
      .eq("id", contribution.id);
    if (error) return fail("Could not reject the contribution.");
    return ok();
  });
}

export type SerializedApprovalPlan =
  | { kind: "pool"; projectId: string; ref: Hex; contributor: Hex; amount: string }
  | { kind: "bounty"; bountyId: string; ref: Hex; contributor: Hex; amount: string };

/** Runs the backend's pre-approval checks against current chain state and returns the exact call to sign. */
export async function prepareApproval(contributionId: string): Promise<ActionResult<SerializedApprovalPlan>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!contriboRewards) return fail("The rewards contract is not configured.");
    const loaded = await loadReviewableContribution(viewer, contributionId);
    if (!loaded) return fail("Contribution not found.");
    const { admin, contribution: c, project } = loaded;
    if (!project.onchain_project_id) return fail("Register the project onchain first.");

    const onchainProjectId = BigInt(project.onchain_project_id);
    const [onchainProject, onchainContribution, bounty, { data: published }] = await Promise.all([
      readOnchainProject(onchainProjectId),
      c.onchain_ref ? readContribution(onchainProjectId, c.onchain_ref as Hex) : null,
      c.bounty_id ? readBounty(BigInt(c.bounty_id)) : null,
      admin
        .from("reward_policies")
        .select("policy_hash, reward_asset")
        .eq("project_id", project.id)
        .eq("status", "published")
        .maybeSingle(),
    ]);
    if (!onchainProject) return fail("The project is not registered onchain.");

    const decision = planApproval({
      onchainProjectId: project.onchain_project_id,
      contribution: {
        status: c.status,
        rewardPolicyId: c.reward_policy_id,
        contributorWallet: c.contributor_wallet,
        rewardAmount: c.reward_amount,
        bountyId: c.bounty_id,
        onchainRef: c.onchain_ref,
        approvedOnchainAt: c.approved_onchain_at,
      },
      publishedPolicy: published ? { policyHash: published.policy_hash, rewardAsset: published.reward_asset } : null,
      onchain: {
        asset: onchainProject.asset,
        policyHash: onchainProject.policyHash,
        available: onchainProject.balances.available,
        contributionStatus: onchainContribution?.status ?? 0,
        bounty: bounty ? { projectId: bounty.projectId, status: bounty.status, amount: bounty.amount } : null,
      },
    });
    if (!decision.ok) return fail(decision.reason);

    const plan = decision.plan;
    return ok(
      plan.kind === "pool"
        ? { ...plan, projectId: plan.projectId.toString(), amount: plan.amount.toString() }
        : { ...plan, bountyId: plan.bountyId.toString(), amount: plan.amount.toString() },
    );
  });
}
