"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitPullRequest } from "@/app/contributions/actions";
import { StageBadge } from "@/components/contributions/stage-badge";
import { Button } from "@/components/ui/button";
import { FormMessage, Input } from "@/components/ui/field";

export type DetectedPull = { url: string; title: string; repo: string; number: number };

export function SubmitPullRequest({ projectId, detected }: { projectId: string; detected: DetectedPull[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  function submit(url: string) {
    setActive(url);
    setMessage({});
    startTransition(async () => {
      const result = await submitPullRequest(projectId, url);
      setMessage(result.ok ? { success: "Verified against GitHub and submitted for review." } : { error: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {detected.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {detected.map((pull) => (
            <li key={pull.url} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <a href={pull.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                  {pull.title}
                </a>
                <p className="font-mono text-xs text-subtle">
                  {pull.repo}#{pull.number}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StageBadge stage="detected" />
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => submit(pull.url)}>
                  {pending && active === pull.url ? "Verifying…" : "Verify & submit"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          const url = new FormData(event.currentTarget).get("url");
          if (typeof url === "string") submit(url);
        }}
      >
        <Input name="url" required placeholder="https://github.com/owner/repo/pull/123" aria-label="Pull request URL" />
        <Button type="submit" disabled={pending}>
          {pending && active !== null && !detected.some((d) => d.url === active) ? "Verifying…" : "Submit pull request"}
        </Button>
      </form>
      <FormMessage error={message.error} success={message.success} />
    </div>
  );
}
