import Image from "next/image";
import { cn } from "@/lib/cn";
import mark from "@/assets/brand/contribo-mark.png";

type LogoProps = {
  /** `full` is the mark plus the "contribo" wordmark; `mark` is the symbol alone. */
  variant?: "full" | "mark";
  className?: string;
  /** Load immediately; use for above-the-fold placements such as the header. */
  eager?: boolean;
};

/** Contribo logo: the supplied brand mark with the wordmark set in the UI typeface. */
export function Logo({ variant = "full", className, eager }: LogoProps) {
  if (variant === "mark") {
    return (
      <Image src={mark} alt="Contribo" width={64} loading={eager ? "eager" : undefined} className={cn("h-[23px] w-auto", className)} />
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-ink", className)}>
      <Image src={mark} alt="" width={64} loading={eager ? "eager" : undefined} className="h-[23px] w-auto" />
      <span className="text-[22px] leading-none font-bold tracking-[-0.03em]">contribo</span>
    </span>
  );
}
