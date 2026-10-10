import { keccak256, toBytes, type Hex } from "viem";
import type { Json, RewardModel } from "@/types/database";

/** The reward-policy fields that define its terms (and therefore its hash). */
export type PolicyTerms = {
  projectId: string;
  version: number;
  title: string;
  summary: string | null;
  terms: string;
  rewardModel: RewardModel;
  contributorPoolBps: number | null;
  rewardAsset: string;
  eligibility: Json;
};

/** JSON with object keys sorted recursively, so equal values always serialize identically. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Canonical document that is hashed and anchored onchain as the project's `policyHash`. */
export function policyDocument(policy: PolicyTerms): string {
  return canonicalJson({ schema: "contribo.reward-policy/v1", ...policy });
}

export function computePolicyHash(policy: PolicyTerms): Hex {
  return keccak256(toBytes(policyDocument(policy)));
}

export function sameHash(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
