import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { AccountMenu } from "./account-menu";

type CurrentProfile = {
  githubLogin: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  walletLinked: boolean;
};

/** Header account area for a loaded session: the account menu, or sign-in links when signed out. */
export function AuthStatus({ profile }: { profile: CurrentProfile | null }) {
  if (!profile) return <SignedOutActions className="flex" />;

  return (
    <AccountMenu
      githubLogin={profile.githubLogin}
      displayName={profile.display_name ?? profile.username ?? "Account"}
      avatarUrl={profile.avatar_url}
      walletLinked={profile.walletLinked}
    />
  );
}

/** Login and Get started links. */
export function SignedOutActions({ className, stacked = false }: { className?: string; stacked?: boolean }) {
  if (stacked) {
    return (
      <div className={cn("flex flex-col gap-3", className)}>
        <Link href="/login" className={buttonStyles({ size: "lg", className: "w-full" })}>
          Get started
        </Link>
        <Link href="/login" className={buttonStyles({ variant: "secondary", tone: "plum", size: "lg", className: "w-full" })}>
          Login
        </Link>
      </div>
    );
  }
  return (
    <div className={cn("items-center gap-6", className)}>
      <Link href="/login" className="py-2.5 text-base font-medium text-ink">
        Login
      </Link>
      <Link href="/login" className={buttonStyles({ size: "sm", className: "rounded-full px-6 font-bold" })}>
        Get started
      </Link>
    </div>
  );
}

export function AuthStatusFallback() {
  return <span className="h-11 w-40 animate-pulse rounded-full bg-paper/70" aria-hidden />;
}
