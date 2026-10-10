import "server-only";
import { getAddress, type Address } from "viem";
import { contriboRewards } from "@/lib/contracts/config";
import type { ProjectAccess } from "@/lib/rules";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "./admin";
import { readIsApprover } from "./chain";

export type Viewer = {
  userId: string;
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  github: { userId: number; login: string } | null;
  wallet: Address | null;
};

/** The signed-in user with their linked GitHub identity and verified wallet, or `null`. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return null;

  const [{ data: github }, { data: profile }] = await Promise.all([
    supabase.from("github_identities").select("github_user_id, github_login").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("wallet_address, wallet_verified_at").eq("id", userId).maybeSingle(),
  ]);

  return {
    userId,
    supabase,
    github: github ? { userId: github.github_user_id, login: github.github_login } : await syncGithubIdentity(userId),
    wallet:
      profile?.wallet_address && profile.wallet_verified_at ? getAddress(profile.wallet_address) : null,
  };
}

export class AuthError extends Error {}

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AuthError("Sign in to continue.");
  return viewer;
}

/**
 * Links the GitHub identity from Supabase Auth to the user's profile. The
 * database trigger normally does this at sign-up; this covers accounts created
 * before the trigger existed. Identity data comes from the Auth server, never
 * from the client.
 */
export async function syncGithubIdentity(userId: string): Promise<Viewer["github"]> {
  const supabase = await createClient();
  const admin = createAdminClient();
  if (!supabase || !admin) return null;

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.id !== userId) return null;

  const identity = user.identities?.find((item) => item.provider === "github");
  const githubId = Number(identity?.identity_data?.provider_id ?? identity?.identity_data?.sub ?? identity?.id);
  const login = identity?.identity_data?.user_name as string | undefined;
  if (!identity || !Number.isSafeInteger(githubId) || githubId <= 0 || !login) return null;

  await admin.from("profiles").upsert(
    {
      id: userId,
      display_name: (user.user_metadata?.full_name as string | undefined) ?? login,
      avatar_url: (identity.identity_data?.avatar_url as string | undefined) ?? null,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  const { error } = await admin.from("github_identities").upsert(
    {
      user_id: userId,
      github_user_id: githubId,
      github_login: login,
      avatar_url: (identity.identity_data?.avatar_url as string | undefined) ?? null,
    },
    { onConflict: "user_id" },
  );
  return error ? null : { userId: githubId, login };
}

/** Project access for the viewer: owner in Contribo, and/or approver onchain via their verified wallet. */
export async function getProjectAccess(
  viewer: Viewer | null,
  project: { owner_id: string; onchain_project_id: string | null },
): Promise<ProjectAccess> {
  const isOwner = !!viewer && project.owner_id === viewer.userId;
  let isApprover = false;
  if (viewer?.wallet && project.onchain_project_id && contriboRewards) {
    try {
      isApprover = await readIsApprover(BigInt(project.onchain_project_id), viewer.wallet);
    } catch {
      isApprover = false;
    }
  }
  return { isOwner, isApprover };
}
