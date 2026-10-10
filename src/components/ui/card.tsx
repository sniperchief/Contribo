import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Eyebrow } from "./eyebrow";

/** White content card: 24px radius, no shadow, 36px padding on desktop. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card bg-surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-2 p-6 sm:p-9", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-heading-sm font-bold text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-base text-deep-teal", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 pb-6 sm:px-9 sm:pb-9", className)} {...props} />;
}

export type BandTone = "sky" | "lavender" | "terracotta" | "plum";

const bands: Record<BandTone, { band: string; eyebrow: string; text: string }> = {
  sky: { band: "bg-sky", eyebrow: "text-deep-teal", text: "text-deep-teal" },
  lavender: { band: "bg-lavender", eyebrow: "text-plum", text: "text-plum" },
  terracotta: { band: "bg-terracotta", eyebrow: "text-graphite", text: "text-graphite" },
  plum: { band: "bg-plum", eyebrow: "text-lavender", text: "text-mist" },
};

/** White card whose header is a colored band in the section's product color. */
export function BandCard({
  tone,
  label,
  description,
  aside,
  id,
  className,
  children,
}: {
  tone: BandTone;
  label: string;
  description?: ReactNode;
  aside?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = bands[tone];
  return (
    <section id={id} className={cn("scroll-mt-24 overflow-hidden rounded-card bg-surface", className)}>
      <div className={cn("flex flex-wrap items-center justify-between gap-3 px-6 py-6 sm:px-9 sm:py-7", t.band)}>
        <div className="flex flex-col gap-1.5">
          <Eyebrow className={t.eyebrow}>{label}</Eyebrow>
          {description && <p className={cn("text-base", t.text)}>{description}</p>}
        </div>
        {aside}
      </div>
      <div className="p-6 sm:px-9 sm:pt-7 sm:pb-9">{children}</div>
    </section>
  );
}

export type FeatureTone = "sky" | "terracotta" | "lavender" | "plum";

const features: Record<FeatureTone, string> = {
  sky: "bg-sky text-ink",
  terracotta: "bg-terracotta text-ink",
  lavender: "bg-lavender text-ink",
  plum: "bg-plum text-paper",
};

/** Product feature card: 56px radius, filled with a product color. The fill is the elevation. */
export function FeatureCard({ tone, className, ...props }: HTMLAttributes<HTMLDivElement> & { tone: FeatureTone }) {
  return <div className={cn("rounded-feature p-9", features[tone], className)} {...props} />;
}
