import { Suspense } from "react";
import { AuthStatus, AuthStatusFallback } from "@/components/auth/auth-status";
import { getCurrentProfile } from "@/lib/supabase/server";
import { HeaderForPath, HeaderShell } from "./header-shell";

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
  const props = {
    account: <AuthStatus profile={profile} />,
    session: { signedIn: !!profile, onboarded: !!profile?.onboarded },
  };
  return (
    <Suspense fallback={<HeaderShell {...props} pathname={null} />}>
      <HeaderForPath {...props} />
    </Suspense>
  );
}
