import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { VerifiedBadge } from "@/components/auth/verified-badge";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { BandCard } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { formatDate, shortAddress } from "@/lib/format";
import { isPrimaryRole, isSkillId, readSocialLinks, SKILLS, SOCIAL_FIELDS } from "@/lib/profile";
import { createGitHubClient, type GitHubUser } from "@/lib/server/github";
import { getViewer } from "@/lib/server/viewer";
import { WalletLink } from "@/components/wallet/wallet-link";
import { ProfileDetailsForm, RoleSwitch, SkillsPicker } from "./profile-forms";

export const metadata: Metadata = { title: "Your profile" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<Container className="py-14 text-base text-deep-teal">Loading your profile…</Container>}>
      <ProfileContent />
    </Suspense>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-badge bg-fog px-5 py-4">
      <dt className="text-caption font-medium text-deep-teal">{label}</dt>
      <dd className="truncate text-base font-bold">{value}</dd>
    </div>
  );
}

async function ProfileContent() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Container className="py-14">
        <div className="flex flex-col items-start gap-4 rounded-card bg-paper p-9">
          <h1 className="text-heading-sm">Sign in to see your profile</h1>
          <Link href="/login?next=/profile" className={buttonStyles()}>
            Sign in with GitHub
          </Link>
        </div>
      </Container>
    );
  }

  const [{ data: profile, error: profileError }, { data: identity }] = await Promise.all([
    viewer.supabase.from("profiles").select("*").eq("id", viewer.userId).maybeSingle(),
    viewer.supabase.from("github_identities").select("github_login, avatar_url, linked_at").eq("user_id", viewer.userId).maybeSingle(),
  ]);

  let github: GitHubUser | null = null;
  if (viewer.github) {
    try {
      github = await createGitHubClient().getUser(viewer.github.login);
    } catch {
      github = null;
    }
  }

  const avatar = github?.avatar_url ?? profile?.avatar_url ?? identity?.avatar_url ?? null;
  const name = profile?.display_name ?? github?.name ?? viewer.github?.login ?? "Your profile";
  const socials = readSocialLinks(profile?.social_links);
  const skills = (profile?.skills ?? []).filter(isSkillId);
  const migrationMissing = !!profileError || (profile !== null && profile.skills === undefined);

  return (
    <>
      <section className="pt-14 pb-8">
        <Container className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            {avatar ? (
              <Image src={avatar} alt="" width={88} height={88} unoptimized className="size-[88px] rounded-full bg-lavender" />
            ) : (
              <span className="grid size-[88px] place-items-center rounded-full bg-lavender text-heading font-bold">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="flex flex-col gap-2">
              <Eyebrow>Your profile</Eyebrow>
              <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">{name}</h1>
              {viewer.github && (
                <p className="flex items-center gap-1.5 text-body-lg font-bold">
                  @{viewer.github.login}
                  <VerifiedBadge className="size-5" />
                  <span className="text-sm font-medium text-deep-teal">Verified via GitHub</span>
                </p>
              )}
            </div>
          </div>
          {viewer.github && (
            <a
              href={github?.html_url ?? `https://github.com/${viewer.github.login}`}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: "secondary", tone: "sky", size: "lg" })}
            >
              View on GitHub
            </a>
          )}
        </Container>
      </section>

      <section className="pb-20">
        <Container className="flex flex-col gap-6">
          {migrationMissing && (
            <p className="rounded-badge bg-cream px-5 py-4 text-sm text-graphite">
              Profile details and skills need the latest database migration
              (<code className="font-mono">20261012000000_profile_socials_and_skills.sql</code>).
            </p>
          )}

          <BandCard tone="sky" label="GitHub" description="Details from your linked GitHub account. Pull requests are verified against it.">
            {viewer.github ? (
              <div className="flex flex-col gap-5">
                {github?.bio && <p className="text-base text-deep-teal">{github.bio}</p>}
                <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Stat label="Username" value={`@${viewer.github.login}`} />
                  <Stat label="GitHub ID" value={viewer.github.userId} />
                  <Stat label="Public repos" value={github?.public_repos ?? "—"} />
                  <Stat label="Followers" value={github?.followers ?? "—"} />
                  <Stat label="Following" value={github?.following ?? "—"} />
                  <Stat label="Location" value={github?.location ?? "—"} />
                  <Stat label="Company" value={github?.company ?? "—"} />
                  <Stat label="On GitHub since" value={github ? formatDate(github.created_at) : "—"} />
                </dl>
                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-deep-teal">
                  <span>Linked to Contribo {formatDate(identity?.linked_at)}</span>
                  {viewer.wallet ? (
                    <span>
                      Payout wallet <strong className="font-mono text-ink">{shortAddress(viewer.wallet)}</strong>
                    </span>
                  ) : (
                    <Link href="#wallet" className="font-medium text-ink underline underline-offset-2">
                      Link a payout wallet
                    </Link>
                  )}
                </div>
                {!github && <p className="text-sm text-deep-teal">Live GitHub details are unavailable right now.</p>}
              </div>
            ) : (
              <p className="text-base text-warning">No GitHub identity found. Sign out and sign in with GitHub again.</p>
            )}
          </BandCard>

          <div className="grid gap-6 md:grid-cols-2">
            <section id="wallet" className="flex scroll-mt-6 flex-col gap-4 rounded-card bg-paper p-6 sm:p-9">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Payout wallet</Eyebrow>
                <h2 className="text-heading-sm">{viewer.wallet ? "Your linked wallet" : "Link a wallet"}</h2>
                <p className="text-base text-deep-teal">
                  Contributors receive approved rewards here; founders use it to own projects onchain.
                </p>
              </div>
              <WalletLink userId={viewer.userId} linkedWallet={viewer.wallet} />
            </section>
            <section id="role" className="flex scroll-mt-6 flex-col gap-4 rounded-card bg-paper p-6 sm:p-9">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Primary role</Eyebrow>
                <h2 className="text-heading-sm">Where you start</h2>
                <p className="text-base text-deep-teal">
                  Contributors land on Contributions, founders on Manage. You can always use both.
                </p>
              </div>
              <RoleSwitch role={isPrimaryRole(profile?.primary_role) ? profile.primary_role : null} />
            </section>
          </div>

          <section className="flex flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
            <div className="flex flex-col gap-1.5">
              <Eyebrow>Profile details</Eyebrow>
              <h2 className="text-heading-sm">How other builders can find you</h2>
            </div>
            {Object.keys(socials).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {SOCIAL_FIELDS.filter((f) => socials[f.key]).map((field) => {
                  const value = socials[field.key]!;
                  const url = field.url(value);
                  const label = `${field.label}: ${value}`;
                  return url ? (
                    <a key={field.key} href={url} target="_blank" rel="noreferrer">
                      <Badge className="px-4 py-2">{label}</Badge>
                    </a>
                  ) : (
                    <Badge key={field.key} className="px-4 py-2">{label}</Badge>
                  );
                })}
              </div>
            )}
            <ProfileDetailsForm
              displayName={profile?.display_name ?? null}
              bio={profile?.bio ?? null}
              websiteUrl={profile?.website_url ?? null}
              socialLinks={socials}
            />
          </section>

          <BandCard id="skills" tone="lavender" label="Skills" description={`Select the tech stacks you're good at (${SKILLS.length} options).`}>
            <SkillsPicker selected={skills} />
          </BandCard>
        </Container>
      </section>
    </>
  );
}
