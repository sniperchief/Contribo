"use server";

import { isAddress } from "viem";
import { publishPolicy, verifyRepository } from "@/app/founder/actions";
import { fail, isUniqueViolation, ok, type ActionResult } from "@/lib/action-result";
import { contriboRewards } from "@/lib/contracts/config";
import { parseRepoInput } from "@/lib/github/verification";
import { sameHash } from "@/lib/policy";
import { nameFromRepo, readSetupPlan, slugFrom, validateSetupPlan } from "@/lib/project-setup";
import { readAssetInfo, readOnchainProject, readProjectBounties, type AssetInfo } from "@/lib/server/chain";
import { isFundedOnchain, loadOwnedProject, requireAdmin } from "@/lib/server/founder";
import { createGitHubClient } from "@/lib/server/github";
import { runAction } from "@/lib/server/run-action";
import { requireViewer, type Viewer } from "@/lib/server/viewer";
import type { Json } from "@/types/database";
import type { RepoMatch, SetupRepo } from "./types";

/** A project that is still being set up: owned by the viewer and not live yet. */
async function loadSetupProject(viewer: Viewer, projectId: string) {
  const project = await loadOwnedProject(viewer, projectId);
  if (!project || project.status === "published") return null;
  return project;
}

async function readSetupRepo(viewer: Viewer, projectId: string): Promise<SetupRepo | null> {
  const { data } = await viewer.supabase
    .from("project_repositories")
    .select("id, github_owner, github_name, verified_at, verification_method, verification_token")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data
    ? {
        id: data.id,
        fullName: `${data.github_owner}/${data.github_name}`,
        verified: !!data.verified_at,
        method: data.verification_method === "owner" || data.verification_method === "file" ? data.verification_method : null,
        verificationToken: data.verification_token,
      }
    : null;
}

// -----------------------------------------------------------------------------
// Step 1: repository
// -----------------------------------------------------------------------------

/** The viewer's own public repositories, for the search-as-you-type field. */
export async function searchMyRepositories(): Promise<ActionResult<RepoMatch[]>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!viewer.github) return fail("Your GitHub identity is not linked. Sign out and sign in with GitHub again.");
    const repos = await createGitHubClient().listUserRepos(viewer.github.login);
    return ok(
      repos
        .filter((repo) => !repo.private)
        .map((repo) => ({ fullName: repo.full_name, description: repo.description ?? null })),
    );
  });
}

/**
 * Connects the repository a setup starts from. Creates the project on first use
 * (name, tagline and slug come from the repository), then tries to verify
 * ownership right away.
 */
export async function connectSetupRepository(
  projectId: string | null,
  input: string,
): Promise<ActionResult<{ projectId: string; repo: SetupRepo; name: string; tagline: string | null; verifyError: string | null }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!viewer.github) return fail("Your GitHub identity is not linked. Sign out and sign in with GitHub again.");
    const parsed = parseRepoInput(input);
    if (!parsed) return fail("Paste a github.com repository link, or pick one of your repositories.");

    const ghRepo = await createGitHubClient().getRepo(parsed.owner, parsed.name);
    if (!ghRepo) return fail("That repository was not found on GitHub. Private repositories are not supported.");
    if (ghRepo.private) return fail("Private repositories are not supported yet.");
    const [owner, name] = ghRepo.full_name.split("/");

    let id = projectId;
    let projectName: string;
    let tagline: string | null;
    if (id) {
      const project = await loadSetupProject(viewer, id);
      if (!project) return fail("Project not found.");
      // Setup uses a single repository; replace the previous choice.
      const { error } = await viewer.supabase.from("project_repositories").delete().eq("project_id", id);
      if (error) return fail("Could not replace the repository.");
      const { data } = await viewer.supabase.from("projects").select("name, tagline").eq("id", id).single();
      projectName = data?.name ?? nameFromRepo(ghRepo.name);
      tagline = data?.tagline ?? null;
    } else {
      projectName = nameFromRepo(ghRepo.name);
      tagline = ghRepo.description?.trim().slice(0, 160) || null;
      for (const suffix of [undefined, ...Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 6))]) {
        const { data, error } = await viewer.supabase
          .from("projects")
          .insert({ name: projectName, slug: slugFrom(ghRepo.name, suffix), tagline })
          .select("id")
          .single();
        if (data) {
          id = data.id;
          break;
        }
        if (!isUniqueViolation(error)) return fail("Could not start the project.");
      }
      if (!id) return fail("Could not start the project. Try again.");
    }

    const { data: row, error } = await viewer.supabase
      .from("project_repositories")
      .insert({ project_id: id, github_owner: owner, github_name: name })
      .select("id")
      .single();
    if (error || !row) return fail("Could not connect the repository.");

    const verification = await verifyRepository(row.id);
    const repo = await readSetupRepo(viewer, id);
    if (!repo) return fail("Could not connect the repository.");
    return ok({ projectId: id, repo, name: projectName, tagline, verifyError: verification.ok ? null : verification.error });
  });
}

