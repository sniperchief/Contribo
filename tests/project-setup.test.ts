import { describe, expect, it } from "vitest";
import {
  defaultTerms,
  isPositiveAmount,
  MAX_SETUP_BOUNTIES,
  nameFromRepo,
  planTotal,
  readSetupPlan,
  setupStep,
  slugFrom,
  validateSetupPlan,
} from "@/lib/project-setup";
import { PROJECT_SLUG_RE } from "@/lib/projects";

const bounty = (overrides = {}) => ({ title: "Add dark mode", amount: "100", days: 30, ...overrides });

describe("validateSetupPlan", () => {
  it("accepts a bounty plan and drops pool fields", () => {
    const check = validateSetupPlan({ type: "bounty", asset: "MON", poolPercent: 20, deposit: "5", bounties: [bounty()] });
    expect(check).toEqual({
      ok: true,
      plan: { type: "bounty", asset: "MON", poolPercent: null, deposit: null, bounties: [bounty()] },
    });
  });

  it("accepts a pool plan and drops bounties", () => {
    const check = validateSetupPlan({ type: "funding_share", asset: "mon", poolPercent: 15, deposit: "250.5", bounties: [bounty()] });
    expect(check).toEqual({
      ok: true,
      plan: { type: "funding_share", asset: "MON", poolPercent: 15, deposit: "250.5", bounties: [] },
    });
  });

  it("rejects hybrid and unknown reward types", () => {
    expect(validateSetupPlan({ type: "hybrid", asset: "MON" }).ok).toBe(false);
    expect(validateSetupPlan({ asset: "MON" }).ok).toBe(false);
    expect(validateSetupPlan(null).ok).toBe(false);
  });

  it("requires at least one bounty, and at most the setup limit", () => {
    expect(validateSetupPlan({ type: "bounty", asset: "MON", bounties: [] }).ok).toBe(false);
    const many = Array.from({ length: MAX_SETUP_BOUNTIES + 1 }, () => bounty());
    expect(validateSetupPlan({ type: "bounty", asset: "MON", bounties: many }).ok).toBe(false);
  });

  it("validates bounty title, amount and deadline", () => {
    for (const bad of [bounty({ title: "ab" }), bounty({ amount: "0" }), bounty({ amount: "-1" }), bounty({ amount: "1e3" }), bounty({ days: 0 }), bounty({ days: 400 })]) {
      expect(validateSetupPlan({ type: "bounty", asset: "MON", bounties: [bad] }).ok).toBe(false);
    }
  });

  it("requires a pool share and a positive deposit", () => {
    expect(validateSetupPlan({ type: "funding_share", asset: "MON", poolPercent: 0, deposit: "10" }).ok).toBe(false);
    expect(validateSetupPlan({ type: "funding_share", asset: "MON", poolPercent: 101, deposit: "10" }).ok).toBe(false);
    expect(validateSetupPlan({ type: "funding_share", asset: "MON", poolPercent: 10, deposit: "" }).ok).toBe(false);
  });

  it("accepts MON or a token address only", () => {
    const token = "0x1111111111111111111111111111111111111111";
    expect(validateSetupPlan({ type: "bounty", asset: token, bounties: [bounty()] }).ok).toBe(true);
    expect(validateSetupPlan({ type: "bounty", asset: "USDC", bounties: [bounty()] }).ok).toBe(false);
  });

  it("reads stored plans and ignores malformed ones", () => {
    expect(readSetupPlan({ type: "bounty", asset: "MON", bounties: [bounty()] })?.type).toBe("bounty");
    expect(readSetupPlan({ type: "bounty" })).toBeNull();
    expect(readSetupPlan(null)).toBeNull();
  });
});

describe("planTotal", () => {
  it("sums bounty amounts without floating-point drift", () => {
    const check = validateSetupPlan({
      type: "bounty",
      asset: "MON",
      bounties: [bounty({ amount: "0.1" }), bounty({ amount: "0.2" }), bounty({ amount: "10" })],
    });
    expect(check.ok && planTotal(check.plan)).toBe("10.3");
  });

  it("is the deposit for a pool", () => {
    const check = validateSetupPlan({ type: "funding_share", asset: "MON", poolPercent: 10, deposit: "250" });
    expect(check.ok && planTotal(check.plan)).toBe("250");
  });
});

describe("helpers", () => {
  it("checks amounts", () => {
    expect(isPositiveAmount("1.5")).toBe(true);
    expect(isPositiveAmount("0")).toBe(false);
    expect(isPositiveAmount("abc")).toBe(false);
  });

  it("names projects after their repository", () => {
    expect(nameFromRepo("monad-sdk")).toBe("Monad SDK");
    expect(nameFromRepo("my_cool.app")).toBe("My Cool App");
  });

  it("creates valid slugs", () => {
    for (const value of ["Monad SDK", "--weird__Name--", "a", "x".repeat(100)]) {
      expect(PROJECT_SLUG_RE.test(slugFrom(value))).toBe(true);
      expect(PROJECT_SLUG_RE.test(slugFrom(value, "ab12"))).toBe(true);
    }
    expect(slugFrom("Monad SDK")).toBe("monad-sdk");
    expect(slugFrom("Monad SDK", "ab12")).toBe("monad-sdk-ab12");
  });

  it("writes terms for the chosen reward type", () => {
    expect(defaultTerms({ type: "funding_share", poolPercent: 15 }, "MON").summary).toContain("15%");
    expect(defaultTerms({ type: "bounty", poolPercent: null }, "USDC").terms).toContain("USDC");
  });

  it("resumes setup at the first unfinished step", () => {
    expect(setupStep({ hasVerifiedRepo: false, hasPlan: true })).toBe(1);
    expect(setupStep({ hasVerifiedRepo: true, hasPlan: false })).toBe(2);
    expect(setupStep({ hasVerifiedRepo: true, hasPlan: true })).toBe(3);
  });
});
