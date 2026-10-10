"use client";

import { useLayoutEffect } from "react";

/**
 * Activates `[data-reveal]` scroll animations on the current page.
 *
 * Content is never hidden without JavaScript: elements only become hidden once
 * this component has mounted, and anything already on screen at that moment is
 * marked as shown first (no flicker). Each element animates once. Reduced-motion
 * users see everything immediately (see globals.css).
 */
export function ScrollReveal() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-shown])"));
    if (!("IntersectionObserver" in window)) return;

    const viewport = window.innerHeight;
    for (const element of elements) {
      if (element.getBoundingClientRect().top < viewport) element.dataset.shown = "";
    }
    root.classList.add("reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.shown = "";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );
    elements.filter((el) => !("shown" in el.dataset)).forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
