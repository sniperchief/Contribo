import "server-only";
import { contriboRewards } from "@/lib/contracts/config";
import { canManageProject } from "@/lib/rules";
import { createAdminClient } from "@/lib/server/admin";
import { readOnchainProject } from "@/lib/server/chain";
import { getProjectAccess, type Viewer } from "@/lib/server/viewer";

/** Shared authorization helpers for founder server actions. */

export function requireAdmin() {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY is not configured.");
  return admin;
}

export async function loadOwnedProject(viewer: Viewer, projectId: string) {
  const { data: project } = await viewer.supabase
    .from("projects")
    .select("id, owner_id, status, onchain_project_id, onchain_asset")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;
  const decision = canManageProject(await getProjectAccess(viewer, project));
  return decision.ok ? project : null;
}

/**
 * Whether an onchain project holds funds contributors can be paid from
 * (available pool balance or escrowed bounties). Projects go live only when funded.
 */
export async function isFundedOnchain(onchainProjectId: string | null): Promise<boolean> {
  if (!contriboRewards || !onchainProjectId) return false;
  const onchain = await readOnchainProject(BigInt(onchainProjectId));
  return !!onchain && onchain.balances.available + onchain.balances.escrowed > 0n;
}
