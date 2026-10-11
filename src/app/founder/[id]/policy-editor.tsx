"use client";

import { publishPolicy, savePolicyDraft } from "@/app/founder/actions";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { formatDate, shortHash } from "@/lib/format";
import type { Tables } from "@/types/database";
import { useServerAction } from "./use-action";

export function PolicyEditor({
  projectId,
  policies,
  onchainAsset,
}: {
  projectId: string;
  policies: Tables<"reward_policies">[];
  /** Asset fixed onchain at registration; new policy versions must use it. */
  onchainAsset: string | null;
}) {
  const save = useServerAction();
  const publish = useServerAction();
  const draft = policies.find((p) => p.status === "draft") ?? null;
  const published = policies.find((p) => p.status === "published") ?? null;
  const base = draft ?? published;
  const nextVersion = (policies[0]?.version ?? 0) + 1;
  const defaultAsset = onchainAsset
    ? onchainAsset === "0x0000000000000000000000000000000000000000"
      ? "MON"
      : onchainAsset
    : (base?.reward_asset ?? "MON");

  return (
    <div className="flex flex-col gap-6">
      {policies.length > 0 && (
        <ul className="flex flex-col">
          {policies.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 border-b border-mist py-3.5">
              <span className="min-w-0 flex-[1_1_200px] text-base font-bold">
                v{p.version} · {p.title}
              </span>
              <span className="text-sm text-deep-teal">
                {p.contributor_pool_bps !== null ? `${p.contributor_pool_bps / 100}% pool · ` : ""}
                {p.reward_asset === "MON" ? "MON" : shortHash(p.reward_asset)}
              </span>
              {p.policy_hash && (
                <span className="font-mono text-caption text-deep-teal" title={`Published ${formatDate(p.published_at)}`}>
                  {shortHash(p.policy_hash)}
                </span>
              )}
              <Badge tone={p.status === "published" ? "sky" : p.status === "draft" ? "cream" : "neutral"}>
                {p.status === "published" ? "Published" : p.status === "draft" ? "Draft" : "Retired"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <form
        key={draft?.id ?? "new"}
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          save.run(() => savePolicyDraft(projectId, draft?.id ?? null, formData), "Draft saved.");
        }}
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Eyebrow>{draft ? `Draft · v${draft.version}` : `New draft · v${nextVersion}`}</Eyebrow>
          <p className="text-sm text-deep-teal">
            {draft
              ? "Edit the draft, then publish it. Published versions cannot be edited."
              : published
                ? "Published policies are frozen. Saving creates a new draft version."
                : "Define the reward terms contributors will see before they start."}
          </p>
        </div>
        <Field label="Title" className="sm:col-span-2">
          <Input name="title" required minLength={3} maxLength={120} defaultValue={base?.title ?? ""} />
        </Field>
        <Field label="Reward model">
          <Select name="reward_model" defaultValue={base?.reward_model === "funding_share" ? "funding_share" : "bounty"}>
            <option value="bounty">Bounties</option>
            <option value="funding_share">Contributor pool</option>
          </Select>
        </Field>
        <Field label="Contributor pool (%)" hint="Pool only: share of future funding reserved for contributors.">
          <Input
            name="contributor_pool_pct"
            type="number"
            min={0}
            max={100}
            step="0.01"
            defaultValue={base?.contributor_pool_bps != null ? base.contributor_pool_bps / 100 : ""}
          />
        </Field>
        <Field
          label="Reward asset"
          hint={onchainAsset ? "Fixed by the onchain registration." : "MON, or an ERC-20 token address on Monad."}
          className="sm:col-span-2"
        >
          <Input name="reward_asset" defaultValue={defaultAsset} readOnly={!!onchainAsset} required />
        </Field>
        <Field label="Summary" className="sm:col-span-2">
          <Input name="summary" maxLength={500} defaultValue={base?.summary ?? ""} />
        </Field>
        <Field label="Terms" hint="Full terms contributors agree to (Markdown)." className="sm:col-span-2">
          <Textarea name="terms" rows={5} maxLength={20000} defaultValue={base?.terms ?? ""} placeholder="Full terms contributors agree to (Markdown)." />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="secondary" tone="lavender" disabled={save.pending}>
            {draft ? "Save draft" : "Create draft"}
          </Button>
          {draft && (
            <Button
              type="button"
              disabled={publish.pending}
              onClick={() => publish.run(() => publishPolicy(draft.id), "Published. Update the onchain policy hash next.")}
            >
              Publish v{draft.version}
            </Button>
          )}
          <FormMessage {...save.message} />
          <FormMessage {...publish.message} />
        </div>
      </form>
    </div>
  );
}
