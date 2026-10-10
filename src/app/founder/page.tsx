import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { getViewer } from "@/lib/server/viewer";
import { CreateProjectForm } from "./create-project-form";

export const metadata: Metadata = { title: "Founder console" };

export default function FounderPage() {
  return (
    <Container className="flex flex-col gap-8 py-12 sm:py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Founder console</p>
        <h1 className="text-3xl font-bold text-ink">Your projects</h1>
        <p className="max-w-2xl text-muted">
          Connect repositories, publish reward terms, register the project onchain, fund it, and review contributions.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Loading your projects…</p>}>
        <FounderContent />
      </Suspense>
    </Container>
  );
}

async function FounderContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/login?next=/founder" className={buttonStyles({ className: "self-start" })}>
        Sign in with GitHub
      </Link>
    );
  }

  const { data: projects } = await viewer.supabase
    .from("projects")
    .select("id, name, slug, status, onchain_project_id, reward_policies(status)")
    .eq("owner_id", viewer.userId)
    .order("created_at", { ascending: false });

  return (
    <>
      {projects && projects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/founder/${project.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-line-strong">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription className="font-mono">/{project.slug}</CardDescription>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={project.status === "published" ? "success" : "neutral"}>{project.status}</Badge>
                      {project.reward_policies.some((p) => p.status === "published") ? (
                        <Badge tone="accent">Policy published</Badge>
                      ) : (
                        <Badge tone="warning">No published policy</Badge>
                      )}
                      {project.onchain_project_id ? (
                        <Badge tone="success">Onchain #{project.onchain_project_id}</Badge>
                      ) : (
                        <Badge>Not onchain</Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Create a project</CardTitle>
          <CardDescription>Projects start as drafts. Publish when your repositories and reward terms are ready.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateProjectForm />
        </CardContent>
      </Card>
    </>
  );
}
