import "server-only";

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Server-only secrets. Never import this module from Client Components; the
 * `server-only` import turns that mistake into a build error.
 */
export const serverEnv = {
  /** Supabase secret (service-role) key. Bypasses RLS; used only after server-side authorization. */
  supabaseSecretKey: optional(process.env.SUPABASE_SECRET_KEY),
  /** Optional GitHub token for higher API rate limits (read-only access to public repositories is enough). */
  githubToken: optional(process.env.GITHUB_TOKEN),
} as const;
