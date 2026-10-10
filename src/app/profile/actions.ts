"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { parseSkills, parseSocialLinks, SOCIAL_FIELDS, type SocialKey } from "@/lib/profile";
import { runAction } from "@/lib/server/run-action";
import { requireViewer } from "@/lib/server/viewer";

function text(value: FormDataEntryValue | null, max: number): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Saves the signed-in user's profile details and social accounts (own row only, enforced by RLS). */
export async function updateProfileDetails(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();

    const website = text(formData.get("website_url"), 200);
    if (website && !/^https:\/\/\S+\.\S+$/.test(website)) return fail("Website must be an https:// URL.");

    const socials = parseSocialLinks(
      Object.fromEntries(
        SOCIAL_FIELDS.map((field) => [field.key, text(formData.get(`social_${field.key}`), 200)]),
      ) as Record<SocialKey, string | null>,
    );
    if (!socials.ok) return fail(socials.error);

    const { error, count } = await viewer.supabase
      .from("profiles")
      .update(
        {
          display_name: text(formData.get("display_name"), 80),
          bio: text(formData.get("bio"), 500),
          website_url: website,
          social_links: socials.value,
        },
        { count: "exact" },
      )
      .eq("id", viewer.userId);
    if (error || count !== 1) return fail("Could not save your profile.");
    return ok();
  });
}

/** Saves the signed-in user's tech stack selection. */
export async function updateSkills(skills: string[]): Promise<ActionResult> {
  return runAction(async () => {
    const viewer = await requireViewer();
    if (!Array.isArray(skills)) return fail("Invalid selection.");
    const parsed = parseSkills(skills.map(String));
    if (!parsed.ok) return fail(parsed.error);

    const { error, count } = await viewer.supabase
      .from("profiles")
      .update({ skills: parsed.value }, { count: "exact" })
      .eq("id", viewer.userId);
    if (error || count !== 1) return fail("Could not save your skills.");
    return ok();
  });
}
