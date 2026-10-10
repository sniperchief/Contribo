"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { isPrimaryRole } from "@/lib/profile";
import { runAction } from "@/lib/server/run-action";
import { requireViewer } from "@/lib/server/viewer";

/** Saves what brings the user to Contribo. A preference only; it never restricts access. */
export async function setPrimaryRole(role: string): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!isPrimaryRole(role)) return fail("Choose contributor or founder.");
    const { error, count } = await viewer.supabase
      .from("profiles")
      .update({ primary_role: role }, { count: "exact" })
      .eq("id", viewer.userId);
    return error || count !== 1 ? fail("Could not save your choice.") : ok();
  });
}

/** Marks onboarding as done (whether or not a wallet was linked). */
export async function completeOnboarding(): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    const { error, count } = await viewer.supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", viewer.userId)
      .is("onboarded_at", null);
    // count 0 means onboarding was already completed, which is fine.
    return error || (count ?? 0) > 1 ? fail("Could not finish onboarding.") : ok();
  });
}
