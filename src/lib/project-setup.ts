import { isAddress } from "viem";
import { PROJECT_SLUG_RE } from "@/lib/projects";

/**
 * Guided project setup: a founder picks a repository, chooses ONE reward type
 * (bounties or a contributor pool) with its funding, then launches. The plan is
 * saved on the project until launch so setup can be resumed.
 */

export type SetupRewardType = "bounty" | "funding_share";

export type PlannedBounty = { title: string; amount: string; days: number };

export type SetupPlan = {
  type: SetupRewardType;
  /** "MON" or an ERC-20 token address on Monad. */
  asset: string;
  /** Pool only: share of future funding reserved for contributors, 1–100. */
  poolPercent: number | null;
  /** Pool only: first deposit, in whole units of the asset (e.g. "250" or "0.5"). */
  deposit: string | null;
  /** Bounties only: at least one. */
  bounties: PlannedBounty[];
};

export const MAX_SETUP_BOUNTIES = 10;
const AMOUNT_RE = /^(?:\d{1,18})(?:\.\d{1,18})?$/;

export function isPositiveAmount(value: string): boolean {
  return AMOUNT_RE.test(value.trim()) && Number(value) > 0;
}

export type PlanCheck = { ok: true; plan: SetupPlan } | { ok: false; error: string };

/** Validates and normalizes a plan sent by the browser. */
export function validateSetupPlan(input: unknown): PlanCheck {
  if (!input || typeof input !== "object") return { ok: false, error: "Choose how you reward contributors." };
  const raw = input as Record<string, unknown>;

  const type = raw.type;
  if (type !== "bounty" && type !== "funding_share") return { ok: false, error: "Choose bounties or a contributor pool." };

  const assetRaw = typeof raw.asset === "string" ? raw.asset.trim() : "";
  const asset = !assetRaw || assetRaw.toUpperCase() === "MON" ? "MON" : assetRaw;
  if (asset !== "MON" && !isAddress(asset)) return { ok: false, error: "Enter a valid token address, or pay in MON." };

  if (type === "funding_share") {
    const poolPercent = Number(raw.poolPercent);
    if (!Number.isInteger(poolPercent) || poolPercent < 1 || poolPercent > 100) {
      return { ok: false, error: "Choose a contributor pool share between 1% and 100%." };
    }
    const deposit = typeof raw.deposit === "string" ? raw.deposit.trim() : "";
    if (!isPositiveAmount(deposit)) return { ok: false, error: "Enter how much to deposit into the pool." };
    return { ok: true, plan: { type, asset, poolPercent, deposit, bounties: [] } };
  }

  const list = Array.isArray(raw.bounties) ? raw.bounties : [];
  if (list.length === 0) return { ok: false, error: "Add at least one bounty." };
  if (list.length > MAX_SETUP_BOUNTIES) return { ok: false, error: `Add up to ${MAX_SETUP_BOUNTIES} bounties during setup.` };
  const bounties: PlannedBounty[] = [];
  for (const [index, item] of list.entries()) {
    const b = (item ?? {}) as Record<string, unknown>;
    const title = typeof b.title === "string" ? b.title.trim() : "";
    const amount = typeof b.amount === "string" ? b.amount.trim() : "";
    const days = Number(b.days);
    const label = `Bounty ${index + 1}`;
    if (title.length < 3 || title.length > 120) return { ok: false, error: `${label}: give it a title (3–120 characters).` };
    if (!isPositiveAmount(amount)) return { ok: false, error: `${label}: enter an amount greater than zero.` };
    if (!Number.isInteger(days) || days < 1 || days > 365) return { ok: false, error: `${label}: the deadline must be 1–365 days.` };
    bounties.push({ title, amount, days });
  }
  return { ok: true, plan: { type, asset, poolPercent: null, deposit: null, bounties } };
}

/** Reads a stored plan, or `null` when there is none or it is malformed. */
export function readSetupPlan(value: unknown): SetupPlan | null {
  const check = validateSetupPlan(value);
  return check.ok ? check.plan : null;
}

/** Total the plan locks in the vault, as a decimal string in whole asset units. */
export function planTotal(plan: SetupPlan): string {
  const parts = plan.type === "funding_share" ? [plan.deposit ?? "0"] : plan.bounties.map((b) => b.amount);
  // Sum as fixed-point (18 decimals) to avoid floating-point drift.
  const scale = 10n ** 18n;
  const toUnits = (value: string) => {
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole || "0") * scale + BigInt((fraction + "0".repeat(18)).slice(0, 18));
  };
  const total = parts.reduce((sum, part) => sum + toUnits(part), 0n);
  const whole = total / scale;
  const fraction = (total % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Plain-language reward terms written for the founder; they can edit them before launch. */
export function defaultTerms(plan: Pick<SetupPlan, "type" | "poolPercent">, assetSymbol: string): { summary: string; terms: string } {
  if (plan.type === "funding_share") {
    const pct = plan.poolPercent ?? 0;
    return {
      summary: `${pct}% of future funding is reserved for contributors, paid in ${assetSymbol}.`,
      terms: [
        `${pct}% of the funding this project raises is reserved for contributors in the Contribo vault on Monad.`,
        `Merged pull requests to this project's verified repositories are reviewed by the project. Accepted work is rewarded from the pool in ${assetSymbol}, and each reward is committed onchain before the contributor claims it.`,
        `Only pull requests authored by the contributor's linked GitHub account count. These terms are fixed once published; any change is published as a new version.`,
      ].join("\n\n"),
    };
  }
  return {
    summary: `Fixed bounties paid in ${assetSymbol}, escrowed onchain before work starts.`,
    terms: [
      `Each bounty pays its listed amount in ${assetSymbol}. The funds are escrowed in the Contribo vault on Monad before anyone starts work.`,
      `A bounty is awarded to the contributor whose merged pull request to one of this project's verified repositories completes it. The reward is committed onchain and the contributor claims it to their wallet.`,
      `Unawarded bounties can be reclaimed by the project after their deadline. These terms are fixed once published; any change is published as a new version.`,
    ].join("\n\n"),
  };
}

const ACRONYMS = new Set(["api", "sdk", "cli", "ui", "ux", "evm", "nft", "dao", "dex", "zk", "ai", "js", "ts"]);

/** Readable project name from a repository name: "monad-sdk" → "Monad SDK". */
export function nameFromRepo(repoName: string): string {
  const words = repoName.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const name = words.map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(" ");
  return name.length >= 2 ? name.slice(0, 80) : repoName;
}

/** URL slug derived from a name; `suffix` disambiguates when the slug is taken. */
export function slugFrom(value: string, suffix?: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, suffix ? 63 - suffix.length : 64)
    .replace(/-+$/g, "");
  const slug = suffix ? `${base || "project"}-${suffix}` : base;
  return PROJECT_SLUG_RE.test(slug) ? slug : `project-${suffix ?? "new"}`;
}

export type SetupStep = 1 | 2 | 3;

/** Where an unfinished setup resumes: repository → rewards → launch. */
export function setupStep(input: { hasVerifiedRepo: boolean; hasPlan: boolean }): SetupStep {
  if (!input.hasVerifiedRepo) return 1;
  if (!input.hasPlan) return 2;
  return 3;
}
