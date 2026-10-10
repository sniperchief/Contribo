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
        <ul className="divide-y divide-line rounded-md border border-line">
          {repositories.map((repo) => (
            <li key={repo.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={`https://github.com/${repo.github_owner}/${repo.github_name}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-ink hover:underline"
                >
                  {repo.github_owner}/{repo.github_name}
                </a>
                <div className="flex items-center gap-2">
                  {repo.verified_at ? (
                    <Badge tone="success">
                      Verified ({repo.verification_method === "owner" ? "you own it" : "verification file"})
                    </Badge>
                  ) : (
                    <>
                      <Badge tone="warning">Unverified</Badge>
                      <Button size="sm" disabled={row.pending} onClick={() => row.run(() => verifyRepository(repo.id), "Repository verified.")}>
                        Verify
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" disabled={row.pending} onClick={() => row.run(() => removeRepository(repo.id))}>
                    Remove
                  </Button>
                </div>
              </div>
              {!repo.verified_at && (
                <div className="rounded-md bg-surface-sunken p-3 text-xs text-muted">
                  <p>
                    Repositories under your own GitHub account{githubLogin ? ` (@${githubLogin})` : ""} verify automatically.
                    For organization repositories, commit this file to the default branch, then click Verify:
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
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const value = String(new FormData(form).get("repo") ?? "");
          add.run(() => addRepository(projectId, value), undefined, () => form.reset());
        }}
      >
        <Input name="repo" required placeholder="owner/repository or https://github.com/owner/repository" aria-label="Repository" />
        <Button type="submit" variant="secondary" disabled={add.pending}>
          Connect repository
        </Button>
      </form>
      <FormMessage {...add.message} />
    </div>
  );
}
