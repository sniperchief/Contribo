import { NextResponse, type NextRequest } from "next/server";
import { isPrimaryRole, postSignInPath } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/url";

/** OAuth callback: exchanges the authorization code for a Supabase session, then routes new users to onboarding. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("onboarded_at, primary_role")
          .eq("id", data.user.id)
          .maybeSingle();
        // If onboarding columns are unavailable (migration not applied), keep the original destination.
        const destination =
          profileError || !profile
            ? next
            : postSignInPath({
                next,
                onboardedAt: profile.onboarded_at,
                role: isPrimaryRole(profile.primary_role) ? profile.primary_role : null,
              });
        return NextResponse.redirect(new URL(destination, origin));
      }
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
