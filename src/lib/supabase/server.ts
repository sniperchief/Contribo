import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Create one per request. Returns `null` when Supabase is not configured.
 */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) return null;

  // Session reads validate token expiry with Date.now(), so they must never run
  // during prerendering (required with Cache Components / Partial Prefetching).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The signed-in user's profile with their linked GitHub login, or `null` when
 * signed out or unconfigured. `githubLogin` comes from the OAuth-linked identity.
 */
export async function getCurrentProfile() {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const [{ data: profile }, { data: github }, onboarding, unread] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url, wallet_address, wallet_verified_at").eq("id", userId).maybeSingle(),
    supabase.from("github_identities").select("github_login, avatar_url").eq("user_id", userId).maybeSingle(),
    // Separate query: if the onboarding migration is not applied yet, treat everyone as onboarded.
    supabase.from("profiles").select("onboarded_at").eq("id", userId).maybeSingle(),
    // Row Level Security counts only the user's own notifications.
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  if (!profile) return null;

  return {
    ...profile,
    githubLogin: github?.github_login ?? null,
    walletLinked: !!(profile.wallet_address && profile.wallet_verified_at),
    onboarded: onboarding.error ? true : !!onboarding.data?.onboarded_at,
    // Zero if the notifications migration is not applied yet.
    unreadNotifications: unread.error ? 0 : (unread.count ?? 0),
    avatar_url: profile.avatar_url ?? github?.avatar_url ?? null,
  };
}
