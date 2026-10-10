import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

const steps = [
  {
    title: "Founders publish the terms",
    body: "Register a project, link its GitHub repositories and publish a reward policy before anyone writes a line of code.",
  },
  {
    title: "Developers contribute",
    body: "Pick up issues and open pull requests the way you already do. No new workflow, just your GitHub account.",
  },
  {
    title: "Work is verified",
    body: "Merged pull requests are matched to your linked GitHub identity and recorded in your contribution history.",
  },
  {
    title: "Rewards follow success",
    body: "Accepted work qualifies for bounties and funding-triggered contributor pools, committed transparently on Monad.",
  },
];

function ContributionPreview() {
  return (
    <Card className="w-full max-w-md overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-muted">example/monad-sdk</span>
        <Badge tone="accent">Reward policy v1</Badge>
      </div>
      <ul className="divide-y divide-line">
        {[
          { pr: "#482", title: "Batch RPC requests in the client", status: "Accepted", tone: "success" as const },
          { pr: "#476", title: "Add typed event decoding", status: "Verified", tone: "accent" as const },
          { pr: "#471", title: "Fix nonce race on parallel sends", status: "In review", tone: "neutral" as const },
        ].map((item) => (
          <li key={item.pr} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{item.title}</p>
              <p className="font-mono text-xs text-subtle">Pull request {item.pr}</p>
            </div>
            <Badge tone={item.tone}>{item.status}</Badge>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between bg-surface-sunken px-5 py-3 text-xs text-muted">
        <span>Contributor pool</span>
        <span className="font-mono font-medium text-ink">15% of future funding</span>
      </div>
    </Card>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex flex-col items-start gap-6">
            <Badge tone="accent">For the Monad developer ecosystem</Badge>
            <h1 className="text-4xl leading-[1.08] font-bold text-ink sm:text-5xl lg:text-6xl">
              Build together.
              <br />
              Get recognized.
              <br />
              <span className="text-accent">Share in the success.</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Contribo connects founders building open-source projects on Monad with developers who
              want to help. Reward terms are published up front, contributions are verified through
              GitHub, and the people who build a project share in what it becomes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/login" className={buttonStyles({ size: "lg" })}>
                Get started with GitHub
              </Link>
              <Link href="#how-it-works" className={buttonStyles({ variant: "secondary", size: "lg" })}>
                How it works
              </Link>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ContributionPreview />
          </div>
        </Container>
      </section>

      <section id="how-it-works" className="scroll-mt-20 border-b border-line py-16 sm:py-24">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-sm font-medium text-accent">How it works</p>
            <h2 className="text-3xl font-bold text-ink sm:text-4xl">
              Commitments first. Contributions next. Recognition always.
            </h2>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardHeader>
                    <span className="font-mono text-xs text-subtle">0{index + 1}</span>
                    <CardTitle>{step.title}</CardTitle>
                    <CardDescription>{step.body}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="py-16 sm:py-24">
        <Container className="grid gap-4 md:grid-cols-2">
          <Card id="founders" className="scroll-mt-20">
            <CardHeader>
              <p className="text-sm font-medium text-accent">For founders</p>
              <CardTitle className="text-2xl">Attract builders who stay</CardTitle>
              <CardDescription>
                Publish your repositories and a clear reward policy. Contributors know exactly what
                they are working toward, and your commitments are visible to everyone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                <li>· Versioned reward policies that cannot change after publishing</li>
                <li>· Bounties and contributor pools tied to future funding</li>
                <li>· A verified record of who built what</li>
              </ul>
            </CardContent>
          </Card>
          <Card id="contributors" className="scroll-mt-20">
            <CardHeader>
              <p className="text-sm font-medium text-accent">For contributors</p>
              <CardTitle className="text-2xl">Turn pull requests into a track record</CardTitle>
              <CardDescription>
                Find promising Monad projects, contribute through GitHub, and build a portable
                history of accepted work that qualifies you for rewards.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm text-ink-soft">
                <li>· Sign in with GitHub, no new workflow</li>
                <li>· Contribution history verified against merged PRs</li>
                <li>· Rewards paid to your Monad wallet</li>
              </ul>
            </CardContent>
          </Card>
        </Container>
      </section>
    </>
  );
}
