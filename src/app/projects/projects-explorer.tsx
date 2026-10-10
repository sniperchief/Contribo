"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { RewardModel } from "@/types/database";

export type ExplorerProject = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  publishedAt: string | null;
  owner: string | null;
  repoCount: number;
  repoNames: string[];
  model: RewardModel | null;
  asset: "MON" | "ERC20" | null;
  openBounties: number | null;
  poolAvailable: number | null;
  poolLabel: string;
  contributors: number;
};

const MODELS: Array<{ value: RewardModel; label: string }> = [
  { value: "bounty", label: "Bounty" },
  { value: "funding_share", label: "Contributor pool" },
  { value: "hybrid", label: "Hybrid" },
];

/** Product color by reward model: hybrid = sky, bounty = terracotta, pool = lavender. */
const modelStyle: Record<RewardModel, { tile: string; tone: BadgeTone; label: string }> = {
  hybrid: { tile: "bg-sky text-deep-teal", tone: "sky", label: "Hybrid" },
  bounty: { tile: "bg-terracotta text-ink", tone: "terracotta", label: "Bounty" },
  funding_share: { tile: "bg-lavender text-plum", tone: "lavender", label: "Pool" },
};

const PAGE_SIZE = 12;

/** Pill toggle for the horizontal filter bar. */
function FilterChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-badge border-2 px-4 text-sm font-medium transition-colors",
        active ? "border-ink bg-ink text-paper" : "border-mist bg-paper text-deep-teal hover:border-lavender",
      )}
    >
      {active && (
        <svg aria-hidden viewBox="0 0 20 20" className="size-4">
          <path fill="currentColor" d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4z" />
        </svg>
      )}
      {label}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <Eyebrow className="mr-1 text-deep-teal">{label}</Eyebrow>
      {children}
    </div>
  );
}

export function ProjectsExplorer({ projects }: { projects: ExplorerProject[] }) {
  // `/projects?bounties=1` (e.g. from the landing page) starts with the open-bounties filter on.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"bounties" | "pool" | "newest">("bounties");
  const [models, setModels] = useState<Set<RewardModel>>(new Set(["bounty", "funding_share", "hybrid"]));
  const [assets, setAssets] = useState({ MON: true, ERC20: true });
  const [onlyBounties, setOnlyBounties] = useState(searchParams.get("bounties") === "1");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (q && ![p.name, p.tagline ?? "", ...p.repoNames].some((text) => text.toLowerCase().includes(q))) return false;
      if (p.model && !models.has(p.model)) return false;
      if (p.asset && !assets[p.asset]) return false;
      if (onlyBounties && !p.openBounties) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "bounties") return (b.openBounties ?? -1) - (a.openBounties ?? -1);
      if (sort === "pool") return (b.poolAvailable ?? -1) - (a.poolAvailable ?? -1);
      return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
    });
  }, [projects, query, sort, models, assets, onlyBounties]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const reset = () => setPage(0);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Search and filters" className="flex flex-col gap-5 rounded-card bg-paper p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-mist bg-fog px-3.5 focus-within:border-plum">
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
            <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="text-[15px] font-medium">
              <option value="bounties">Most open bounties</option>
              <option value="pool">Largest pool</option>
              <option value="newest">Newest</option>
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-mist pt-5">
          <FilterGroup label="Reward model">
            {MODELS.map((model) => (
              <FilterChip
                key={model.value}
                label={model.label}
                active={models.has(model.value)}
                onToggle={() => {
                  const next = new Set(models);
                  if (next.has(model.value)) next.delete(model.value);
                  else next.add(model.value);
                  setModels(next);
                  reset();
                }}
              />
            ))}
          </FilterGroup>
          <FilterGroup label="Reward asset">
            <FilterChip label="MON" active={assets.MON} onToggle={() => { setAssets({ ...assets, MON: !assets.MON }); reset(); }} />
            <FilterChip label="ERC-20 tokens" active={assets.ERC20} onToggle={() => { setAssets({ ...assets, ERC20: !assets.ERC20 }); reset(); }} />
          </FilterGroup>
          <FilterGroup label="Availability">
            <FilterChip label="Has open bounties" active={onlyBounties} onToggle={() => { setOnlyBounties(!onlyBounties); reset(); }} />
          </FilterGroup>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-deep-teal">
          <span className="font-bold text-ink">
            {filtered.length} {filtered.length === 1 ? "project" : "projects"}
          </span>{" "}
          match your filters
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge tone="sky" className="px-4 py-2">Hybrid</Badge>
          <Badge tone="terracotta" className="px-4 py-2">Bounty</Badge>
          <Badge tone="lavender" className="px-4 py-2">Pool</Badge>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-card bg-paper p-9 text-base text-deep-teal">
          {projects.length === 0 ? "No projects have been published yet." : "No projects match these filters."}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {visible.map((p) => {
            const style = p.model ? modelStyle[p.model] : null;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="group flex min-h-[340px] flex-col gap-5 rounded-card bg-paper p-7 text-ink transition-transform duration-300 ease-spring hover:text-ink motion-safe:hover:-translate-y-1 sm:p-9"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className={cn("grid size-16 shrink-0 place-items-center rounded-[20px] text-heading-sm font-bold", style?.tile ?? "bg-mist text-deep-teal")}>
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-heading-sm font-bold">{p.name}</p>
                      <p className="mt-1.5 truncate text-sm text-deep-teal">
                        {p.owner ? `${p.owner} · ` : ""}
                        {p.repoCount} verified {p.repoCount === 1 ? "repo" : "repos"}
                      </p>
                    </div>
                  </div>
                  {style ? <Badge tone={style.tone} className="px-4 py-2">{style.label}</Badge> : <Badge className="px-4 py-2">No policy yet</Badge>}
                </div>
                <p className="flex-1 text-body-lg text-deep-teal">{p.tagline ?? "No description yet."}</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Open bounties", value: p.openBounties ?? "—", tint: "bg-cream" },
                    { label: "Pool available", value: p.poolLabel, tint: "bg-lavender/40" },
                    { label: "Contributors", value: p.contributors, tint: "bg-fog" },
                  ].map((stat) => (
                    <div key={stat.label} className={cn("min-w-0 rounded-badge px-4 py-3.5", stat.tint)}>
                      <p className="text-caption text-deep-teal">{stat.label}</p>
                      <p className="mt-1 truncate text-body-lg font-bold">{stat.value}</p>
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
            );
          })}
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
