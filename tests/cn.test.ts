import { describe, expect, it } from "vitest";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

describe("class merging", () => {
  it("lets later classes override conflicting ones", () => {
    expect(cn("text-ink", "text-deep-teal")).toBe("text-deep-teal");
    expect(cn("h-12 px-4", "h-11")).toBe("px-4 h-11");
    expect(cn("bg-fog", false, "bg-paper")).toBe("bg-paper");
  });

  it("treats the design's type scale as font sizes, not colors", () => {
    expect(cn("text-heading-sm text-ink", "text-deep-teal")).toBe("text-heading-sm text-deep-teal");
    expect(cn("text-eyebrow text-ink", "text-lavender")).toBe("text-eyebrow text-lavender");
    expect(cn("text-base", "text-heading")).toBe("text-heading");
  });

  it("treats the design's radii as border radius", () => {
    expect(cn("rounded-control", "rounded-card")).toBe("rounded-card");
  });

  it("applies button overrides", () => {
    const classes = buttonStyles({ variant: "ghost", className: "text-deep-teal" }).split(" ");
    expect(classes).toContain("text-deep-teal");
    expect(classes).not.toContain("text-ink");
  });
});
