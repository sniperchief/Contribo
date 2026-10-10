import { describe, expect, it } from "vitest";
import { homeFor, isPrimaryRole, parseSkills, parseSocialLinks, postSignInPath, readSocialLinks, SKILLS, SOCIAL_FIELDS } from "@/lib/profile";

describe("social links", () => {
  it("accepts handles and profile URLs and normalizes them", () => {
    const result = parseSocialLinks({
      x: "https://x.com/monad_dev",
      linkedin: "https://www.linkedin.com/in/jane-doe/",
      discord: "Jane.Doe",
      telegram: "@janedoe",
      farcaster: "warpcast.com/jane",
    });
    expect(result).toEqual({
      ok: true,
      value: { x: "monad_dev", linkedin: "jane-doe", discord: "jane.doe", telegram: "janedoe", farcaster: "jane" },
    });
  });

  it("drops empty fields", () => {
    expect(parseSocialLinks({ x: "  ", discord: "" })).toEqual({ ok: true, value: {} });
  });

  it("rejects invalid usernames with the field name", () => {
    expect(parseSocialLinks({ x: "way_too_long_for_x_handles" })).toMatchObject({ ok: false, error: expect.stringContaining("X") });
    expect(parseSocialLinks({ telegram: "abc" })).toMatchObject({ ok: false, error: expect.stringContaining("Telegram") });
    expect(parseSocialLinks({ x: "https://evil.com/monad_dev" }).ok).toBe(false);
    expect(parseSocialLinks({ discord: "a..b" }).ok).toBe(false);
  });

  it("builds public URLs only from normalized values", () => {
    const x = SOCIAL_FIELDS.find((f) => f.key === "x")!;
    expect(x.url("monad_dev")).toBe("https://x.com/monad_dev");
  });

  it("reads stored JSON defensively", () => {
    expect(readSocialLinks({ x: "a", unknown: "b", discord: 5 })).toEqual({ x: "a" });
    expect(readSocialLinks(null)).toEqual({});
    expect(readSocialLinks(["x"])).toEqual({});
  });
});

describe("skills", () => {
  it("offers 20 tech stacks", () => {
    expect(SKILLS).toHaveLength(20);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(20);
  });

  it("accepts known skills, de-duplicated in catalog order", () => {
    expect(parseSkills(["react", "solidity", "react"])).toEqual({ ok: true, value: ["solidity", "react"] });
    expect(parseSkills([])).toEqual({ ok: true, value: [] });
  });

  it("rejects unknown skills", () => {
    expect(parseSkills(["solidity", "cobol"]).ok).toBe(false);
  });
});

describe("post sign-in routing", () => {
  it("sends new users to onboarding, keeping a requested page", () => {
    expect(postSignInPath({ next: "/", onboardedAt: null, role: null })).toBe("/welcome");
    expect(postSignInPath({ next: "/projects/x", onboardedAt: null, role: null })).toBe("/welcome?next=%2Fprojects%2Fx");
  });

  it("sends returning users to their role's home or the requested page", () => {
    expect(postSignInPath({ next: "/", onboardedAt: "t", role: "founder" })).toBe("/founder");
    expect(postSignInPath({ next: "/", onboardedAt: "t", role: "contributor" })).toBe("/dashboard");
    expect(postSignInPath({ next: "/", onboardedAt: "t", role: null })).toBe("/dashboard");
    expect(postSignInPath({ next: "/projects/x", onboardedAt: "t", role: "founder" })).toBe("/projects/x");
  });

  it("only accepts known roles", () => {
    expect(isPrimaryRole("founder")).toBe(true);
    expect(isPrimaryRole("admin")).toBe(false);
    expect(homeFor("founder")).toBe("/founder");
  });
});
