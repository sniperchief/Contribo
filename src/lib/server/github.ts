import "server-only";
import {
  isValidRepoName,
  isValidRepoOwner,
  type GitHubPull,
  type GitHubRepo,
} from "@/lib/github/verification";
import { serverEnv } from "./env";

/**
 * Minimal GitHub REST client for the few read-only endpoints Contribo needs.
 * It is not a proxy: every method validates its inputs and calls one fixed
 * endpoint. https://docs.github.com/en/rest
 */

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

/** Subset of GET /users/{username}. */
export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
};

export type DetectedPull = {
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  mergedAt: string | null;
};

type Options = { token?: string; fetch?: typeof fetch };

export function createGitHubClient({ token = serverEnv.githubToken, fetch: fetchImpl = fetch }: Options = {}) {
  async function request<T>(path: string): Promise<T | null> {
    const response = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "contribo",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const limited = response.status === 403 || response.status === 429;
      throw new GitHubApiError(
        limited ? "GitHub rate limit reached. Try again shortly." : `GitHub API error (${response.status}).`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  function assertRepo(owner: string, name: string) {
    if (!isValidRepoOwner(owner) || !isValidRepoName(name)) throw new GitHubApiError("Invalid repository.", 400);
  }

  return {
    async getRepo(owner: string, name: string) {
      assertRepo(owner, name);
      return request<GitHubRepo>(`/repos/${owner}/${name}`);
    },

    async getFileContent(owner: string, name: string, path: string, ref: string): Promise<string | null> {
      assertRepo(owner, name);
      const file = await request<{ type: string; encoding: string; content: string }>(
        `/repos/${owner}/${name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
      );
      if (!file || file.type !== "file" || file.encoding !== "base64") return null;
      return Buffer.from(file.content, "base64").toString("utf8");
    },

    async getPull(owner: string, name: string, number: number) {
      assertRepo(owner, name);
      if (!Number.isInteger(number) || number <= 0) throw new GitHubApiError("Invalid pull request.", 400);
      return request<GitHubPull>(`/repos/${owner}/${name}/pulls/${number}`);
    },

    /** Public repositories owned by a user, most recently pushed first (GET /users/{username}/repos). */
    async listUserRepos(login: string): Promise<GitHubRepo[]> {
      if (!isValidRepoOwner(login)) throw new GitHubApiError("Invalid GitHub username.", 400);
      return (await request<GitHubRepo[]>(`/users/${login}/repos?type=owner&sort=pushed&per_page=100`)) ?? [];
    },

    /** Public profile of a GitHub user (GET /users/{username}). */
    async getUser(login: string) {
      if (!isValidRepoOwner(login)) throw new GitHubApiError("Invalid GitHub username.", 400);
      return request<GitHubUser>(`/users/${login}`);
    },

    /** Merged pull requests by `author` in any of `repos` (owner/name), newest first. */
    async searchMergedPulls(author: string, repos: string[]): Promise<DetectedPull[]> {
      const valid = repos.filter((full) => {
        const [owner, name] = full.split("/");
        return owner && name && isValidRepoOwner(owner) && isValidRepoName(name);
      });
      if (!isValidRepoOwner(author) || valid.length === 0) return [];

      const query = [`is:pr`, `is:merged`, `author:${author}`, ...valid.map((r) => `repo:${r}`)].join(" ");
      const result = await request<{
        items: Array<{
          number: number;
          title: string;
          html_url: string;
          repository_url: string;
          pull_request?: { merged_at: string | null };
        }>;
      }>(`/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=30`);

      return (result?.items ?? []).map((item) => ({
        repoFullName: item.repository_url.replace("https://api.github.com/repos/", ""),
        number: item.number,
        title: item.title,
        url: item.html_url,
        mergedAt: item.pull_request?.merged_at ?? null,
      }));
    },
  };
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
