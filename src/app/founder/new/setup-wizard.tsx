"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { setupStep, type SetupStep } from "@/lib/project-setup";
import { StepLaunch } from "./step-launch";
import { StepRepository } from "./step-repository";
import { StepRewards } from "./step-rewards";
import type { SetupState } from "./types";

const STEPS: Array<{ step: SetupStep; label: string }> = [
  { step: 1, label: "Repository" },
  { step: 2, label: "Rewards" },
  { step: 3, label: "Launch" },
];

/** The three setup screens, one at a time, with a progress bar. */
export function SetupWizard({ initial, contractReady }: { initial: SetupState; contractReady: boolean }) {
  const [state, setState] = useState(initial);
  const [step, setStep] = useState<SetupStep>(() =>
    setupStep({ hasVerifiedRepo: !!initial.repo?.verified, hasPlan: !!initial.plan && !!initial.copy }),
  );
  const update = (patch: Partial<SetupState>) => setState((current) => ({ ...current, ...patch }));
  const reachable = (target: SetupStep) =>
    target === 1 || (target === 2 && !!state.repo?.verified) || (target === 3 && !!state.plan && !!state.copy);

  const go = (target: SetupStep) => {
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5">
        <Link href="/founder" className="self-start text-sm font-medium text-deep-teal hover:text-ink">
          ← My projects
        </Link>
        <h1 className="text-[32px] leading-[1.09] tracking-[-0.02em] sm:text-heading-lg">
          {state.projectId && state.name ? `Set up ${state.name}` : "Create a project"}
        </h1>
        <ol aria-label="Setup progress" className="grid grid-cols-3 gap-2 sm:gap-3">
          {STEPS.map((item) => {
            const done = item.step < step;
            const current = item.step === step;
            return (
              <li key={item.step}>
                <button
                  type="button"
                  disabled={!reachable(item.step) || current}
                  onClick={() => go(item.step)}
                  aria-current={current ? "step" : undefined}
                  className="flex w-full flex-col gap-2 text-left disabled:cursor-default"
                >
                  <span className={cn("h-1.5 w-full rounded-full transition-colors", done || current ? "bg-ink" : "bg-mist")} />
                  <span className={cn("text-sm font-medium", current ? "text-ink" : "text-deep-teal")}>
                    <span className="hidden sm:inline">Step {item.step} · </span>
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {step === 1 && (
        <StepRepository
          state={state}
          onChange={(patch) => {
            update(patch);
            // Keep the URL resumable once the project exists (no server round trip).
            if (patch.projectId && patch.projectId !== state.projectId) {
              window.history.replaceState(null, "", `/founder/new?project=${patch.projectId}`);
            }
          }}
          onNext={() => go(2)}
        />
      )}
      {step === 2 && state.projectId && (
        <StepRewards state={state as SetupState & { projectId: string }} onSaved={(patch) => update(patch)} onBack={() => go(1)} onNext={() => go(3)} />
      )}
      {step === 3 && state.projectId && state.plan && state.copy && (
        <StepLaunch
          state={state as SetupState & { projectId: string; plan: NonNullable<SetupState["plan"]> }}
          contractReady={contractReady}
          onRegistered={(onchainProjectId) => update({ onchainProjectId })}
          onEdit={go}
        />
      )}
    </div>
  );
}
