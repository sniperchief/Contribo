import { describe, expect, it } from "vitest";
import {
  checkPullRequestEvidence,
  checkRepositoryOwnership,
  parsePullRequestUrl,
  parseRepoInput,
  selectPolicyInForce,
  verificationFileContent,
  type GitHubPull,
  type GitHubRepo,
} from "@/lib/github/verification";

const FOUNDER_ID = 1001;
const CONTRIBUTOR_ID = 2002;
const REPO_ID = 555;

function repo(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    id: REPO_ID,
    name: "sdk",
    full_name: "founder/sdk",
    description: null,
    private: false,
    default_branch: "main",
    owner: { id: FOUNDER_ID, login: "founder", type: "User" },
    ...overrides,
  };
}

function pull(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 12,
    html_url: "https://github.com/founder/sdk/pull/12",
    title: "Add feature",
    merged: true,
    merged_at: "2026-05-01T12:00:00Z",
    user: { id: CONTRIBUTOR_ID, login: "dev" },
    base: { repo: { id: REPO_ID } },
    ...overrides,
  };
}

describe("repository ownership", () => {
  it("verifies a repository owned by the founder's own GitHub account", () => {
    const result = checkRepositoryOwnership({
      repo: repo(),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: null,
      verificationToken: "tok",
    });
    expect(result).toEqual({ ok: true, method: "owner" });
  });

  it("rejects someone else's user repository without a verification file", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ owner: { id: 9999, login: "victim", type: "User" } }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: null,
      verificationToken: "tok",
    });
    expect(result.ok).toBe(false);
  });

  it("does not trust a login match, only the numeric owner ID", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ owner: { id: 9999, login: "founder", type: "User" } }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: null,
      verificationToken: "tok",
    });
    expect(result.ok).toBe(false);
  });

  it("verifies an organization repository with the project's verification file", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ owner: { id: 42, login: "acme", type: "Organization" } }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: `${verificationFileContent("tok-123")}\n`,
      verificationToken: "tok-123",
    });
    expect(result).toEqual({ ok: true, method: "file" });
  });

  it("rejects a verification file with another project's token", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ owner: { id: 42, login: "acme", type: "Organization" } }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: verificationFileContent("other-project"),
      verificationToken: "tok-123",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an organization that merely shares the founder's numeric ID", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ owner: { id: FOUNDER_ID, login: "acme", type: "Organization" } }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: null,
      verificationToken: "tok",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects private repositories", () => {
    const result = checkRepositoryOwnership({
      repo: repo({ private: true }),
      founderGithubUserId: FOUNDER_ID,
      verificationFile: null,
      verificationToken: "tok",
    });
    expect(result.ok).toBe(false);
  });
});

describe("pull request evidence", () => {
  const verify = (p: GitHubPull, contributor = CONTRIBUTOR_ID) =>
    checkPullRequestEvidence({ pull: p, expectedRepoId: REPO_ID, contributorGithubUserId: contributor });

  it("accepts a merged PR by the contributor against the project repository", () => {
    expect(verify(pull())).toEqual({ ok: true });
  });

  it("rejects a PR authored by a different GitHub identity", () => {
    const result = verify(pull({ user: { id: 31337, login: "dev" } }));
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("different GitHub account") });
  });

  it("rejects claiming someone else's PR even when the claimant knows the URL", () => {
    expect(verify(pull(), 31337).ok).toBe(false);
  });

  it("rejects a PR against a fork or another repository", () => {
    expect(verify(pull({ base: { repo: { id: 777 } } })).ok).toBe(false);
  });

  it("rejects unmerged (open or closed) PRs", () => {
    expect(verify(pull({ merged: false, merged_at: null })).ok).toBe(false);
  });

  it("rejects PRs from deleted (ghost) users", () => {
    expect(verify(pull({ user: null })).ok).toBe(false);
  });
});

describe("input parsing", () => {
  it("parses repository inputs", () => {
    expect(parseRepoInput("acme/sdk")).toEqual({ owner: "acme", name: "sdk" });
    expect(parseRepoInput("https://github.com/acme/sdk.git")).toEqual({ owner: "acme", name: "sdk" });
    expect(parseRepoInput("https://evil.com/acme/sdk")).toBeNull();
    expect(parseRepoInput("acme/../secrets")).toBeNull();
    expect(parseRepoInput("acme/sdk/issues")).toBeNull();
  });

  it("parses pull request URLs", () => {
    expect(parsePullRequestUrl("https://github.com/acme/sdk/pull/42")).toEqual({ owner: "acme", name: "sdk", number: 42 });
    expect(parsePullRequestUrl("https://github.com/acme/sdk/pull/42/files")).toMatchObject({ number: 42 });
    expect(parsePullRequestUrl("https://github.com/acme/sdk/issues/42")).toBeNull();
    expect(parsePullRequestUrl("https://github.com.evil.io/acme/sdk/pull/42")).toBeNull();
    expect(parsePullRequestUrl("https://github.com/acme/sdk/pull/0")).toBeNull();
  });
});

describe("reward policy in force", () => {
  const policies = [
    { id: "v2", published_at: "2026-03-01T00:00:00Z", retired_at: null },
    { id: "v1", published_at: "2026-01-01T00:00:00Z", retired_at: "2026-03-01T00:00:00Z" },
  ];

  it("selects the policy published when the PR merged", () => {
    expect(selectPolicyInForce(policies, "2026-02-01T00:00:00Z")?.id).toBe("v1");
    expect(selectPolicyInForce(policies, "2026-04-01T00:00:00Z")?.id).toBe("v2");
  });

  it("uses the new policy at the exact handover instant", () => {
    expect(selectPolicyInForce(policies, "2026-03-01T00:00:00Z")?.id).toBe("v2");
  });

  it("returns null for PRs merged before any policy was published", () => {
    expect(selectPolicyInForce(policies, "2025-12-31T00:00:00Z")).toBeNull();
  });
});