/** Re-checks ownership (e.g. after committing the verification file). */
export async function checkSetupRepository(projectId: string): Promise<ActionResult<{ repo: SetupRepo; verifyError: string | null }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!(await loadSetupProject(viewer, projectId))) return fail("Project not found.");
    const current = await readSetupRepo(viewer, projectId);
    if (!current) return fail("Connect a repository first.");
    const verification = current.verified ? null : await verifyRepository(current.id);
    const repo = (await readSetupRepo(viewer, projectId)) ?? current;
    return ok({ repo, verifyError: verification && !verification.ok ? verification.error : null });
  });
}

export async function saveSetupDetails(projectId: string, input: { name: string; tagline: string }): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!(await loadSetupProject(viewer, projectId))) return fail("Project not found.");
    const name = input.name.trim().slice(0, 80);
    if (name.length < 2) return fail("Enter a project name (at least 2 characters).");
    const { error } = await viewer.supabase
      .from("projects")
      .update({ name, tagline: input.tagline.trim().slice(0, 160) || null })
      .eq("id", projectId);
    if (error) return fail("Could not save the project details.");
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Step 2: rewards and funding
// -----------------------------------------------------------------------------

/** Symbol and decimals of MON or an ERC-20 token, for showing and converting amounts. */
export async function getAssetInfo(asset: string): Promise<ActionResult<AssetInfo>> {
  return runAction(async () => {
    if (asset !== "MON" && !isAddress(asset)) return fail("Enter a valid token address.");
    try {
      return ok(await readAssetInfo(asset === "MON" ? null : asset));
    } catch {
      return fail("That address is not an ERC-20 token on Monad.");
    }
  });
}

/**
 * Saves the reward type, funding plan and terms. Before onchain registration the
 * terms are a draft policy; after it, only the funding amounts can change.
 */
export async function saveSetupRewards(
  projectId: string,
  planInput: unknown,
  copy: { summary: string; terms: string },
): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const project = await loadSetupProject(viewer, projectId);
    if (!project) return fail("Project not found.");
    const check = validateSetupPlan(planInput);
    if (!check.ok) return fail(check.error);
    const plan = check.plan;
    const terms = copy.terms.trim().slice(0, 20000);
    const summary = copy.summary.trim().slice(0, 500) || null;
    if (terms.length < 20) return fail("Reward terms are too short.");

    if (project.onchain_project_id) {
      const { data } = await viewer.supabase.from("projects").select("setup_plan").eq("id", projectId).single();
      const previous = readSetupPlan(data?.setup_plan);
      if (previous && (previous.type !== plan.type || previous.asset !== plan.asset || previous.poolPercent !== plan.poolPercent)) {
        return fail("The reward type, token and pool share are fixed once the project is registered onchain.");
      }
    } else {
      const fields = {
        title: plan.type === "bounty" ? "Bounty rewards" : "Contributor pool",
        summary,
        terms,
        reward_model: plan.type,
        contributor_pool_bps: plan.type === "funding_share" ? plan.poolPercent! * 100 : null,
        reward_asset: plan.asset,
        eligibility: {},
      };
      const { data: draft } = await viewer.supabase
        .from("reward_policies")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "draft")
        .maybeSingle();
      if (draft) {
        const { error } = await viewer.supabase.from("reward_policies").update(fields).eq("id", draft.id);
        if (error) return fail("Could not save the reward terms.");
      } else {
        const { data: latest } = await viewer.supabase
          .from("reward_policies")
          .select("version")
          .eq("project_id", projectId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        const { error } = await viewer.supabase
          .from("reward_policies")
          .insert({ project_id: projectId, version: (latest?.version ?? 0) + 1, ...fields });
        if (error) return fail("Could not save the reward terms.");
      }
    }

    const { error } = await viewer.supabase
      .from("projects")
      .update({ setup_plan: plan as unknown as Json })
      .eq("id", projectId);
    if (error) return fail("Could not save your setup. Has the latest database migration been applied?");
    return ok();
  });
}

