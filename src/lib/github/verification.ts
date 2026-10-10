/**
 * Pure verification rules for GitHub evidence. All network access lives in
 * `src/lib/server/github.ts`; these functions only decide, so they are unit-tested.
 */

/** Subset of GET /repos/{owner}/{repo}. */
export type GitHubRepo = {
  id: number;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { id: number; login: string; type: string };
};

/** Subset of GET /repos/{owner}/{repo}/pulls/{number}. */
export type GitHubPull = {
  number: number;
  html_url: string;
  title: string;
  merged: boolean;
  merged_at: string | null;
  user: { id: number; login: string } | null;
  base: { repo: { id: number } };
};

export type Check<T extends object = object> = ({ ok: true } & T) | { ok: false; reason: string };

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function isValidRepoOwner(owner: string): boolean {
  return OWNER_RE.test(owner);
}

export function isValidRepoName(name: string): boolean {
  return NAME_RE.test(name) && name !== "." && name !== "..";
}

/** Accepts `owner/repo` or a github.com repository URL. */
export function parseRepoInput(input: string): { owner: string; name: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)$/i.exec(trimmed) ?? /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
  if (!match) return null;
  const [, owner, name] = match;
  return isValidRepoOwner(owner) && isValidRepoName(name) ? { owner, name } : null;
}

/** Accepts a github.com pull request URL. */
export function parsePullRequestUrl(input: string): { owner: string; name: string; number: number } | null {
  const match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d{1,9})(?:[/?#].*)?$/i.exec(
    input.trim(),
  );
  if (!match) return null;
  const [, owner, name, num] = match;
  const number = Number(num);
  return isValidRepoOwner(owner) && isValidRepoName(name) && number > 0 ? { owner, name, number } : null;
}

/** File founders commit to the default branch to prove write access to a repository. */
export const VERIFICATION_FILE_PATH = ".github/contribo-verification.txt";

export function verificationFileContent(token: string): string {
  return `contribo-verification=${token}`;
}

/**
 * A founder controls a repository when it is owned by their own linked GitHub
 * account, or when the default branch contains this project's verification
 * token (proving write access, which also covers organization repositories).
 */
export function checkRepositoryOwnership(input: {
  repo: GitHubRepo;
  founderGithubUserId: number;
  verificationFile: string | null;
  verificationToken: string;
}): Check<{ method: "owner" | "file" }> {
  const { repo, founderGithubUserId, verificationFile, verificationToken } = input;
  if (repo.private) {
    return { ok: false, reason: "Private repositories are not supported yet." };
  }
  if (repo.owner.type === "User" && repo.owner.id === founderGithubUserId) {
    return { ok: true, method: "owner" };
  }
  if (verificationFile !== null && verificationFile.trim() === verificationFileContent(verificationToken)) {
    return { ok: true, method: "file" };
  }
  return {
    ok: false,
    reason: `Ownership not proven. Commit ${VERIFICATION_FILE_PATH} containing your verification line to the default branch (${repo.default_branch}), then verify again.`,
  };
}

/**
 * Evidence that a pull request is a merged contribution by the given GitHub
 * account to the given repository. Identity is matched on numeric GitHub IDs,
 * which do not change when users or repositories are renamed.
 */
export function checkPullRequestEvidence(input: {
  pull: GitHubPull;
  expectedRepoId: number;
  contributorGithubUserId: number;
}): Check {
  const { pull, expectedRepoId, contributorGithubUserId } = input;
  if (pull.base.repo.id !== expectedRepoId) {
    return { ok: false, reason: "This pull request was not opened against the project's repository." };
  }
  if (!pull.user || pull.user.id !== contributorGithubUserId) {
    return { ok: false, reason: "This pull request was authored by a different GitHub account." };
  }
  if (!pull.merged || !pull.merged_at) {
    return { ok: false, reason: "This pull request has not been merged." };
  }
  return { ok: true };
}

export type PolicyWindow = { id: string; published_at: string | null; retired_at: string | null };

/** The reward policy that was in force when the pull request was merged, if any. */
export function selectPolicyInForce<T extends PolicyWindow>(policies: T[], mergedAt: string): T | null {
  const merged = Date.parse(mergedAt);
  return (
    policies.find((policy) => {
      if (!policy.published_at) return false;
      const published = Date.parse(policy.published_at);
      const retired = policy.retired_at ? Date.parse(policy.retired_at) : Infinity;
      return published <= merged && merged < retired;
    }) ?? null
  );
}
