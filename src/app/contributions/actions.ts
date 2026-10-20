"use server";

import type { Hex } from "viem";
import { fail, HASH_RE, isUniqueViolation, ok, type ActionResult } from "@/lib/action-result";
import { contriboRewards } from "@/lib/contracts/config";
import { checkPullRequestEvidence, parsePullRequestUrl, selectPolicyInForce } from "@/lib/github/verification";
import { activeChain } from "@/lib/monad/chains";
import { canReviewContributions, planContributionSync, reconcileContribution } from "@/lib/rules";
import { createAdminClient } from "@/lib/server/admin";
import { readContribution, txEmittedContributionEvent, verifyWalletSignature } from "@/lib/server/chain";
import { createGitHubClient } from "@/lib/server/github";
import { runAction } from "@/lib/server/run-action";
import { getProjectAccess, requireViewer } from "@/lib/server/viewer";
import { checkWalletLinkMessage } from "@/lib/wallet/link-message";

function requireAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  return admin;
}

/**
 * Submits a merged pull request as a contribution. Evidence is fetched from
 * GitHub server-side: the PR must target one of the project's verified
 * repositories, be authored by the caller's own linked GitHub account, be
 * merged, and have been merged while a reward policy was published.
 * Verification is evidence only; it does not authorize a reward.
 */
export async function submitPullRequest(projectId: string, prUrl: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!viewer.github) return fail("Link your GitHub account by signing in with GitHub.");

    const parsed = parsePullRequestUrl(prUrl);
    if (!parsed) return fail("Enter a GitHub pull request URL, e.g. https://github.com/owner/repo/pull/12.");

    const [{ data: project }, { data: repos }, { data: policies }] = await Promise.all([
      viewer.supabase.from("projects").select("id, status").eq("id", projectId).maybeSingle(),
      viewer.supabase
        .from("project_repositories")
        .select("id, github_owner, github_name, github_repo_id, verified_at")
        .eq("project_id", projectId),
      viewer.supabase
        .from("reward_policies")
        .select("id, published_at, retired_at")
        .eq("project_id", projectId)
        .in("status", ["published", "retired"]),
    ]);
    if (!project || project.status !== "published") return fail("This project is not accepting contributions.");

    const repo = repos?.find(
      (r) =>
        r.verified_at &&
        r.github_repo_id &&
        r.github_owner.toLowerCase() === parsed.owner.toLowerCase() &&
        r.github_name.toLowerCase() === parsed.name.toLowerCase(),
    );
    const github = createGitHubClient();
    if (!repo?.github_repo_id) {
      const verified = (repos ?? []).filter((r) => r.verified_at && r.github_repo_id);
      const names = verified.map((r) => `${r.github_owner}/${r.github_name}`).join(", ");
      // A common mistake: opening (and merging) the pull request inside the contributor's own fork.
      const target = await github.getRepo(parsed.owner, parsed.name).catch(() => null);
      const upstream = target?.fork && target.parent && verified.find((r) => r.github_repo_id === target.parent!.id);
      if (upstream) {
        return fail(
          `This pull request was opened in your fork (${parsed.owner}/${parsed.name}), not in the project's repository. ` +
            `Open a pull request from your fork into ${upstream.github_owner}/${upstream.github_name}, wait for the project to merge it, then submit that link.`,
        );
      }
      return fail(
        names
          ? `This pull request isn't in one of this project's repositories (${names}).`
          : "This project has no verified repository yet.",
      );
    }

    const pull = await github.getPull(parsed.owner, parsed.name, parsed.number);
    if (!pull) return fail("Pull request not found on GitHub.");

    const evidence = checkPullRequestEvidence({
      pull,
      expectedRepoId: repo.github_repo_id,
      contributorGithubUserId: viewer.github.userId,
    });
    if (!evidence.ok) return fail(evidence.reason);

    const policy = selectPolicyInForce(policies ?? [], pull.merged_at!);
    if (!policy) {
      return fail("This pull request was merged before the project published a reward policy, so it is not eligible.");
    }

    const now = new Date().toISOString();
    const { error } = await requireAdmin().from("contributions").insert({
      project_id: projectId,
      repository_id: repo.id,
      contributor_id: viewer.userId,
      github_user_id: viewer.github.userId,
      github_login: pull.user!.login,
      github_repo_id: repo.github_repo_id,
      pr_number: pull.number,
      pr_url: pull.html_url,
      pr_title: pull.title.slice(0, 300),
      status: "verified",
      reward_policy_id: policy.id,
      merged_at: pull.merged_at,
      verified_at: now,
    });
    if (isUniqueViolation(error)) return fail("This pull request has already been submitted.");
    if (error) return fail("Could not record the contribution.");
    return ok();
  });
}

