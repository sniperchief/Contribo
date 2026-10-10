import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex max-w-2xl flex-col gap-3">
        <p className="text-sm font-medium text-accent">Discover</p>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Projects building on Monad</h1>
        <p className="text-muted">
          Every project publishes its reward terms before you contribute. Pick one, open a pull request, and submit it
          once it is merged.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading projects…</p>}>
        <ProjectList />
      </Suspense>
    </Container>
  );
}

async function ProjectList() {
  const supabase = await createClient();
  if (!supabase) {
    return <p className="text-sm text-muted">Supabase is not configured, so there are no projects to show yet.</p>;
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id, slug, name, tagline, onchain_project_id, reward_policies(status, reward_model, title), project_repositories(verified_at)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(100);

  if (!projects?.length) {
    return <p className="text-sm text-muted">No projects have been published yet.</p>;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const policy = project.reward_policies.find((p) => p.status === "published");
        const repoCount = project.project_repositories.filter((r) => r.verified_at).length;
        return (
          <li key={project.id}>
            <Link href={`/projects/${project.slug}`} className="block h-full">
              <Card className="h-full transition-colors hover:border-line-strong">
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  {project.tagline && <CardDescription>{project.tagline}</CardDescription>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {policy ? (
                      <Badge tone="accent">{policy.title}</Badge>
                    ) : (
                      <Badge>No published reward policy</Badge>
                    )}
                    <Badge>{repoCount} verified {repoCount === 1 ? "repository" : "repositories"}</Badge>
                    {project.onchain_project_id && <Badge tone="success">Onchain</Badge>}
                  </div>
                </CardHeader>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
