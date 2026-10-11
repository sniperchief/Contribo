"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type ExplorerProject = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  publishedAt: string | null;
  owner: string | null;
  repoCount: number;
  repoNames: string[];
  openBounties: number | null;
  poolAvailable: number | null;
  poolLabel: string;
  contributors: number;
};

const PAGE_SIZE = 12;

export function ProjectsExplorer({ projects }: { projects: ExplorerProject[] }) {
  // `/projects?bounties=1` (e.g. from the landing page) starts with the open-bounties filter on.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"bounties" | "pool" | "newest" | "contributors" | "name">("bounties");
  // Landing-page link: show only projects with open bounties.
  const onlyBounties = searchParams.get("bounties") === "1";
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (q && ![p.name, p.tagline ?? "", ...p.repoNames].some((text) => text.toLowerCase().includes(q))) return false;
      if (onlyBounties && !p.openBounties) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "bounties") return (b.openBounties ?? -1) - (a.openBounties ?? -1);
      if (sort === "pool") return (b.poolAvailable ?? -1) - (a.poolAvailable ?? -1);
      if (sort === "contributors") return b.contributors - a.contributors;
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });
  }, [projects, query, sort, onlyBounties]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const reset = () => setPage(0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Search and sort" className="rounded-card border-2 border-mist bg-paper p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-mist bg-fog px-3.5 focus-within:border-ink">
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--deep-teal)" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only">Search projects</span>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                reset();
              }}
              placeholder="Search projects or repos"
              className="w-full min-w-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-subtle"
            />
          </label>
          <label className="sm:w-60">
            <span className="sr-only">Sort</span>
            <Select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); reset(); }} className="text-[15px] font-medium">
              <option value="bounties">Most open bounties</option>
              <option value="pool">Largest pool</option>
              <option value="newest">Newest</option>
              <option value="contributors">Most contributors</option>
              <option value="name">Name (A–Z)</option>
            </Select>
          </label>
        </div>

      </section>

      <p className="text-base text-deep-teal">
        <span className="font-bold text-ink">
          {filtered.length} {filtered.length === 1 ? "project" : "projects"}
        </span>
        {onlyBounties ? " with open bounties" : query ? " match your search" : ""}
      </p>

      {visible.length === 0 ? (
        <p className="rounded-card bg-paper p-9 text-base text-deep-teal">
          {projects.length === 0 ? "No projects have been published yet." : "No projects match these filters."}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className="group flex min-h-[360px] flex-col gap-6 rounded-card border-2 border-mist bg-paper p-7 text-ink transition-[transform,border-color] duration-300 ease-spring hover:border-sky hover:text-ink motion-safe:hover:-translate-y-1 sm:min-h-[420px] sm:p-10"
            >
              <ProjectStatusBadge status="published" className="self-start" />
              <div className="min-w-0">
                <p className="truncate text-[28px] leading-[1.1] font-bold tracking-[-0.02em]">{p.name}</p>
                <p className="mt-2 truncate text-base text-deep-teal">
                  {p.owner ? `${p.owner} · ` : ""}
                  {p.repoCount} verified {p.repoCount === 1 ? "repo" : "repos"}
                </p>
              </div>
              <p className="flex-1 text-body-lg text-deep-teal">{p.tagline ?? "No description yet."}</p>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Open bounties", value: p.openBounties ?? "—", tint: "bg-terracotta/15" },
                  { label: "Pool available", value: p.poolLabel, tint: "bg-sky/25" },
                  { label: "Contributors", value: p.contributors, tint: "bg-sky/25" },
                ].map((stat) => (
                  <div key={stat.label} className={cn("min-w-0 rounded-badge px-3 py-4 sm:px-5 sm:py-5", stat.tint)}>
                    <p className="truncate text-caption text-deep-teal">{stat.label}</p>
                    <p className="mt-1 truncate text-body-lg font-bold sm:text-heading-sm">{stat.value}</p>
                  </div>
                ))}
              </div>
              <span className="text-base font-medium">
                View project{" "}
                <span aria-hidden className="inline-block transition-transform duration-300 ease-spring group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-3 flex flex-wrap justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => (
            <Button
              key={i}
              size="sm"
              variant={i === current ? "primary" : "secondary"}
              aria-current={i === current ? "page" : undefined}
              className="w-11 px-0"
              onClick={() => setPage(i)}
            >
              {i + 1}
            </Button>
          ))}
          {current < pages - 1 && (
            <Button size="sm" variant="secondary" onClick={() => setPage(current + 1)}>
              Next →
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
