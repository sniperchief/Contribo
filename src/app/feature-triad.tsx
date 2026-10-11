import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";

/**
 * The landing page's three product cards (Projects · Bounties · Contributor pools).
 * Each card is a link with a mini illustration of the feature, lifts with a single
 * spring on hover, and fades up in a short stagger on load. Motion is skipped for
 * people who prefer reduced motion; hover effects only apply on hover-capable devices.
 */

function Triangle({ fill }: { fill: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="size-7 shrink-0 transition-transform duration-300 ease-spring motion-safe:group-hover:-rotate-12"
    >
      <path d="M50 8 L92 88 L8 88 Z" fill={fill} />
    </svg>
  );
}

function Check({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={cn("size-3.5", className)}>
      <path fill="currentColor" d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4z" />
    </svg>
  );
}

function Lock({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={cn("size-3.5", className)}>
      <path fill="currentColor" d="M6 8V6a4 4 0 1 1 8 0v2h1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm2 0h4V6a2 2 0 1 0-4 0z" />
    </svg>
  );
}

const chip = "inline-flex items-center gap-1.5 rounded-badge px-2.5 py-1 text-caption font-medium";

/** Projects: a verified repository with a locked reward policy. */
function ProjectsIllustration() {
  return (
    <div className="flex flex-col gap-3 rounded-badge bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
          <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0 fill-current">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.71 1.71.75.75 0 0 1-1.06 1.06A2.5 2.5 0 0 1 2 11.5zm10.5-1h-8a1 1 0 0 0-1 1v6.71A2.5 2.5 0 0 1 4.5 9h8z" />
          </svg>
          <span className="truncate">your-org/your-repo</span>
        </span>
        <span className={cn(chip, "bg-sky text-deep-teal")}>
          <Check /> Verified
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={cn(chip, "bg-mist text-deep-teal")}>Policy v1</span>
        <span className={cn(chip, "bg-mist text-deep-teal")}>
          <Lock /> Terms locked
        </span>
      </div>
    </div>
  );
}

/** Bounties: a fixed reward held in escrow. */
function BountyIllustration() {
  return (
    <div className="flex flex-col gap-3 rounded-badge bg-paper p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={cn(chip, "bg-cream text-graphite")}>Bounty</span>
        <span className="flex items-center gap-1.5 text-caption font-medium text-graphite">
          <Lock /> In escrow
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-sm text-graphite">Fixed reward</span>
        <span className="text-body-lg leading-none font-bold">MON</span>
      </div>
    </div>
  );
}

/** Contributor pools: the path from verified work to a claim. */
function PoolIllustration() {
  const steps = ["Verified", "Approved onchain", "Claim"];
  return (
    <ol className="flex flex-col gap-2.5 rounded-badge bg-paper p-4">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step} className={cn("flex items-center gap-2.5 text-sm", last ? "font-bold text-ink" : "text-plum")}>
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full",
                last ? "border-2 border-plum" : "bg-plum text-paper",
              )}
            >
              {!last && <Check className="size-3" />}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}

type Card = {
  id?: string;
  href: string;
  cta: string;
  eyebrow: string;
  title: string;
  body: string;
  card: string;
  muted: string;
  triangle: string;
  illustration: ReactNode;
};

const cards: Card[] = [
  {
    href: "/projects",
    cta: "Explore projects",
    eyebrow: "Projects",
    title: "Find projects worth building on",
    body: "Every listed project shows its verified repos and reward terms before you write any code.",
    card: "bg-sky",
    muted: "text-deep-teal",
    triangle: "var(--deep-teal)",
    illustration: <ProjectsIllustration />,
  },
  {
    id: "bounties",
    href: "/projects?bounties=1",
    cta: "Find bounties",
    eyebrow: "Bounties",
    title: "Fixed rewards for specific tasks",
    body: "Bounty funds are held in escrow onchain, so the reward is there when your work is accepted.",
    card: "bg-terracotta",
    muted: "text-graphite",
    triangle: "var(--graphite)",
    illustration: <BountyIllustration />,
  },
  {
    href: "#solution",
    cta: "How rewards work",
    eyebrow: "Contributor pools",
    title: "Share in what the project becomes",
    body: "Founders set aside a share of future funding for the people who helped build.",
    card: "bg-lavender",
    muted: "text-plum",
    triangle: "var(--plum)",
    illustration: <PoolIllustration />,
  },
];

export function FeatureTriad() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {cards.map((c, index) => (
        // The wrapper owns the entrance animation so it never fights the card's hover transform.
        <div key={c.eyebrow} id={c.id} className="scroll-mt-4 motion-safe:animate-fade-up" style={{ animationDelay: `${index * 80}ms` }}>
          <Link
            href={c.href}
            className={cn(
              "group flex h-full min-h-[380px] flex-col gap-3 rounded-feature p-9 text-ink",
              "transition-transform duration-300 ease-spring hover:text-ink motion-safe:hover:-translate-y-1.5",
              c.card,
            )}
          >
            <Eyebrow className={c.muted}>{c.eyebrow}</Eyebrow>
            <h2 className="text-heading-sm">{c.title}</h2>
            <p className={cn("text-base", c.muted)}>{c.body}</p>
            <div className="mt-auto flex flex-col gap-5 pt-4">
              <div className="transition-transform duration-300 ease-spring motion-safe:group-hover:-translate-y-1">
                {c.illustration}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base font-medium">
                  {c.cta}{" "}
                  <span aria-hidden className="inline-block transition-transform duration-300 ease-spring group-hover:translate-x-1">
                    →
                  </span>
                </span>
                <Triangle fill={c.triangle} />
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}
