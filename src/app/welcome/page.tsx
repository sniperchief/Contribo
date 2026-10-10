import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { homeFor, isPrimaryRole } from "@/lib/profile";
import { getViewer } from "@/lib/server/viewer";
import { safeNextPath } from "@/lib/url";
import { WelcomeFlow } from "./welcome-flow";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <Container size="md" className="py-14 sm:py-20">
      <Suspense fallback={<p className="text-base text-deep-teal">Loading…</p>}>
        <Welcome searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Welcome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const rawNext = typeof params.next === "string" ? params.next : null;
  const next = rawNext ? safeNextPath(rawNext, "") || null : null;

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const { data: profile } = await viewer.supabase
    .from("profiles")
    .select("primary_role, onboarded_at")
    .eq("id", viewer.userId)
    .maybeSingle();
  const role = isPrimaryRole(profile?.primary_role) ? profile.primary_role : null;

  // Onboarding is shown once; returning users go straight to where they belong.
  if (profile?.onboarded_at) redirect(next ?? homeFor(role));

  return <WelcomeFlow userId={viewer.userId} initialRole={role} linkedWallet={viewer.wallet} next={next} />;
}
