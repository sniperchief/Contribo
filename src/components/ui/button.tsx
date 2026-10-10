import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * primary   Ink fill, white text. The single dark fill for main actions.
 * accent    Lavender fill: reward actions (approve onchain, claim).
 * secondary Transparent with a 2px border in a product color; text in its dark pair.
 * ghost     Text only (add `arrow` for "Learn more →" style links).
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
/** Product color for secondary buttons. */
export type ButtonTone = "mist" | "sky" | "terracotta" | "lavender" | "plum";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Exclude<ButtonVariant, "secondary">, string> = {
  primary: "bg-ink text-paper hover:bg-plum hover:text-paper",
  accent: "bg-lavender text-ink hover:bg-accent-hover hover:text-ink",
  ghost: "px-0 text-ink hover:text-plum",
};

const tones: Record<ButtonTone, string> = {
  mist: "border-mist text-ink hover:bg-mist",
  sky: "border-sky text-deep-teal hover:bg-sky/30 hover:text-deep-teal",
  terracotta: "border-terracotta text-graphite hover:bg-terracotta/20 hover:text-graphite",
  lavender: "border-lavender text-plum hover:bg-lavender/30 hover:text-plum",
  plum: "border-plum text-plum hover:bg-plum hover:text-paper",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-11 px-4 text-[15px]",
  md: "h-12 px-6 text-base",
  lg: "h-14 px-6 text-base",
};

/** Button styling, shared by `<Button>` and links that look like buttons. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  tone = "mist",
  arrow = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; tone?: ButtonTone; arrow?: boolean; className?: string } = {}) {
  return cn(
    base,
    variant === "secondary" ? cn("border-2 bg-transparent", tones[tone]) : variants[variant],
    variant === "ghost" ? (size === "sm" ? "h-11 text-[15px]" : "h-12 text-base") : sizes[size],
    arrow && "after:content-['→']",
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: ButtonTone;
  arrow?: boolean;
};

export function Button({ variant, size, tone, arrow, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, tone, arrow, className })} {...props} />;
}
