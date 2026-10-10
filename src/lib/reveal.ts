import type { CSSProperties } from "react";

/**
 * Props for an element that should fade up when scrolled into view (activated by
 * <ScrollReveal />). `delay` (ms) staggers items within a group.
 */
export function reveal(delay = 0): { "data-reveal": ""; style?: CSSProperties } {
  return delay ? { "data-reveal": "", style: { "--reveal-delay": `${delay}ms` } as CSSProperties } : { "data-reveal": "" };
}
