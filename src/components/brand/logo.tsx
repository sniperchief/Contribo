import Image from "next/image";
import { cn } from "@/lib/cn";
import logo from "@/assets/brand/contribo-logo.png";
import mark from "@/assets/brand/contribo-mark.png";

type LogoProps = {
  /** `full` is the mark plus wordmark; `mark` is the symbol alone. */
  variant?: "full" | "mark";
  className?: string;
  /** Load immediately; use for above-the-fold placements such as the header. */
  eager?: boolean;
};

/** Contribo logo, rendered from the supplied brand PNG. Height is set via `className` (e.g. `h-7`). */
export function Logo({ variant = "full", className, eager }: LogoProps) {
  return (
    <Image
      src={variant === "full" ? logo : mark}
      // Upper bound of the rendered width; keeps generated image sizes small.
      width={variant === "full" ? 180 : 64}
      alt="Contribo"
      loading={eager ? "eager" : undefined}
      className={cn("brand-ink h-7 w-auto", className)}
    />
  );
}
