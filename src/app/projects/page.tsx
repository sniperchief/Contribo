import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { contriboRewards, isNativeAsset } from "@/lib/contracts/config";
import { formatAmount } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { readProjectsOverview, type ProjectOverview } from "@/lib/server/chain";
import { createClient } from "@/lib/supabase/server";
import { ProjectsExplorer, type ExplorerProject } from "./projects-explorer";

export const metadata: Metadata = { title: "Explore projects" };

export default function ProjectsPage() {
  return (
    <>
      <section className="pt-14 pb-8">
        <Container className="flex max-w-[1280px] flex-col gap-3">
          <Eyebrow>Explore</Eyebrow>
          <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Projects rewarding contributors</h1>
          <p className="max-w-2xl text-body-lg text-deep-teal">
            Projects publish verified repos and their reward terms before you start. Pick one and start contributing.
          </p>
        </Container>
      </section>
      <section className="pb-20">
        <Container>
          <Suspense fallback={<p className="text-base text-deep-teal">Loading projects…</p>}>
            <ProjectList />
          </Suspense>
        </Container>
      </section>
    </>
  );
}

async function ProjectList() {
  const supabase = await createClient();
  if (!supabase) {
    return <p className="text-base text-deep-teal">Supabase is not configured, so there are no projects to show yet.</p>;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select(
      "id, slug, name, tagline, published_at, onchain_project_id, onchain_asset, reward_policies(status, reward_asset), project_repositories(github_owner, github_name, verified_at), contributions(github_user_id)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);

  let overview = new Map<bigint, ProjectOverview>();
  if (contriboRewards) {
    const ids = (projects ?? []).filter((p) => p.onchain_project_id).map((p) => BigInt(p.onchain_project_id!));
    try {
      overview = await readProjectsOverview(ids);
    } catch {
      // Onchain stats are optional; cards show "—" when the RPC is unavailable.
    }
  }

  const rows: ExplorerProject[] = (projects ?? []).map((project) => {
    const policy = project.reward_policies.find((p) => p.status === "published") ?? null;
    const repos = project.project_repositories.filter((r) => r.verified_at);
    const stats = project.onchain_project_id ? overview.get(BigInt(project.onchain_project_id)) : undefined;
    const native = isNativeAsset(project.onchain_asset ?? (policy?.reward_asset === "MON" ? null : policy?.reward_asset));
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      tagline: project.tagline,
      publishedAt: project.published_at,
      owner: repos[0]?.github_owner ?? null,
      repoCount: repos.length,
      repoNames: repos.map((r) => `${r.github_owner}/${r.github_name}`),
      openBounties: stats?.openBounties ?? null,
      poolAvailable: stats ? Number(stats.available) : null,
      poolLabel: stats ? (native ? formatAmount(stats.available, 18, activeChain.nativeCurrency.symbol) : "Token pool") : "—",
      contributors: new Set(project.contributions.map((c) => c.github_user_id)).size,
    };
  });

  return <ProjectsExplorer projects={rows} />;
}
