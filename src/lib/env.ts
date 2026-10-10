/**
 * Typed access to public (browser-safe) environment variables.
 *
 * Every integration is optional at this stage: the app installs, builds and
 * runs without credentials, and features degrade gracefully when unset.
 * `NEXT_PUBLIC_*` values must be referenced statically so Next.js can inline them.
 */

export type MonadNetwork = "testnet" | "mainnet";

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const env = {
  siteUrl: optional(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000",

  supabase: {
    url: optional(process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: optional(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  },

  monad: {
    network: (process.env.NEXT_PUBLIC_MONAD_NETWORK === "mainnet" ? "mainnet" : "testnet") as MonadNetwork,
    rpcUrl: optional(process.env.NEXT_PUBLIC_MONAD_RPC_URL),
  },

  contracts: {
    /** Deployed ContriboRewards address on the configured network; unset until deployment. */
    rewardsAddress: optional(process.env.NEXT_PUBLIC_CONTRIBO_REWARDS_ADDRESS),
  },
} as const;

export type SupabaseConfig = { url: string; publishableKey: string };

/** Returns the Supabase config, or `null` when the project is not configured yet. */
export function getSupabaseConfig(): SupabaseConfig | null {
  const { url, publishableKey } = env.supabase;
  return url && publishableKey ? { url, publishableKey } : null;
}
