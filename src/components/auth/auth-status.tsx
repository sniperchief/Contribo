import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/server";
import { AccountMenu } from "./account-menu";

/** Header account area. Reads the session, so render it inside `<Suspense>`. */
export async function AuthStatus() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <div className="flex items-center gap-6">
        <Link href="/login" className="hidden py-2.5 text-base font-medium text-ink sm:inline">
          Login
        </Link>
        <Link href="/login" className={buttonStyles({ size: "md" })}>
          Get started
        </Link>
      </div>
    );
  }

  return (
    <AccountMenu
      githubLogin={profile.githubLogin}
      displayName={profile.display_name ?? profile.username ?? "Account"}
      avatarUrl={profile.avatar_url}
      walletLinked={profile.walletLinked}
    />
  );
}

export function AuthStatusFallback() {
  return <span className="h-11 w-40 animate-pulse rounded-full bg-mist" aria-hidden />;
}
