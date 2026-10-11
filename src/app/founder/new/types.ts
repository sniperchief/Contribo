import type { SetupPlan } from "@/lib/project-setup";

export type RepoMatch = { fullName: string; description: string | null };

export type SetupRepo = {
  id: string;
  fullName: string;
  verified: boolean;
  method: "owner" | "file" | null;
  verificationToken: string;
};

/** Everything the setup screens need, loaded on the server for a new or resumed setup. */
export type SetupState = {
  projectId: string | null;
  slug: string | null;
  name: string;
  tagline: string;
  repo: SetupRepo | null;
  plan: SetupPlan | null;
  copy: { summary: string; terms: string } | null;
  onchainProjectId: string | null;
  githubLogin: string | null;
  verifiedWallet: string | null;
};
