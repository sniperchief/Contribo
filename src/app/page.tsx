import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { FeatureCard } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { contriboRewards } from "@/lib/contracts/config";
import { formatAmount } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { readTotalPaid } from "@/lib/server/chain";
import { cn } from "@/lib/cn";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { reveal } from "@/lib/reveal";
import { Faq } from "./faq";
import { FeatureTriad } from "./feature-triad";
import { ChangingTermsIllustration, ScatteredIllustration, UnrecordedIllustration } from "./problem-illustrations";

const problems = [
  {
    title: "Your work goes unrecorded",
    body: "Merged pull requests disappear into a commit log with nothing to show for them.",
    illustration: <UnrecordedIllustration />,
  },
  {
    title: "Promises change later",
    body: "Reward terms are often vague, and they can shift after the work is already done.",
    illustration: <ChangingTermsIllustration />,
  },
  {
    title: "No clear place to start",
    body: "Good projects and paid tasks are spread across chats, forums and repos.",
    illustration: <ScatteredIllustration />,
  },
];

const faqs = [
  {
    q: "What is Contribo?",
    a: "A contributor rewards platform for the Monad ecosystem. Founders publish reward terms for their open-source projects, and developers earn rewards when their pull requests are accepted.",
  },
  {
    q: "How do I get started as a contributor?",
    a: "Sign in with GitHub, link a payout wallet by signing a message, then pick a project and open pull requests as you normally would.",
  },
  {
    q: "What is the difference between bounties and contributor pools?",
    a: "A bounty is a fixed reward for a specific task, held in escrow. A contributor pool is a share of the project's funds that approvers award for accepted work.",
  },
  {
    q: "How is my work verified?",
    a: "We check each pull request on GitHub: it must be merged, in a verified repo, authored by your linked account, and merged while a reward policy was published.",
  },
  {
    q: "Can a founder take back my reward?",
    a: "Not once it is approved onchain. Approved rewards are locked for you, and only you can claim them.",
  },
  {
    q: "Which blockchain does Contribo use?",
    a: "Monad. Rewards can be paid in MON or an ERC-20 token chosen by the project.",
  },
];

/** Decorative organic shape (background atmosphere only), gently floating like a bubble. */
function Blob({
  d,
  fill,
  className,
  motion,
  duration,
  delay,
}: {
  d: string;
  fill: string;
  className: string;
  motion: "float" | "drift";
  /** Seconds per cycle; different values keep the shapes out of sync. */
  duration: number;
  /** Negative offset (seconds) so shapes start mid-cycle instead of all at rest. */
  delay: number;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      style={{ "--float-duration": `${duration}s`, animationDelay: `${delay}s` } as React.CSSProperties}
      className={cn(
        "pointer-events-none absolute hidden opacity-70 will-change-transform md:block",
        motion === "float" ? "motion-safe:animate-float" : "motion-safe:animate-drift",
        className,
      )}
    >
      <path d={d} fill={fill} />
    </svg>
  );
}

