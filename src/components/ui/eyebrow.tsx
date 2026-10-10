import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Section category marker: 11px, weight 500, uppercase, 0.1em tracking. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-eyebrow font-medium text-ink uppercase", className)} {...props} />;
}
