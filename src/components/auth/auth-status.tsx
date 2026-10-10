import Image from "next/image";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/supabase/server";

/** Header account area. Reads the session, so render it inside `<Suspense>`. */
export async function AuthStatus() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <Link href="/login" className={buttonStyles({ size: "sm" })}>
        Sign in
      </Link>
    );
  }

  const name = profile.display_name ?? profile.username ?? "Account";

  return (
    <div className="flex items-center gap-2">
      {profile.avatar_url ? (
        <Image
          src={profile.avatar_url}
          alt=""
          width={32}
          height={32}
          unoptimized
          className="size-8 rounded-full border border-line"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-32 truncate text-sm font-medium lg:inline">{name}</span>
      <form action="/auth/sign-out" method="post">
        <button type="submit" className={buttonStyles({ variant: "ghost", size: "sm" })}>
          Sign out
        </button>
      </form>
    </div>
  );
}

export function AuthStatusFallback() {
  return <span className="h-8 w-20 animate-pulse rounded-md bg-surface-sunken" aria-hidden />;
}
