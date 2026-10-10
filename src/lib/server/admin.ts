import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/env";
import type { Database } from "@/types/database";
import { serverEnv } from "./env";

/**
 * Supabase client with the secret key. It bypasses Row Level Security, so use
 * it only for writes the database deliberately withholds from API roles
 * (verified evidence, onchain reconciliation) and only after authorizing the
 * caller in server code. Returns `null` when not configured.
 */
export function createAdminClient() {
  const config = getSupabaseConfig();
  if (!config || !serverEnv.supabaseSecretKey) return null;
  return createClient<Database>(config.url, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
