/** Result shape returned by every server action, safe to pass to Client Components. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function ok(): ActionResult;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/** Postgres unique_violation. */
export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
