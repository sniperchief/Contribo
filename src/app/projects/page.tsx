import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { contriboRewards } from "@/lib/contracts/config";
import { formatAmount, formatDateTime } from "@/lib/format";
import { readAssetInfo, readProjectsOverview, type AssetInfo } from "@/lib/server/chain";
import { latestSnapshotTime } from "@/lib/server/transparency";
import { assetLabels, totalsByAsset, type AssetAmount } from "@/lib/transparency";
import { createClient } from "@/lib/supabase/server";
import { ProjectsExplorer, type ExplorerAmount, type ExplorerProject } from "./projects-explorer";

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
      "id, slug, name, tagline, published_at, onchain_project_id, project_repositories(github_owner, github_name, verified_at), contributions(github_user_id)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(200);

  // Every figure comes from one contract read at one block; a failed read shows no figures at all.
  let chain: Awaited<ReturnType<typeof readProjectsOverview>> | null = null;
  const assets = new Map<string, AssetInfo | null>();
  if (contriboRewards) {
    const ids = (projects ?? []).filter((p) => p.onchain_project_id).map((p) => BigInt(p.onchain_project_id!));
    try {
      chain = await readProjectsOverview(ids);
      for (const asset of new Set([...chain.projects.values()].map((o) => o.asset.toLowerCase()))) {
        // Unreadable token metadata: that token's figures show as unavailable rather than in raw units.
        assets.set(asset, await readAssetInfo(asset).catch(() => null));
      }
    } catch (error) {
      console.error("Explore: onchain read failed", error);
    }
  }
  const lastVerifiedAt =
    contriboRewards && !chain
      ? await latestSnapshotTime(
          supabase,
          (projects ?? []).filter((p) => p.onchain_project_id).map((p) => p.id),
        ).catch(() => null)
      : null;

  const rows: ExplorerProject[] = (projects ?? []).map((project) => {
    const repos = project.project_repositories.filter((r) => r.verified_at);
    const stats = chain && project.onchain_project_id ? chain.projects.get(BigInt(project.onchain_project_id)) : undefined;
    const info = stats ? assets.get(stats.asset.toLowerCase()) : null;
    const amount = (value: bigint): ExplorerAmount | null =>
      stats && info
        ? { asset: stats.asset.toLowerCase(), symbol: info.symbol, decimals: info.decimals, amount: value.toString() }
        : null;
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
      available: stats ? amount(stats.balances.available) : null,
      paid: stats ? amount(stats.balances.totalPaid) : null,
      contributors: new Set(project.contributions.map((c) => c.github_user_id)).size,
    };
  });

  const totals = (key: "available" | "paid") =>
    totalsByAsset(rows.flatMap((r) => (r[key] ? [{ ...r[key]!, amount: BigInt(r[key]!.amount) }] : [])));
  const labels = assetLabels(rows.flatMap((r) => (r.available ? [r.available] : [])));
  const describe = (list: AssetAmount[]) =>
    list.length === 0
      ? "—"
      : list.map((t) => formatAmount(t.amount, t.decimals, labels.get(t.asset) ?? t.symbol)).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      {contriboRewards && (
        <section aria-label="Onchain totals" className="flex flex-col gap-3 rounded-card bg-paper p-5 sm:p-6">
          {chain ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-badge bg-fog px-4 py-3.5">
                  <p className="text-caption font-medium text-deep-teal">Available for new rewards, across listed projects</p>
                  <p className="mt-1 text-body-lg font-bold">{describe(totals("available"))}</p>
                </div>
                <div className="rounded-badge bg-sky px-4 py-3.5">
                  <p className="text-caption font-medium text-deep-teal">Confirmed payouts, all time</p>
                  <p className="mt-1 text-body-lg font-bold">{describe(totals("paid"))}</p>
                </div>
              </div>
              <p className="text-caption text-deep-teal">
                Read from the ContriboRewards contract at block #{chain.block.number.toString()} (
                {formatDateTime(new Date(Number(chain.block.timestamp) * 1000))}). Each token is totalled separately.
                {chain.stale && " The Monad node may be behind, so these figures may not be current."}
              </p>
            </>
          ) : (
            <p role="status" className="rounded-badge bg-danger-soft px-5 py-3.5 text-sm text-danger">
              Could not refresh onchain figures from the Monad network, so pool balances are not shown.
              {lastVerifiedAt ? ` Figures were last verified ${formatDateTime(lastVerifiedAt)}.` : ""}
            </p>
          )}
        </section>
      )}
      <ProjectsExplorer projects={rows} />
    </div>
  );
}
