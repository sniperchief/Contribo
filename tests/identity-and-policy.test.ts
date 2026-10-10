import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { describe, expect, it } from "vitest";
import { contributionRef, contributionStage } from "@/lib/contributions";
import { canonicalJson, computePolicyHash, policyDocument, type PolicyTerms } from "@/lib/policy";
import { buildWalletLinkMessage, checkWalletLinkMessage, parseWalletLinkMessage } from "@/lib/wallet/link-message";

// Well-known Anvil test key (public, never holds value).
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const USER = "4f6c2a5e-0000-4000-8000-000000000001";
const NOW = Date.parse("2026-06-01T12:00:00Z");

function message(overrides: Partial<Parameters<typeof buildWalletLinkMessage>[0]> = {}) {
  return buildWalletLinkMessage({
    userId: USER,
    address: account.address,
    chainId: 10143,
    nonce: "n-1",
    issuedAt: new Date(NOW).toISOString(),
    ...overrides,
  });
}

describe("wallet ownership linking", () => {
  it("accepts a fresh message for this user and chain, signed by the wallet", async () => {
    const text = message();
    const check = checkWalletLinkMessage(text, { userId: USER, chainId: 10143, now: NOW + 60_000 });
    expect(check.ok).toBe(true);
    const signature = await account.signMessage({ message: text });
    expect(await verifyMessage({ address: account.address, message: text, signature })).toBe(true);
  });

  it("rejects a signature presented by another user", () => {
    expect(checkWalletLinkMessage(message(), { userId: "someone-else", chainId: 10143, now: NOW }).ok).toBe(false);
  });

  it("rejects another network and expired messages", () => {
    expect(checkWalletLinkMessage(message(), { userId: USER, chainId: 143, now: NOW }).ok).toBe(false);
    expect(checkWalletLinkMessage(message(), { userId: USER, chainId: 10143, now: NOW + 11 * 60_000 }).ok).toBe(false);
  });

  it("rejects tampered messages", () => {
    expect(parseWalletLinkMessage(`${message()}\nExtra: line`)).toBeNull();
    expect(parseWalletLinkMessage(message().replace("Wallet: ", "Wallet:  "))).toBeNull();
  });

  it("a signature over one wallet does not verify for another", async () => {
    const text = message();
    const signature = await account.signMessage({ message: text });
    const other = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    expect(await verifyMessage({ address: other, message: text, signature })).toBe(false);
  });
});

describe("policy hashing", () => {
  const terms: PolicyTerms = {
    projectId: "p1",
    version: 1,
    title: "Launch policy",
    summary: null,
    terms: "Rewards for merged PRs.",
    rewardModel: "hybrid",
    contributorPoolBps: 1500,
    rewardAsset: "MON",
    eligibility: { labels: ["good first issue"], minReviews: 1 },
  };

  it("is deterministic regardless of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    const reordered = { ...terms, eligibility: { minReviews: 1, labels: ["good first issue"] } };
    expect(computePolicyHash(reordered)).toBe(computePolicyHash(terms));
  });

  it("changes when any term changes", () => {
    expect(computePolicyHash({ ...terms, contributorPoolBps: 1501 })).not.toBe(computePolicyHash(terms));
    expect(computePolicyHash({ ...terms, version: 2 })).not.toBe(computePolicyHash(terms));
    expect(computePolicyHash({ ...terms, projectId: "p2" })).not.toBe(computePolicyHash(terms));
  });

  it("documents its schema", () => {
    expect(policyDocument(terms)).toContain('"schema":"contribo.reward-policy/v1"');
  });
});

describe("contribution references and stages", () => {
  it("derives a stable, unique onchain reference per repository and PR", () => {
    expect(contributionRef(555, 12)).toBe(contributionRef("555", 12));
    expect(contributionRef(555, 12)).not.toBe(contributionRef(555, 13));
    expect(contributionRef(555, 12)).not.toBe(contributionRef(556, 12));
    expect(contributionRef(555, 12)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("distinguishes verified, accepted, approved and paid", () => {
    const base = { approved_onchain_at: null, claimed_at: null };
    expect(contributionStage({ ...base, status: "verified" })).toBe("verified");
    expect(contributionStage({ ...base, status: "accepted" })).toBe("accepted");
    expect(contributionStage({ status: "accepted", approved_onchain_at: "t", claimed_at: null })).toBe("approved");
    expect(contributionStage({ status: "accepted", approved_onchain_at: "t", claimed_at: "t" })).toBe("paid");
    expect(contributionStage({ ...base, status: "rejected" })).toBe("rejected");
  });
});
