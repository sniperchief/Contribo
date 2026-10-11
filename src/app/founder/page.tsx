import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { getViewer } from "@/lib/server/viewer";
import { CreateProjectForm } from "./create-project-form";

export const metadata: Metadata = { title: "My projects" };

const steps = [
  { label: "Verify your repos", tint: "bg-sky" },
  { label: "Publish a reward policy", tint: "bg-lavender" },
  { label: "Register onchain", tint: "bg-cream" },
  { label: "Fund and review work", tint: "bg-terracotta" },
];

const projectTints = ["bg-sky", "bg-lavender", "bg-cream"];

export default function FounderPage() {
  return (
    <>
      <section className="pt-14 pb-10">
        <Container className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[680px] flex-col gap-3.5">
            <Eyebrow>Founder</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Your projects</h1>
            <p className="text-body-lg text-deep-teal">
              Connect repositories, publish reward terms, register the project onchain, fund it, and review contributions.
            </p>
          </div>
          <Link href="#create" className={buttonStyles({ size: "lg" })}>
            + Create a project
          </Link>
        </Container>
      </section>

      <section className="pb-10">
        <Container>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.label} className="flex items-center gap-3.5 rounded-card bg-paper p-6">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold", step.tint)}>
                  {index + 1}
                </span>
                <span className="text-[15px] font-medium">{step.label}</span>
              </li>
            ))}
          </ol>
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
    .select("id, name, slug, status, onchain_project_id, reward_policies(status)")
    .eq("owner_id", viewer.userId)
    .order("created_at", { ascending: false });

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

      {projects && projects.length > 0 && (
        <section className="pb-10">
          <Container className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => {
              const hasPolicy = project.reward_policies.some((p) => p.status === "published");
              return (
                <Link key={project.id} href={`/founder/${project.id}`} className="flex flex-col gap-4 rounded-card bg-paper p-8 text-ink">
                  <div className="flex items-center gap-3.5">
                    <span className={cn("grid size-[52px] shrink-0 place-items-center rounded-badge text-xl font-bold", projectTints[index % projectTints.length])}>
                      {project.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-subheading font-bold tracking-[-0.02em]">{project.name}</p>
                      <p className="mt-0.5 truncate text-sm text-deep-teal">/{project.slug}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={project.status === "published" ? "sky" : "neutral"}>
                      {project.status === "published" ? "Published" : project.status === "draft" ? "Draft" : "Archived"}
                    </Badge>
                    <Badge tone={hasPolicy ? "lavender" : "cream"}>{hasPolicy ? "Policy published" : "No published policy"}</Badge>
                    <Badge tone={project.onchain_project_id ? "sky" : "neutral"}>
                      {project.onchain_project_id ? `Onchain #${project.onchain_project_id}` : "Not onchain"}
                    </Badge>
                  </div>
                  <span className="border-t border-mist pt-3.5 text-base font-medium">Manage project →</span>
                </Link>
              );
            })}
          </Container>
        </section>
      )}

      <section id="create" className="scroll-mt-4 pb-20">
        <Container>
          <div className="flex flex-wrap gap-x-14 gap-y-8 rounded-card bg-paper p-6 sm:p-9">
            <div className="flex flex-[1_1_300px] flex-col gap-3">
              <Eyebrow>New project</Eyebrow>
              <h2 className="text-heading-sm">Create a project</h2>
              <p className="text-base text-deep-teal">Projects start as drafts. Publish when your repositories and reward terms are ready.</p>
            </div>
            <div className="min-w-0 flex-[2_1_520px]">
              <CreateProjectForm />
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
