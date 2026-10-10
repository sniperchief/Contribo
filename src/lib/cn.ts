import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge that knows the design system's custom scales (globals.css),
 * so `text-heading-sm` is a font size (not a color) and `rounded-card` a radius.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "heading-lg", "heading", "heading-sm", "subheading", "body-lg", "caption", "eyebrow"],
      radius: ["control", "badge", "card", "feature"],
    },
  },
});

/** Joins class names, skipping falsy values; later classes override conflicting earlier ones. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