function Triangle({ fill, className }: { fill: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className={cn("size-7 shrink-0", className)}>
      <path d="M50 8 L92 88 L8 88 Z" fill={fill} />
    </svg>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
  center,
  as: Heading = "h2",
  size = "heading",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  center?: boolean;
  as?: "h2" | "h3";
  size?: "heading" | "heading-lg";
}) {
  return (
    <div {...reveal()} className={cn("flex flex-col gap-4", center ? "items-center text-center" : "max-w-2xl")}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading className={cn(size === "heading-lg" ? "text-[32px] leading-[1.09] tracking-[-0.02em] md:text-heading-lg" : "text-heading", "max-w-3xl")}>
        {title}
      </Heading>
      {body && <p className="max-w-xl text-body-lg text-deep-teal">{body}</p>}
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-20">
        <Blob motion="float" duration={9} delay={-2} className="top-14 left-[5%] size-[120px]" fill="var(--terracotta)" d="M150 32c28 20 42 58 30 92s-46 66-86 66-72-26-80-62 10-74 40-94 68-22 96-2z" />
        <Blob motion="drift" duration={12} delay={-5} className="top-10 right-[6%] size-[90px]" fill="var(--lavender)" d="M164 70c14 36-2 82-36 100s-82 12-104-18S6 70 38 42 150 34 164 70z" />
        <Blob motion="drift" duration={10} delay={-1} className="top-[330px] left-[10%] size-16" fill="var(--sky)" d="M100 12c40 0 84 22 88 62s-30 60-44 90-56 34-84 18S12 130 14 92 60 12 100 12z" />
        <Blob motion="float" duration={11} delay={-6} className="top-[300px] right-[9%] size-[104px]" fill="var(--cream)" d="M58 20c34-16 98-8 120 28s4 92-34 118-96 22-118-14S24 36 58 20z" />

        <Container className="relative flex flex-col items-center gap-6 text-center">
          <Eyebrow>New opportunities on Monad</Eyebrow>
          <h1 className="max-w-[820px] text-[40px] leading-none tracking-[-0.03em] md:text-display">Open-source work, finally rewarded.</h1>
          <p className="max-w-[600px] text-body-lg text-deep-teal">
            Contribo connects founders building on Monad with developers who want to help. Reward terms are published up
            front, pull requests are verified on GitHub, and accepted work is paid onchain.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/projects" className={buttonStyles({ size: "lg" })}>
              Explore projects
            </Link>
            <Link href="#bounties" className={buttonStyles({ variant: "secondary", tone: "terracotta", size: "lg" })}>
              View bounties
            </Link>
          </div>
        </Container>

        <Container className="relative mt-16">
          <FeatureTriad />
        </Container>
      </section>

      {/* Problem */}
      <section id="problem" className="scroll-mt-4 py-20">
        <Container className="flex flex-col gap-10">
          <SectionIntro
            eyebrow="The problem"
            title="Talent is everywhere. Rewards are scattered."
            body="Developers help open-source projects grow every day, yet most of that work goes unpaid and unrecognized."
          />
          <div className="grid gap-5 md:grid-cols-3">
            {problems.map((item, index) => (
              <article
                key={item.title}
                {...reveal(index * 100)}
                className="flex min-h-[460px] flex-col gap-3 rounded-[28px] bg-paper px-9 pt-12 pb-9 sm:px-12"
              >
                <h3 className="text-[22px] leading-tight font-bold tracking-[-0.02em]">{item.title}</h3>
                <p className="max-w-[300px] text-body-lg leading-snug text-deep-teal/80">{item.body}</p>
                <div className="grid flex-1 place-items-center pt-8">{item.illustration}</div>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {/* Quote */}
      <section className="relative overflow-hidden bg-ink py-32 text-paper sm:py-44">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 0%, rgba(31, 23, 56, 0.95), transparent 75%), radial-gradient(45% 55% at 50% 15%, rgba(203, 176, 235, 0.18), transparent 70%), radial-gradient(35% 50% at 12% 0%, rgba(165, 200, 216, 0.12), transparent 70%)",
          }}
        />
        <Container className="relative flex flex-col items-center gap-8 text-center">
          <blockquote {...reveal()} className="max-w-4xl font-serif text-[44px] leading-[1.02] tracking-[-0.01em] sm:text-[64px] lg:text-[76px]">
            &ldquo;Founders set the terms.
            <br />
            Builders ship the work. Monad keeps the promise.&rdquo;
          </blockquote>
        </Container>
      </section>

      {/* Solution */}
      <section id="solution" className="scroll-mt-4 py-20">
        <Container className="flex flex-col gap-20">
          <SectionIntro
            center
            size="heading-lg"
            eyebrow="The solution"
            title="One platform. Every contribution counts."
            body="Discover projects, pick up paid work and build a verified track record, all in one place."
          />

          <div className="flex flex-wrap items-center gap-14">
            <FeatureCard {...reveal()} tone="sky" className="relative flex min-h-[420px] flex-[1_1_460px] items-center justify-center p-8 sm:p-12">
              <Triangle fill="var(--deep-teal)" className="absolute top-11 right-12 size-9" />
              <div className="flex w-full max-w-[380px] flex-col gap-3.5 rounded-card bg-paper p-7">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-lg font-bold">Example project</span>
                  <Badge className="px-4 py-2">Verified</Badge>
                </div>
                <p className="text-sm text-deep-teal">example-org/sdk</p>
                <div className="h-px bg-mist" />
                <div className="flex justify-between text-sm text-deep-teal">
                  <span>Reward model</span>
                  <span className="font-bold text-ink">Hybrid</span>
                </div>
                <div className="flex justify-between text-sm text-deep-teal">
                  <span>Policy</span>
                  <span className="font-bold text-ink">v1 · locked</span>
                </div>
              </div>
            </FeatureCard>
            <div {...reveal(120)} className="flex min-w-0 flex-[1_1_400px] flex-col items-start gap-4">
              <Eyebrow>Open-source projects</Eyebrow>
              <h3 className="text-heading">Know the terms before you start</h3>
              <p className="text-body-lg text-deep-teal">
                Founders verify their GitHub repos and publish a reward policy. Once published, it can&apos;t be edited, only
                replaced with a new version.
              </p>
              <Link href="/projects" className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2 text-deep-teal" })}>
                Explore projects
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap-reverse items-center gap-14">
            <div {...reveal(120)} className="flex min-w-0 flex-[1_1_400px] flex-col items-start gap-4">
              <Eyebrow>Bounties</Eyebrow>
              <h3 className="text-heading">Pick a task. Ship it. Get paid.</h3>
              <p className="text-body-lg text-deep-teal">
                Each bounty has a fixed reward held in escrow on Monad. Open a pull request the way you already do, and claim
                once it&apos;s accepted.
              </p>
              <Link href="/projects" className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2 text-graphite" })}>
                View bounties
              </Link>
            </div>
            <FeatureCard {...reveal()} tone="terracotta" className="relative flex min-h-[420px] flex-[1_1_460px] items-center justify-center p-8 sm:p-12">
              <Triangle fill="var(--graphite)" className="absolute bottom-11 left-12 size-9" />
              <div className="flex w-full max-w-[380px] flex-col gap-3.5 rounded-card bg-paper p-7">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone="cream" className="px-4 py-2">Bounty</Badge>
                  <span className="text-sm text-graphite">Example</span>
                </div>
                <p className="text-body-lg leading-snug font-bold">Add typed event decoding</p>
                <div className="h-px bg-mist" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-graphite">Reward in escrow</span>
                  <span className="text-xl font-bold">Fixed, in MON</span>
                </div>
                <Link href="/projects" className={buttonStyles({ className: "w-full" })}>
                  Find bounties
                </Link>
              </div>
            </FeatureCard>
          </div>

          <div className="flex flex-wrap items-center gap-14">
            <FeatureCard {...reveal()} tone="lavender" className="relative flex min-h-[420px] flex-[1_1_460px] items-center justify-center p-8 sm:p-12">
              <Triangle fill="var(--plum)" className="absolute right-12 bottom-11 size-9" />
              <div className="flex w-full max-w-[380px] flex-col gap-3 rounded-card bg-paper p-7">
                <Eyebrow className="text-plum">Your reward</Eyebrow>
                {["Verified on GitHub", "Accepted by an approver", "Approved onchain"].map((step) => (
                  <div key={step} className="flex items-center gap-2.5 text-sm text-plum">
                    <span className="size-3 shrink-0 rounded-full bg-plum" />
                    {step}
                  </div>
                ))}
                <div className="flex items-center gap-2.5 text-sm font-bold">
                  <span className="size-3 shrink-0 rounded-full border-2 border-plum" />
                  Ready to claim
                </div>
              </div>
            </FeatureCard>
            <div {...reveal(120)} className="flex min-w-0 flex-[1_1_400px] flex-col items-start gap-4">
              <Eyebrow>Contributor pools</Eyebrow>
              <h3 className="text-heading">Once approved, the reward is yours</h3>
              <p className="text-body-lg text-deep-teal">
                Approved rewards are locked in the contract. No one can withdraw or redirect them, and you can claim to any
                wallet you choose.
              </p>
              <Link href="/login" className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2 text-plum" })}>
                Get started
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* Total distributed */}
      <section className="py-20">
        <Container>
          <FeatureCard {...reveal()} tone="plum" className="flex flex-wrap items-center justify-between gap-8 p-10 md:p-[72px]">
            <div className="flex max-w-[480px] flex-col gap-3">
              <Eyebrow className="text-lavender">Total distributed</Eyebrow>
              <h2 className="text-heading text-paper">Paid to contributors, onchain</h2>
              <p className="text-base text-mist">Every reward is recorded on Monad, so anyone can check it.</p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <Suspense fallback={<p className="text-[40px] leading-none font-bold tracking-[-0.03em] text-paper md:text-display">…</p>}>
                <TotalDistributed />
              </Suspense>
            </div>
          </FeatureCard>
        </Container>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-4 bg-paper py-20">
        <Container className="flex flex-wrap gap-x-20 gap-y-10">
          <div {...reveal()} className="flex flex-[1_1_320px] flex-col items-start gap-4 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="text-heading">Frequently asked questions</h2>
            <p className="text-body-lg text-deep-teal">Everything you need to know about Contribo.</p>
            <a
              href="https://github.com/sniperchief/Contribo#readme"
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: "ghost", arrow: true, className: "mt-2 gap-2 text-deep-teal" })}
            >
              Read the documentation
            </a>
          </div>
          <div {...reveal(120)} className="min-w-0 flex-[2_1_520px]">
            <Faq items={faqs} />
          </div>
        </Container>
      </section>

      <ScrollReveal />
    </>
  );
}

async function TotalDistributed() {
  // Chain reads happen per request, never during prerendering.
  await connection();
  let total: bigint | null = null;
  if (contriboRewards) {
    try {
      total = await readTotalPaid();
    } catch {
      total = null;
    }
  }
  const explorer = activeChain.blockExplorers?.default;

  return (
    <>
      <p className="text-[40px] leading-none font-bold tracking-[-0.03em] text-paper md:text-display">
        {total === null ? "—" : formatAmount(total, 18, activeChain.nativeCurrency.symbol)}
      </p>
      {contriboRewards && explorer ? (
        <a
          href={`${explorer.url}/address/${contriboRewards.address}`}
          target="_blank"
          rel="noreferrer"
          className={buttonStyles({ variant: "ghost", arrow: true, className: "gap-2 text-lavender hover:text-paper" })}
        >
          View on explorer
        </a>
      ) : (
        <p className="text-sm text-mist">Shown once the rewards contract is live.</p>
      )}
    </>
  );
}
