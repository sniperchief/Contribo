"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { VERIFICATION_FILE_PATH, verificationFileContent } from "@/lib/github/verification";
import { checkSetupRepository, connectSetupRepository, saveSetupDetails, searchMyRepositories } from "./actions";
import { SetupCard, SetupHeading } from "./setup-card";
import type { RepoMatch, SetupState } from "./types";

const LINK_RE = /github\.com\/|^[\w.-]+\/[\w.-]+$/i;

/** Step 1: one field that takes a pasted repo link or searches the founder's own repos. */
export function StepRepository({
  state,
  onChange,
  onNext,
}: {
  state: SetupState;
  onChange: (patch: Partial<SetupState>) => void;
  onNext: () => void;
}) {
  const [changing, setChanging] = useState(!state.repo);
  const [error, setError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [name, setName] = useState(state.name);
  const [tagline, setTagline] = useState(state.tagline);
  const [pending, startTransition] = useTransition();

  function connect(input: string) {
    setError(null);
    startTransition(async () => {
      const result = await connectSetupRepository(state.projectId, input);
      if (!result.ok) return setError(result.error);
      const { projectId, repo, name: repoName, tagline: repoTagline } = result.data;
      setVerifyError(result.data.verifyError);
      setChanging(false);
      // Prefill from the repo on first connect; keep what the founder already typed afterwards.
      const nextName = name || repoName;
      const nextTagline = tagline || repoTagline || "";
      setName(nextName);
      setTagline(nextTagline);
      onChange({ projectId, repo, name: nextName, tagline: nextTagline });
    });
  }

  function recheck() {
    if (!state.projectId) return;
    setError(null);
    startTransition(async () => {
      const result = await checkSetupRepository(state.projectId!);
      if (!result.ok) return setError(result.error);
      setVerifyError(result.data.verifyError);
      onChange({ repo: result.data.repo });
    });
  }

  function next() {
    if (!state.projectId) return;
    setError(null);
    startTransition(async () => {
      const result = await saveSetupDetails(state.projectId!, { name, tagline });
      if (!result.ok) return setError(result.error);
      onChange({ name: name.trim(), tagline: tagline.trim() });
      onNext();
    });
  }

  const repo = state.repo;

  return (
    <SetupCard>
      <SetupHeading
        title="Which repository is this project for?"
        description="Contributors' pull requests to this repository are what get rewarded. You can add more repositories later."
      />

      {changing || !repo ? (
        <div className="flex flex-col gap-3">
          <RepoField disabled={pending} onPick={connect} />
          {pending && <p className="text-sm text-deep-teal">Checking the repository…</p>}
          {repo && (
            <button type="button" onClick={() => setChanging(false)} className="self-start text-sm font-medium text-deep-teal hover:text-ink">
              Keep {repo.fullName}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-badge border-2 border-mist p-5">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`https://github.com/${repo.fullName}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-[1_1_200px] truncate text-body-lg font-bold text-ink"
            >
              {repo.fullName}
            </a>
            {repo.verified ? <Badge tone="sky">✓ Verified</Badge> : <Badge tone="terracotta">Needs verification</Badge>}
            <Button size="sm" variant="ghost" className="px-2 text-sm" disabled={pending} onClick={() => setChanging(true)}>
              Change
            </Button>
          </div>
          {repo.verified ? (
            <p className="text-sm text-deep-teal">
              {repo.method === "owner" ? "Verified automatically: it belongs to your GitHub account." : "Verified with the verification file."}
            </p>
          ) : (
            <div className="flex flex-col gap-3 text-sm text-deep-teal">
              <p>
                This repository isn&apos;t under your own GitHub account{state.githubLogin ? ` (@${state.githubLogin})` : ""}. To prove
                you can manage it, add this file to its default branch, then check again:
              </p>
              <div className="flex flex-col gap-1 rounded-control bg-fog px-4 py-3">
                <span className="font-mono text-ink">{VERIFICATION_FILE_PATH}</span>
                <span className="font-mono break-all text-ink">{verificationFileContent(repo.verificationToken)}</span>
              </div>
              {verifyError && <p className="text-graphite">{verifyError}</p>}
              <Button size="sm" variant="secondary" tone="sky" className="self-start" disabled={pending} onClick={recheck}>
                {pending ? "Checking…" : "Check again"}
              </Button>
            </div>
          )}
        </div>
      )}

      {repo && !changing && (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Project name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </Field>
          <Field label="Tagline" hint="One line about the project.">
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} placeholder="What it does, in a sentence" />
          </Field>
        </div>
      )}

      <FormMessage error={error} />

      <div className="flex justify-end border-t border-mist pt-6">
        <Button size="lg" disabled={pending || !repo?.verified || changing || name.trim().length < 2} onClick={next}>
          Continue
        </Button>
      </div>
    </SetupCard>
  );
}

/** Paste a link, or type to see up to five matching repositories from the founder's account. */
function RepoField({ disabled, onPick }: { disabled: boolean; onPick: (input: string) => void }) {
  const [value, setValue] = useState("");
  const [repos, setRepos] = useState<RepoMatch[] | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const loading = useRef(false);
  const listId = useId();

  function loadRepos() {
    if (repos || loading.current) return;
    loading.current = true;
    // If GitHub can't be reached, pasting a link still works.
    void searchMyRepositories().then((result) => setRepos(result.ok ? result.data : []));
  }

  const query = value.trim().toLowerCase();
  const isLink = LINK_RE.test(value.trim());
  const matches =
    query && !isLink && repos
      ? repos.filter((r) => r.fullName.split("/")[1].toLowerCase().includes(query)).slice(0, 5)
      : [];
  const showList = open && matches.length > 0;

  function submit() {
    if (showList) return onPick(matches[Math.min(active, matches.length - 1)].fullName);
    if (value.trim()) onPick(value.trim());
  }

  return (
    <div className="relative">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-control border-2 border-mist bg-fog px-4 focus-within:border-ink">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--deep-teal)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Repository</span>
          <input
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            value={value}
            disabled={disabled}
            onFocus={() => {
              loadRepos();
              setOpen(true);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setValue(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && showList) {
                e.preventDefault();
                setActive((i) => (i + 1) % matches.length);
              } else if (e.key === "ArrowUp" && showList) {
                e.preventDefault();
                setActive((i) => (i - 1 + matches.length) % matches.length);
              } else if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Paste a repo link or type a repo name"
            className="w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-subtle"
          />
        </label>
        {isLink && (
          <Button size="lg" disabled={disabled} onClick={submit}>
            Use this repo
          </Button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-badge border-2 border-mist bg-paper">
          {matches.map((repo, index) => (
            <li key={repo.fullName} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPick(repo.fullName)}
                className={cn("flex w-full flex-col gap-0.5 px-4 py-3 text-left", index === active && "bg-fog")}
              >
                <span className="text-base font-bold text-ink">{repo.fullName}</span>
                {repo.description && <span className="truncate text-sm text-deep-teal">{repo.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-caption text-deep-teal">Public repositories only. Start typing to search your own repositories.</p>
    </div>
  );
}
