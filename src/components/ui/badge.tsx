import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Pill badge: 16px radius, 12px weight 500. Product tints carry meaning:
 * sky = projects/repos, terracotta = bounties, lavender = pools/rewards, plum = onchain.
 * Legacy semantic tones map onto the palette (success→sky, accent→lavender, warning→cream).
 */
export type BadgeTone =
  | "neutral"
  | "fog"
  | "sky"
  | "terracotta"
  | "lavender"
  | "cream"
  | "plum"
  | "ink"
  | "accent"
  | "success"
  | "warning"
  | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-mist text-deep-teal",
  fog: "bg-fog text-deep-teal",
  sky: "bg-sky text-deep-teal",
  terracotta: "bg-terracotta text-ink",
  lavender: "bg-lavender text-plum",
  cream: "bg-cream text-graphite",
  plum: "bg-plum text-paper",
  ink: "bg-ink text-paper",
  accent: "bg-lavender text-plum",
  success: "bg-sky text-deep-teal",
  warning: "bg-cream text-graphite",
  danger: "bg-danger-soft text-danger",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-badge px-3.5 py-1.5 text-caption font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
