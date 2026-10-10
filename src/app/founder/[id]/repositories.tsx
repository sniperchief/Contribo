"use client";

import { addRepository, removeRepository, verifyRepository } from "@/app/founder/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";
import { VERIFICATION_FILE_PATH, verificationFileContent } from "@/lib/github/verification";
import type { Tables } from "@/types/database";
import { useServerAction } from "./use-action";

export function Repositories({
  projectId,
  repositories,
  githubLogin,
}: {
  projectId: string;
  repositories: Tables<"project_repositories">[];
  githubLogin: string | null;
}) {
  const add = useServerAction();
  const row = useServerAction();

  return (
    <div className="flex flex-col gap-4">
      {repositories.length > 0 && (
        <ul className="flex flex-col">
          {repositories.map((repo) => (
            <li key={repo.id} className="flex flex-col gap-3.5 border-b border-mist py-4">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`https://github.com/${repo.github_owner}/${repo.github_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-[1_1_240px] truncate text-base font-bold text-ink"
                >
                  {repo.github_owner}/{repo.github_name}
                </a>
                {repo.verified_at ? (
                  <Badge tone="sky">Verified · {repo.verification_method === "owner" ? "owner match" : "file check"}</Badge>
                ) : (
                  <>
                    <Badge tone="cream">Unverified</Badge>
                    <Button size="sm" disabled={row.pending} onClick={() => row.run(() => verifyRepository(repo.id), "Repository verified.")}>
                      Verify
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="px-2 text-sm" disabled={row.pending} onClick={() => row.run(() => removeRepository(repo.id))}>
                  Remove
                </Button>
              </div>
              {!repo.verified_at && (
                <div className="rounded-badge bg-mist px-5 py-4 text-sm text-deep-teal">
                  <p>
                    Repositories under your own GitHub account{githubLogin ? ` (@${githubLogin})` : ""} verify automatically.
                    For organization repos, add this file to the default branch with your project token, then press Verify:
                  </p>
                  <p className="mt-2 font-mono text-ink">{VERIFICATION_FILE_PATH}</p>
                  <pre className="mt-1 overflow-x-auto font-mono text-ink">{verificationFileContent(repo.verification_token)}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormMessage {...row.message} />

      <form
        className="flex flex-col gap-3 pt-1 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const value = String(new FormData(form).get("repo") ?? "");
          add.run(() => addRepository(projectId, value), undefined, () => form.reset());
        }}
      >
        <Input name="repo" required placeholder="owner/repository or https://github.com/owner/repository" aria-label="Repository" />
        <Button type="submit" variant="secondary" tone="sky" disabled={add.pending}>
          Add repository
        </Button>
      </form>
      <FormMessage {...add.message} />
    </div>
  );
}