// -----------------------------------------------------------------------------
// Step 3: launch
// -----------------------------------------------------------------------------

/** Publishes the draft terms (if any) and returns the hash to register onchain. */
export async function publishSetupTerms(projectId: string): Promise<ActionResult<{ policyHash: string }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!(await loadSetupProject(viewer, projectId))) return fail("Project not found.");
    const { data: policies } = await viewer.supabase
      .from("reward_policies")
      .select("id, status, policy_hash")
      .eq("project_id", projectId)
      .in("status", ["draft", "published"]);
    const draft = policies?.find((p) => p.status === "draft");
    if (draft) return publishPolicy(draft.id);
    const published = policies?.find((p) => p.status === "published");
    if (published?.policy_hash) return ok({ policyHash: published.policy_hash });
    return fail("Save your reward terms first.");
  });
}

export type LaunchProgress = { onchainProjectId: string | null; available: string; bountiesCreated: number };

/** Onchain progress of a launch, so an interrupted launch resumes without repeating transactions. */
export async function getLaunchProgress(projectId: string): Promise<ActionResult<LaunchProgress>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const project = await loadSetupProject(viewer, projectId);
    if (!project) return fail("Project not found.");
    if (!contriboRewards || !project.onchain_project_id) {
      return ok({ onchainProjectId: project.onchain_project_id, available: "0", bountiesCreated: 0 });
    }
    const id = BigInt(project.onchain_project_id);
    const [onchain, bounties] = await Promise.all([readOnchainProject(id), readProjectBounties(id)]);
    return ok({
      onchainProjectId: project.onchain_project_id,
      available: (onchain?.balances.available ?? 0n).toString(),
      bountiesCreated: bounties.length,
    });
  });
}

/** Final step: confirms onchain that the project is registered with its terms and funded, then lists it on Explore. */
export async function goLive(projectId: string): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const project = await loadSetupProject(viewer, projectId);
    if (!project) return fail("Project not found.");
    if (!project.onchain_project_id) return fail("Register the project onchain first.");

    const admin = requireAdmin();
    const [{ data: row }, { data: policy }, { count: verifiedRepos }] = await Promise.all([
      admin.from("projects").select("slug, setup_plan").eq("id", projectId).single(),
      admin.from("reward_policies").select("policy_hash").eq("project_id", projectId).eq("status", "published").maybeSingle(),
      admin.from("project_repositories").select("id", { count: "exact", head: true }).eq("project_id", projectId).not("verified_at", "is", null),
    ]);
    if (!row) return fail("Project not found.");
    if (!verifiedRepos) return fail("Verify your repository first.");

    const id = BigInt(project.onchain_project_id);
    const onchain = await readOnchainProject(id);
    if (!onchain || !sameHash(policy?.policy_hash, onchain.policyHash)) return fail("The onchain terms do not match the published terms.");
    const plan = readSetupPlan(row.setup_plan);
    if (plan?.type === "bounty") {
      const created = (await readProjectBounties(id)).length;
      if (created < plan.bounties.length) return fail("Create all your bounties before going live.");
    }
    if (!(await isFundedOnchain(project.onchain_project_id))) return fail("Fund the project before going live.");

    const { error } = await admin.from("projects").update({ status: "published", setup_plan: null }).eq("id", projectId);
    if (error) return fail("Could not publish the project.");
    return ok({ slug: row.slug });
  });
}
