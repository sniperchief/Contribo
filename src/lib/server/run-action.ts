import "server-only";
import { fail, type ActionResult } from "@/lib/action-result";
import { GitHubApiError } from "./github";
import { AuthError } from "./viewer";

/** Runs a server action body, turning expected errors into messages and hiding unexpected ones. */
export async function runAction<T>(body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof AuthError || error instanceof GitHubApiError) return fail(error.message);
    console.error("Server action failed", error);
    return fail("Something went wrong. Please try again.");
  }
}
