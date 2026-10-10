"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FormMessage } from "@/components/ui/field";
import { WalletLink } from "@/components/wallet/wallet-link";
import { cn } from "@/lib/cn";
import { homeFor, type PrimaryRole } from "@/lib/profile";
import { completeOnboarding, setPrimaryRole } from "./actions";

const roles: Array<{ id: PrimaryRole; title: string; body: string; card: string; eyebrow: string; text: string }> = [
  {
    id: "contributor",
    title: "Contribute to projects",
    body: "Find Monad projects with published reward terms, open pull requests, and claim rewards for accepted work.",
    card: "bg-lavender",
    eyebrow: "text-plum",
    text: "text-plum",
  },
  {
    id: "founder",
    title: "Launch a project",
    body: "Verify your repositories, publish reward terms, fund bounties or a pool, and review contributions.",
    card: "bg-sky",
    eyebrow: "text-deep-teal",
    text: "text-deep-teal",
  },
];

const walletCopy: Record<PrimaryRole, string> = {
  contributor: "Rewards approved for your pull requests are reserved for this wallet onchain, and you claim them with it.",
  founder: "This wallet will own your projects onchain and fund bounties and contributor pools.",
};

export function WelcomeFlow({
  userId,
  initialRole,
  linkedWallet,
  next,
}: {
  userId: string;
  initialRole: PrimaryRole | null;
  linkedWallet: string | null;
  /** Page the user was heading to before signing in, if any. */
  next: string | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState<PrimaryRole | null>(initialRole);
  const [step, setStep] = useState<1 | 2>(initialRole ? 2 : 1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(choice: PrimaryRole) {
    setError(null);
    startTransition(async () => {
      const result = await setPrimaryRole(choice);
      if (!result.ok) return setError(result.error);
      setRole(choice);
      setStep(2);
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const result = await completeOnboarding();
      if (!result.ok) return setError(result.error);
      router.push(next ?? homeFor(role));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <ol className="flex items-center gap-3 text-sm font-medium" aria-label="Progress">
        {["Your role", "Payout wallet"].map((label, index) => {
          const current = step === index + 1;
          const done = step > index + 1;
          return (
            <li key={label} className="flex items-center gap-3" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full text-sm font-bold",
                  current ? "bg-ink text-paper" : done ? "bg-lavender text-plum" : "bg-mist text-deep-teal",
                )}
              >
                {index + 1}
              </span>
              <span className={current ? "text-ink" : "text-deep-teal"}>{label}</span>
              {index === 0 && <span aria-hidden className="h-px w-8 bg-mist sm:w-16" />}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Eyebrow>Step 1 of 2</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">What brings you to Contribo?</h1>
            <p className="text-body-lg text-deep-teal">
              We&apos;ll tailor where you start. You can switch any time from your profile, and you can always do both.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {roles.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={pending}
                onClick={() => choose(option.id)}
                aria-pressed={role === option.id}
                className={cn(
                  "flex min-h-[260px] flex-col items-start gap-3 rounded-feature p-9 text-left transition-transform hover:-translate-y-1 disabled:opacity-60",
                  option.card,
                  role === option.id && "ring-4 ring-ink",
                )}
              >
                <Eyebrow className={option.eyebrow}>{option.id === "contributor" ? "Contributor" : "Founder"}</Eyebrow>
                <span className="text-heading-sm font-bold">{option.title}</span>
                <span className={cn("text-base", option.text)}>{option.body}</span>
                <span className="mt-auto text-base font-medium">Choose →</span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Eyebrow>Step 2 of 2</Eyebrow>
            <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">Link your payout wallet</h1>
            <p className="max-w-2xl text-body-lg text-deep-teal">{walletCopy[role ?? "contributor"]}</p>
          </div>
          <div className="flex flex-col gap-6 rounded-card bg-paper p-6 sm:p-9">
            <WalletLink userId={userId} linkedWallet={linkedWallet} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {linkedWallet ? (
              <Button size="lg" onClick={finish} disabled={pending}>
                Continue
              </Button>
            ) : (
              <Button variant="secondary" size="lg" onClick={finish} disabled={pending}>
                Skip for now
              </Button>
            )}
            <Button variant="ghost" size="lg" onClick={() => setStep(1)} disabled={pending}>
              ← Change role
            </Button>
          </div>
          {!linkedWallet && (
            <p className="text-sm text-deep-teal">
              You can link a wallet later from your profile. You&apos;ll need one before rewards can be approved to you or a project
              can be registered onchain.
            </p>
          )}
        </section>
      )}
      <FormMessage error={error} />
    </div>
  );
}
