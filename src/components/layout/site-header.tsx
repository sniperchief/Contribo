import { Suspense } from "react";
import { AuthStatus, AuthStatusFallback } from "@/components/auth/auth-status";
import { getCurrentProfile } from "@/lib/supabase/server";
import { HeaderForPath, HeaderShell, type HeaderSession } from "./header-shell";

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderShell account={<AuthStatusFallback />} session={null} pathname={null} />}>
      <SessionHeader />
    </Suspense>
  );
}

/** Reads the session once: the account area and whether app navigation is unlocked (signed up and onboarded). */
async function SessionHeader() {
  const profile = await getCurrentProfile();
  const session: HeaderSession = {
    onboarded: !!profile?.onboarded,
    user: profile && {
      label: profile.githubLogin ? `@${profile.githubLogin}` : (profile.display_name ?? profile.username ?? "Account"),
      avatarUrl: profile.avatar_url,
      verified: !!profile.githubLogin,
      walletLinked: profile.walletLinked,
      unreadNotifications: profile.unreadNotifications,
    },
  };
  const props = { account: <AuthStatus profile={profile} />, session };
  return (
    <Suspense fallback={<HeaderShell {...props} pathname={null} />}>
      <HeaderForPath {...props} />
    </Suspense>
  );
}