/** Links a wallet after verifying a signed, user-bound, time-limited message. */
export async function linkWallet(message: string, signature: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) return fail("Invalid signature.");

    const check = checkWalletLinkMessage(message, {
      userId: viewer.userId,
      chainId: activeChain.id,
      now: Date.now(),
    });
    if (!check.ok) return fail(check.reason);

    const valid = await verifyWalletSignature(check.payload.address, message, signature as Hex);
    if (!valid) return fail("The signature does not match the wallet.");

    const { error } = await requireAdmin()
      .from("profiles")
      .update({ wallet_address: check.payload.address.toLowerCase(), wallet_verified_at: new Date().toISOString() })
      .eq("id", viewer.userId);
    if (isUniqueViolation(error)) return fail("This wallet is already linked to another Contribo account.");
    if (error) return fail("Could not link the wallet.");
    return ok();
  });
}

export async function unlinkWallet(): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { error } = await requireAdmin()
      .from("profiles")
      .update({ wallet_address: null, wallet_verified_at: null })
      .eq("id", viewer.userId);
    return error ? fail("Could not unlink the wallet.") : ok();
  });
}

/**
 * Reconciles a contribution with the contract after an approval or claim. The
 * database is updated only from chain state; a client-supplied transaction hash
 * is stored only if that transaction emitted the matching event.
 */
export async function syncContribution(
  contributionId: string,
  txHash?: string,
): Promise<ActionResult<{ approved: boolean; claimed: boolean }>> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!contriboRewards) return fail("The rewards contract is not configured.");
    if (txHash && !HASH_RE.test(txHash)) return fail("Invalid transaction hash.");

    const admin = requireAdmin();
    const { data: c } = await admin
      .from("contributions")
      .select("*, projects!inner(id, owner_id, onchain_project_id)")
      .eq("id", contributionId)
      .maybeSingle();
    if (!c) return fail("Contribution not found.");

    const isContributor = c.contributor_id === viewer.userId;
    if (!isContributor && !canReviewContributions(await getProjectAccess(viewer, c.projects)).ok) {
      return fail("Contribution not found.");
    }
    if (!c.projects.onchain_project_id || !c.onchain_ref) return fail("This contribution has no onchain reward.");

    const projectId = BigInt(c.projects.onchain_project_id);
    const ref = c.onchain_ref as Hex;
    const onchain = await readContribution(projectId, ref);
    const result = reconcileContribution({
      stored: { contributorWallet: c.contributor_wallet, rewardAmount: c.reward_amount },
      onchain: { contributor: onchain.contributor, amount: onchain.amount, status: onchain.status },
    });
    if (!result.ok) {
      console.error("Onchain approval mismatch", { contributionId, onchain });
      return fail(result.reason);
    }

    // Receipts are checked only for hashes that could still be recorded.
    const txEmitted = {
      approval: !!txHash && result.approved && !c.approval_tx_hash &&
        (await txEmittedContributionEvent(txHash as Hex, "ContributionApproved", projectId, ref)),
      claim: !!txHash && result.claimed && !c.claim_tx_hash &&
        (await txEmittedContributionEvent(txHash as Hex, "RewardClaimed", projectId, ref)),
    };
    const update = planContributionSync({
      stored: {
        approvedOnchainAt: c.approved_onchain_at,
        claimedAt: c.claimed_at,
        approvalTxHash: c.approval_tx_hash,
        claimTxHash: c.claim_tx_hash,
      },
      reconciled: result,
      txHash: txHash ?? null,
      txEmitted,
      now: new Date().toISOString(),
    });

    if (Object.keys(update).length > 0) {
      // Conditional on the stored values we read, so concurrent syncs cannot record a stage twice.
      let query = admin.from("contributions").update(update).eq("id", c.id);
      if (update.approved_onchain_at) query = query.is("approved_onchain_at", null);
      if (update.claimed_at) query = query.is("claimed_at", null);
      const { error } = await query;
      if (error) return fail("Could not save the onchain status.");
    }
    return ok({ approved: result.approved, claimed: result.claimed });
  });
}
