"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

export type FaqItem = { q: string; a: string };

/**
 * FAQ accordion: one panel with hairline dividers, a +/− toggle, and answers
 * that slide open (grid-rows transition). The first question starts open.
 */
export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="divide-y divide-mist border-y border-mist">
      {items.map((item, index) => {
        const expanded = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpen(expanded ? null : index)}
                className="group flex w-full items-center gap-5 py-6 text-left"
              >
                <span className="w-7 shrink-0 text-caption font-medium text-deep-teal tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-body-lg font-bold text-ink transition-colors group-hover:text-plum">{item.q}</span>
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-300",
                    expanded ? "bg-ink text-paper" : "bg-mist text-ink group-hover:bg-lavender",
                  )}
                >
                  <span className="absolute h-0.5 w-3.5 rounded-full bg-current" />
                  <span
                    className={cn(
                      "absolute h-3.5 w-0.5 rounded-full bg-current transition-transform duration-300",
                      expanded && "scale-y-0",
                    )}
                  />
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              inert={!expanded}
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className={cn("max-w-2xl pr-14 pb-6 pl-12 text-base text-deep-teal transition-opacity duration-300", !expanded && "opacity-0")}>
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
