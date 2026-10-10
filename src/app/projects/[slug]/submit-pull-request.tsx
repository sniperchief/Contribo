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
        <ul className="overflow-hidden rounded-badge border border-mist">
          {detected.map((pull) => (
            <li key={pull.url} className="flex flex-wrap items-center justify-between gap-3 border-b border-mist px-5 py-4 last:border-b-0">
              <div className="min-w-0 flex-[1_1_280px]">
                <a href={pull.url} target="_blank" rel="noreferrer" className="block truncate text-base font-bold text-ink">
                  {pull.title}
                </a>
                <p className="mt-1 text-[13px] text-deep-teal">
                  {pull.repo}#{pull.number}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <StageBadge stage="detected" />
                <Button size="sm" variant="secondary" tone="sky" disabled={pending} onClick={() => submit(pull.url)}>
                  {pending && active === pull.url ? "Verifying…" : "Verify & submit"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-3 sm:flex-row"
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
