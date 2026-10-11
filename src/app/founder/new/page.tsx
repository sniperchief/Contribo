import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { contriboRewards } from "@/lib/contracts/config";
import { readSetupPlan } from "@/lib/project-setup";
import { getViewer } from "@/lib/server/viewer";
import { SetupWizard } from "./setup-wizard";
import type { SetupRepo, SetupState } from "./types";

export const metadata: Metadata = { title: "Create a project" };

/** Guided project setup: repository → rewards and funding → launch. `?project=<id>` resumes a setup. */
export default function NewProjectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Container size="md" className="py-10 sm:py-14">
      <Suspense fallback={<p className="text-base text-deep-teal">Loading…</p>}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Setup({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const projectId = typeof params.project === "string" && /^[0-9a-f-]{36}$/i.test(params.project) ? params.project : null;

  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(projectId ? `/founder/new?project=${projectId}` : "/founder/new")}`);

  const base: SetupState = {
    projectId: null,
    slug: null,
    name: "",
    tagline: "",
    repo: null,
    plan: null,
    copy: null,
    onchainProjectId: null,
    githubLogin: viewer.github?.login ?? null,
    verifiedWallet: viewer.wallet,
  };
  if (!projectId) return <SetupWizard initial={base} contractReady={!!contriboRewards} />;

  // RLS limits this to the viewer's own projects.
  const [{ data: project }, { data: repo }, { data: policies }] = await Promise.all([
    viewer.supabase.from("projects").select("*").eq("id", projectId).eq("owner_id", viewer.userId).maybeSingle(),
    viewer.supabase
      .from("project_repositories")
      .select("id, github_owner, github_name, verified_at, verification_method, verification_token")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    viewer.supabase
      .from("reward_policies")
      .select("status, summary, terms, version")
      .eq("project_id", projectId)
      .in("status", ["draft", "published"])
      .order("version", { ascending: false }),
  ]);
  if (!project) notFound();
  if (project.status === "published") redirect(`/founder/${project.id}`);

  const policy = policies?.[0] ?? null;
  const setupRepo: SetupRepo | null = repo && {
    id: repo.id,
    fullName: `${repo.github_owner}/${repo.github_name}`,
    verified: !!repo.verified_at,
    method: repo.verification_method === "owner" || repo.verification_method === "file" ? repo.verification_method : null,
    verificationToken: repo.verification_token,
  };

  return (
    <SetupWizard
      contractReady={!!contriboRewards}
      initial={{
        ...base,
        projectId: project.id,
        slug: project.slug,
        name: project.name,
        tagline: project.tagline ?? "",
        repo: setupRepo,
        plan: readSetupPlan(project.setup_plan),
        copy: policy ? { summary: policy.summary ?? "", terms: policy.terms } : null,
        onchainProjectId: project.onchain_project_id,
      }}
    />
  );
}
