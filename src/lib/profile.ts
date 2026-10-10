/**
 * Profile social links and skills: shared definitions and validation.
 * The allowed values mirror the checks in supabase/migrations/*_profile_socials_and_skills.sql.
 */

export const SKILLS = [
  { id: "solidity", label: "Solidity" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "cpp", label: "C++" },
  { id: "react", label: "React" },
  { id: "nextjs", label: "Next.js" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
  { id: "nodejs", label: "Node.js" },
  { id: "tailwindcss", label: "Tailwind CSS" },
  { id: "foundry", label: "Foundry" },
  { id: "hardhat", label: "Hardhat" },
  { id: "viem-wagmi", label: "viem / wagmi" },
  { id: "ethersjs", label: "Ethers.js" },
  { id: "postgresql", label: "PostgreSQL" },
  { id: "graphql", label: "GraphQL" },
  { id: "docker", label: "Docker" },
] as const;

export type SkillId = (typeof SKILLS)[number]["id"];

const SKILL_IDS = new Set<string>(SKILLS.map((s) => s.id));

export function isSkillId(value: string): value is SkillId {
  return SKILL_IDS.has(value);
}

export type SocialKey = "x" | "linkedin" | "discord" | "telegram" | "farcaster";

type SocialField = {
  key: SocialKey;
  label: string;
  placeholder: string;
  hint: string;
  /** Normalizes user input (handle or profile URL) to the stored value, or null if invalid. */
  normalize: (input: string) => string | null;
  /** Public profile URL for the stored value, if the platform has one. */
  url: (value: string) => string | null;
};

const handleFrom = (input: string, hosts: string[]) => {
  const trimmed = input.trim().replace(/^@/, "");
  const match = new RegExp(`^(?:https?://)?(?:www\\.)?(?:${hosts.join("|")})/([^/?#]+)/?$`, "i").exec(trimmed);
  return match ? match[1] : trimmed;
};

export const SOCIAL_FIELDS: SocialField[] = [
  {
    key: "x",
    label: "X (Twitter)",
    placeholder: "@handle",
    hint: "Your X username.",
    normalize: (input) => {
      const handle = handleFrom(input, ["x\\.com", "twitter\\.com"]);
      return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
    },
    url: (value) => `https://x.com/${value}`,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    placeholder: "linkedin.com/in/your-name",
    hint: "Your public profile URL or its last part.",
    normalize: (input) => {
      const handle = handleFrom(input, ["linkedin\\.com/in"]);
      return /^[A-Za-z0-9-_%]{3,100}$/.test(handle) ? handle : null;
    },
    url: (value) => `https://www.linkedin.com/in/${value}`,
  },
  {
    key: "discord",
    label: "Discord",
    placeholder: "username",
    hint: "Your Discord username.",
    normalize: (input) => {
      const handle = input.trim().replace(/^@/, "").toLowerCase();
      return /^(?!.*\.\.)[a-z0-9_.]{2,32}$/.test(handle) ? handle : null;
    },
    url: () => null,
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "@handle",
    hint: "Your Telegram username.",
    normalize: (input) => {
      const handle = handleFrom(input, ["t\\.me", "telegram\\.me"]);
      return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle) ? handle : null;
    },
    url: (value) => `https://t.me/${value}`,
  },
  {
    key: "farcaster",
    label: "Farcaster",
    placeholder: "@handle",
    hint: "Your Farcaster username.",
    normalize: (input) => {
      const handle = handleFrom(input, ["warpcast\\.com", "farcaster\\.xyz"]).toLowerCase();
      return /^[a-z0-9][a-z0-9-]{0,19}(\.eth)?$/.test(handle) ? handle : null;
    },
    url: (value) => `https://farcaster.xyz/${value}`,
  },
];

export type SocialLinks = Partial<Record<SocialKey, string>>;

/** Validates and normalizes submitted social links; empty fields are dropped. */
export function parseSocialLinks(input: Partial<Record<SocialKey, string | null | undefined>>):
  | { ok: true; value: SocialLinks }
  | { ok: false; error: string } {
  const value: SocialLinks = {};
  for (const field of SOCIAL_FIELDS) {
    const raw = input[field.key]?.trim();
    if (!raw) continue;
    const normalized = field.normalize(raw);
    if (!normalized) return { ok: false, error: `${field.label}: enter a valid username.` };
    value[field.key] = normalized;
  }
  return { ok: true, value };
}

/** Reads stored social links defensively (the column is JSON). */
export function readSocialLinks(json: unknown): SocialLinks {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const links: SocialLinks = {};
  for (const field of SOCIAL_FIELDS) {
    const value = (json as Record<string, unknown>)[field.key];
    if (typeof value === "string" && value) links[field.key] = value;
  }
  return links;
}

/** Validates a skill selection: known IDs only, de-duplicated, in catalog order. */
export function parseSkills(input: string[]): { ok: true; value: SkillId[] } | { ok: false; error: string } {
  const unknown = input.filter((s) => !isSkillId(s));
  if (unknown.length > 0) return { ok: false, error: "Unknown skill selected." };
  const chosen = new Set(input);
  return { ok: true, value: SKILLS.filter((s) => chosen.has(s.id)).map((s) => s.id) };
}

export type PrimaryRole = "contributor" | "founder";

export function isPrimaryRole(value: unknown): value is PrimaryRole {
  return value === "contributor" || value === "founder";
}

/** Where a user lands after sign-in. The role is a preference; every area stays reachable. */
export function homeFor(role: PrimaryRole | null | undefined): string {
  return role === "founder" ? "/founder" : "/dashboard";
}

/**
 * Where to send a user right after signing in. New users go through /welcome
 * (keeping the page they asked for); returning users land on their role's home
 * unless they were heading somewhere specific.
 */
export function postSignInPath(input: {
  next: string;
  onboardedAt: string | null;
  role: PrimaryRole | null;
}): string {
  if (!input.onboardedAt) {
    return input.next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(input.next)}`;
  }
  return input.next === "/" ? homeFor(input.role) : input.next;
}
