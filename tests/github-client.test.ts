import { describe, expect, it, vi } from "vitest";
import { createGitHubClient, GitHubApiError } from "@/lib/server/github";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("GitHub client", () => {
  it("calls the fixed pull request endpoint with the token on the server", async () => {
    const fetch = mockFetch(200, { number: 5 });
    const client = createGitHubClient({ token: "ghp_test", fetch });
    await client.getPull("acme", "sdk", 5);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/acme/sdk/pulls/5");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
  });

  it("returns null for 404s", async () => {
    const client = createGitHubClient({ fetch: mockFetch(404, {}) });
    expect(await client.getRepo("acme", "missing")).toBeNull();
  });

  it("decodes file contents", async () => {
    const content = Buffer.from("contribo-verification=abc\n").toString("base64");
    const client = createGitHubClient({ fetch: mockFetch(200, { type: "file", encoding: "base64", content }) });
    expect(await client.getFileContent("acme", "sdk", ".github/contribo-verification.txt", "main")).toBe(
      "contribo-verification=abc\n",
    );
  });

  it("refuses arbitrary paths instead of acting as a proxy", async () => {
    const fetch = mockFetch(200, {});
    const client = createGitHubClient({ fetch });
    await expect(client.getRepo("acme", "../../user")).rejects.toBeInstanceOf(GitHubApiError);
    await expect(client.getPull("acme", "sdk", -1)).rejects.toBeInstanceOf(GitHubApiError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports rate limiting clearly", async () => {
    const client = createGitHubClient({ fetch: mockFetch(403, {}) });
    await expect(client.getRepo("acme", "sdk")).rejects.toThrow(/rate limit/);
  });

  it("builds a merged-PR search scoped to the author and repositories", async () => {
    const fetch = mockFetch(200, {
      items: [
        {
          number: 3,
          title: "Fix",
          html_url: "https://github.com/acme/sdk/pull/3",
          repository_url: "https://api.github.com/repos/acme/sdk",
          pull_request: { merged_at: "2026-01-01T00:00:00Z" },
        },
      ],
    });
    const client = createGitHubClient({ fetch });
    const result = await client.searchMergedPulls("dev", ["acme/sdk", "bad/../repo"]);

    const url = decodeURIComponent((fetch.mock.calls[0] as unknown as [string])[0]);
    expect(url).toContain("is:pr is:merged author:dev repo:acme/sdk");
    expect(url).not.toContain("bad/");
    expect(result).toEqual([
      { repoFullName: "acme/sdk", number: 3, title: "Fix", url: "https://github.com/acme/sdk/pull/3", mergedAt: "2026-01-01T00:00:00Z" },
    ]);
  });
});
