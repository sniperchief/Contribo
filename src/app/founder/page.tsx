import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProjectStatusBadge } from "@/components/projects/project-status-badge";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { setupStep } from "@/lib/project-setup";
import { getViewer } from "@/lib/server/viewer";

export const metadata: Metadata = { title: "My projects" };

export default function FounderPage() {
  return (
    <>
      <section className="pt-14 pb-10">
        <Container className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[680px] flex-col gap-3.5">
            <Eyebrow>Founder</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Your projects</h1>
            <p className="text-body-lg text-deep-teal">
              Pick a repository, choose and fund your rewards, and launch. Then review contributions here.
            </p>
          </div>
          <Link href="/founder/new" className={buttonStyles({ size: "lg" })}>
            + Create a project
          </Link>
        </Container>
      </section>

      <Suspense fallback={<Container className="pb-20 text-base text-deep-teal">Loading your projects…</Container>}>
        <FounderContent />
      </Suspense>
    </>
  );
}

async function FounderContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="pb-20">
        <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-9">
          <h2 className="text-heading-sm">Sign in to manage projects</h2>
          <p className="text-base text-deep-teal">Founders sign in with GitHub so repository ownership can be verified.</p>
          <Link href="/login?next=/founder" className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </div>
      </Container>
    );
  }

  const { data: projects } = await viewer.supabase
    .from("projects")
    .select("id, name, slug, tagline, status, onchain_project_id, reward_policies(status), project_repositories(verified_at)")
    .eq("owner_id", viewer.userId)
    .order("created_at", { ascending: false });
  // Unfinished guided setups (a separate read so the list still works before the setup migration is applied).
  const { data: setups } = await viewer.supabase
    .from("projects")
    .select("id")
    .eq("owner_id", viewer.userId)
    .not("setup_plan", "is", null);
  const inSetup = new Set((setups ?? []).map((p) => p.id));

  return (
    <>
      {!viewer.wallet && (
        <section className="pb-6">
          <Container>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-cream px-6 py-5 sm:px-9">
              <div className="flex flex-col gap-1">
                <Eyebrow className="text-graphite">Before you go onchain</Eyebrow>
                <p className="text-base text-graphite">
                  Link a payout wallet. It will own your projects onchain and fund bounties and contributor pools.
                </p>
              </div>
              <Link href="/profile#wallet" className={buttonStyles()}>
                Link wallet
              </Link>
            </div>
          </Container>
        </section>
      )}

      {projects && projects.length > 0 ? (
        <section className="pb-20">
          <Container className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              // Drafts that never went onchain, or that have an unfinished guided setup, continue in setup.
              const setup = project.status === "draft" && (!project.onchain_project_id || inSetup.has(project.id));
              const step = setupStep({
                hasVerifiedRepo: project.project_repositories.some((r) => r.verified_at),
                hasPlan: project.reward_policies.some((p) => p.status === "draft" || p.status === "published"),
              });
              return (
                <Link
                  key={project.id}
                  href={setup ? `/founder/new?project=${project.id}` : `/founder/${project.id}`}
                  className="group flex min-h-[220px] flex-col gap-4 rounded-card border-2 border-mist bg-paper p-8 text-ink transition-colors hover:border-sky hover:text-ink"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-subheading font-bold tracking-[-0.02em]">{project.name}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-deep-teal">{project.tagline ?? `/${project.slug}`}</p>
                    </div>
                    <ProjectStatusBadge status={project.status} draftLabel={setup ? "In setup" : "Not live"} />
                  </div>
                  <span className="mt-auto border-t border-mist pt-3.5 text-base font-medium">
                    {setup ? `Continue setup · step ${step} of 3 →` : "Manage project →"}
                  </span>
                </Link>
              );
            })}
          </Container>
        </section>
      ) : (
        <Container className="pb-20">
          <p className="rounded-card bg-paper p-9 text-base text-deep-teal">No projects yet. Use “Create a project” to set up your first one in three steps.</p>
        </Container>
      )}

    </>
  );
}
