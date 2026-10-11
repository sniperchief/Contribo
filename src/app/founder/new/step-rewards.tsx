"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { activeChain } from "@/lib/monad/chains";
import {
  defaultTerms,
  MAX_SETUP_BOUNTIES,
  planTotal,
  validateSetupPlan,
  type PlannedBounty,
  type SetupPlan,
  type SetupRewardType,
} from "@/lib/project-setup";
import { getAssetInfo, saveSetupRewards } from "./actions";
import { SetupCard, SetupHeading } from "./setup-card";
import type { SetupState } from "./types";

const DEADLINES = [7, 14, 30, 60, 90];
const emptyBounty = (): PlannedBounty => ({ title: "", amount: "", days: 30 });

const TYPES: Array<{ type: SetupRewardType; title: string; text: string; accent: string }> = [
  {
    type: "bounty",
    title: "Bounties",
    text: "Pay a fixed amount for specific tasks. Each bounty is escrowed onchain before work starts.",
    accent: "bg-terracotta",
  },
  {
    type: "funding_share",
    title: "Contributor pool",
    text: "Reserve a share of your funding for contributors and reward accepted work from the pool.",
    accent: "bg-sky",
  },
];

/** Step 2: choose bounties OR a contributor pool, fund it, and confirm the terms. */
export function StepRewards({
  state,
  onSaved,
  onBack,
  onNext,
}: {
  state: SetupState & { projectId: string };
  onSaved: (patch: Partial<SetupState>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const locked = !!state.onchainProjectId;
  const initial = state.plan;
  const [type, setType] = useState<SetupRewardType | null>(initial?.type ?? null);
  const [useToken, setUseToken] = useState(!!initial && initial.asset !== "MON");
  const [token, setToken] = useState(initial && initial.asset !== "MON" ? initial.asset : "");
  const [tokenInfo, setTokenInfo] = useState<{ address: string; symbol: string | null; error: string | null } | null>(null);
  const [bounties, setBounties] = useState<PlannedBounty[]>(initial?.bounties.length ? initial.bounties : [emptyBounty()]);
  const [poolPercent, setPoolPercent] = useState(initial?.poolPercent ?? 15);
  const [deposit, setDeposit] = useState(initial?.deposit ?? "");
  const [editingTerms, setEditingTerms] = useState(false);
  const [customCopy, setCustomCopy] = useState(state.copy);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const asset = useToken ? token.trim() : "MON";

  // Token symbol for labels, once a valid token address is entered.
  const tokenAddress = useToken && /^0x[0-9a-fA-F]{40}$/.test(token.trim()) ? token.trim() : null;
  useEffect(() => {
    if (!tokenAddress) return;
    let cancelled = false;
    void getAssetInfo(tokenAddress).then((result) => {
      if (!cancelled) {
        setTokenInfo(result.ok ? { address: tokenAddress, symbol: result.data.symbol, error: null } : { address: tokenAddress, symbol: null, error: result.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenAddress]);
  const currentToken = tokenInfo && tokenInfo.address === tokenAddress ? tokenInfo : null;
  const symbol = useToken ? (currentToken?.symbol ?? "tokens") : activeChain.nativeCurrency.symbol;
  const tokenError = useToken ? (currentToken?.error ?? null) : null;

  const autoCopy = type ? defaultTerms({ type, poolPercent }, symbol) : null;
  // Terms follow the choices until the founder edits them.
  const copy = customCopy ?? autoCopy;

  const plan: Partial<SetupPlan> | null = type && {
    type,
    asset,
    poolPercent: type === "funding_share" ? poolPercent : null,
    deposit: type === "funding_share" ? deposit : null,
    bounties: type === "bounty" ? bounties : [],
  };
  const check = plan ? validateSetupPlan(plan) : null;
  const total = check?.ok ? planTotal(check.plan) : null;

  function save() {
    setError(null);
    if (!check) return setError("Choose bounties or a contributor pool.");
    if (!check.ok) return setError(check.error);
    if (tokenError) return setError(tokenError);
    if (!copy) return;
    startTransition(async () => {
      const result = await saveSetupRewards(state.projectId, check.plan, copy);
      if (!result.ok) return setError(result.error);
      onSaved({ plan: check.plan, copy });
      onNext();
    });
  }

  const setBounty = (index: number, patch: Partial<PlannedBounty>) =>
    setBounties((list) => list.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  return (
    <SetupCard>
      <SetupHeading
        title="How will you reward contributors?"
        description={
          locked
            ? "Your project is registered onchain, so the reward type and token are fixed. You can still change the funding."
            : "Choose one. A project uses either bounties or a contributor pool."
        }
      />

      <div role="radiogroup" aria-label="Reward type" className="grid gap-4 sm:grid-cols-2">
        {TYPES.map((option) => {
          const selected = type === option.type;
          return (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked && !selected}
              onClick={() => {
                setType(option.type);
                setError(null);
              }}
              className={cn(
                "relative flex flex-col gap-3 rounded-badge border-2 p-5 text-left transition-colors disabled:opacity-50",
                selected ? "border-ink bg-paper" : "border-mist bg-paper hover:border-sky",
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className={cn("size-3 rounded-full", option.accent)} />
                  <span className="text-body-lg font-bold text-ink">{option.title}</span>
                </span>
                <span
                  aria-hidden
                  className={cn("grid size-5 place-items-center rounded-full border-2", selected ? "border-ink bg-ink" : "border-mist")}
                >
                  {selected && <span className="size-1.5 rounded-full bg-paper" />}
                </span>
              </span>
              <span className="text-sm text-deep-teal">{option.text}</span>
            </button>
          );
        })}
      </div>

      {type && (
        <>
          <div className="flex flex-col gap-3 border-t border-mist pt-6">
            <p className="text-sm font-medium text-ink">Paid in</p>
            {useToken ? (
              <div className="flex flex-col gap-2">
                <Input
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Token address on Monad (0x…)"
                  aria-label="Token address"
                  readOnly={locked}
                  className="font-mono text-sm"
                />
                {tokenError && <p className="text-sm text-danger">{tokenError}</p>}
                {!locked && (
                  <button type="button" onClick={() => setUseToken(false)} className="self-start text-sm font-medium text-deep-teal hover:text-ink">
                    Pay in {activeChain.nativeCurrency.symbol} instead
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <span className="rounded-control border-2 border-ink px-4 py-2 text-base font-bold">{activeChain.nativeCurrency.symbol}</span>
                {!locked && (
                  <button type="button" onClick={() => setUseToken(true)} className="text-sm font-medium text-deep-teal hover:text-ink">
                    Use a token instead
                  </button>
                )}
              </div>
            )}
          </div>

          {type === "bounty" ? (
            <div className="flex flex-col gap-4 border-t border-mist pt-6">
              <SetupHeading title="Your bounties" description="Add at least one. Each is escrowed at launch and can be reclaimed after its deadline if no one completes it." />
              <ul className="flex flex-col gap-3">
                {bounties.map((bounty, index) => (
                  <li key={index} className="grid gap-3 rounded-badge border-2 border-mist p-4 sm:grid-cols-[1fr_140px_130px_auto] sm:items-end">
                    <Field label={`Bounty ${index + 1}`}>
                      <Input value={bounty.title} onChange={(e) => setBounty(index, { title: e.target.value })} placeholder="e.g. Add dark mode to the dashboard" maxLength={120} />
                    </Field>
                    <Field label={`Amount (${symbol})`}>
                      <Input value={bounty.amount} onChange={(e) => setBounty(index, { amount: e.target.value })} inputMode="decimal" placeholder="100" />
                    </Field>
                    <Field label="Deadline">
                      <Select value={bounty.days} onChange={(e) => setBounty(index, { days: Number(e.target.value) })}>
                        {(DEADLINES.includes(bounty.days) ? DEADLINES : [...DEADLINES, bounty.days].sort((a, b) => a - b)).map((d) => (
                          <option key={d} value={d}>
                            {d} days
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {bounties.length > 1 && (
                      <Button size="sm" variant="ghost" className="px-2 text-sm" onClick={() => setBounties((list) => list.filter((_, i) => i !== index))}>
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {bounties.length < MAX_SETUP_BOUNTIES && (
                <Button variant="secondary" tone="terracotta" className="self-start" onClick={() => setBounties((list) => [...list, emptyBounty()])}>
                  + Add another bounty
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5 border-t border-mist pt-6">
              <SetupHeading title="Your contributor pool" />
              <label className="flex flex-col gap-3">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">Share of future funding for contributors</span>
                  <span className="text-heading-sm font-bold">{poolPercent}%</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={poolPercent}
                  disabled={locked}
                  onChange={(e) => setPoolPercent(Number(e.target.value))}
                  className="w-full accent-[var(--ink)]"
                />
              </label>
              <Field label={`First deposit (${symbol})`} hint="Locked in the Contribo vault at launch. You can add more any time.">
                <Input value={deposit} onChange={(e) => setDeposit(e.target.value)} inputMode="decimal" placeholder="500" />
              </Field>
            </div>
          )}

          {total && (
            <p className="rounded-badge bg-fog px-5 py-4 text-base text-deep-teal">
              You&apos;ll lock <strong className="text-ink">{total} {symbol}</strong> in the Contribo vault at launch.
            </p>
          )}

          {copy && (
            <div className="flex flex-col gap-3 rounded-badge border-2 border-mist p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base font-bold">Reward terms</p>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!customCopy) setCustomCopy(copy);
                      setEditingTerms((v) => !v);
                    }}
                    className="text-sm font-medium text-deep-teal hover:text-ink"
                  >
                    {editingTerms ? "Done" : "Edit terms"}
                  </button>
                )}
              </div>
              {editingTerms && customCopy ? (
                <div className="flex flex-col gap-4">
                  <Field label="Summary">
                    <Input value={customCopy.summary} onChange={(e) => setCustomCopy({ ...customCopy, summary: e.target.value })} maxLength={500} />
                  </Field>
                  <Field label="Terms">
                    <Textarea rows={8} value={customCopy.terms} onChange={(e) => setCustomCopy({ ...customCopy, terms: e.target.value })} maxLength={20000} />
                  </Field>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCopy(null);
                      setEditingTerms(false);
                    }}
                    className="self-start text-sm font-medium text-deep-teal hover:text-ink"
                  >
                    Reset to the default terms
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-deep-teal">{copy.summary}</p>
                  <p className="line-clamp-3 text-sm whitespace-pre-line text-deep-teal">{copy.terms}</p>
                </>
              )}
            </div>
          )}
        </>
      )}

      <FormMessage error={error} />

      <div className="flex items-center justify-between gap-3 border-t border-mist pt-6">
        <Button variant="ghost" onClick={onBack}>
          ← Back
        </Button>
        <Button size="lg" disabled={pending || !type} onClick={save}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </SetupCard>
  );
}
