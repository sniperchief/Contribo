import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import type { NotificationRow } from "@/lib/notifications";
import { getViewer } from "@/lib/server/viewer";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

/** Most recent notifications shown; older ones stay stored. */
const LIMIT = 100;

export default function NotificationsPage() {
  return (
    <>
      <section className="pt-14 pb-8">
        <Container className="flex flex-col gap-3.5">
          <Eyebrow>Notifications</Eyebrow>
          <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">What changed</h1>
          <p className="max-w-2xl text-body-lg text-deep-teal">
            Updates on your contributions and rewards, and pull requests waiting for your review.
          </p>
        </Container>
      </section>
      <Suspense fallback={<Container className="pb-20 text-base text-deep-teal">Loading notifications…</Container>}>
        <NotificationsContent />
      </Suspense>
    </>
  );
}

async function NotificationsContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="pb-20">
        <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-9">
          <h2 className="text-heading-sm">Sign in to see your notifications</h2>
          <Link href="/login?next=/notifications" className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </div>
      </Container>
    );
  }

  // Row Level Security returns only the viewer's own notifications.
  const { data, error } = await viewer.supabase
    .from("notifications")
    .select("id, type, project_id, contribution_id, message, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  return (
    <section className="pb-20">
      <Container>
        <div className="flex flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
          {error ? (
            <p className="text-base text-danger">Could not load notifications. Try again shortly.</p>
          ) : (
            <NotificationList notifications={(data ?? []) as NotificationRow[]} />
          )}
        </div>
      </Container>
    </section>
  );
}
