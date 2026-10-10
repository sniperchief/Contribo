"use client";

import { publishPolicy, savePolicyDraft } from "@/app/founder/actions";
import { Badge } from "@/components/ui/badge";
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
  const defaultAsset = onchainAsset
    ? onchainAsset === "0x0000000000000000000000000000000000000000"
      ? "MON"
      : onchainAsset
    : (base?.reward_asset ?? "MON");

  return (
    <div className="flex flex-col gap-6">
      {policies.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {policies.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="text-ink">
                v{p.version} · {p.title}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {p.policy_hash && <span className="font-mono">{shortHash(p.policy_hash)}</span>}
                {p.published_at && <span>published {formatDate(p.published_at)}</span>}
                <Badge tone={p.status === "published" ? "success" : p.status === "draft" ? "warning" : "neutral"}>{p.status}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        key={draft?.id ?? "new"}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          save.run(() => savePolicyDraft(projectId, draft?.id ?? null, formData), "Draft saved.");
        }}
      >
        <p className="text-sm text-muted sm:col-span-2">
          {draft
            ? `Editing draft v${draft.version}.`
            : published
              ? "Published policies are frozen. Saving creates a new draft version."
              : "Define the reward terms contributors will see before they start."}
        </p>
        <Field label="Title" className="sm:col-span-2">
          <Input name="title" required minLength={3} maxLength={120} defaultValue={base?.title ?? ""} />
        </Field>
        <Field label="Reward model">
          <Select name="reward_model" defaultValue={base?.reward_model ?? "bounty"}>
            <option value="bounty">Bounties for accepted work</option>
            <option value="funding_share">Share of future funding</option>
            <option value="hybrid">Bounties + funding share</option>
          </Select>
        </Field>
        <Field label="Contributor pool (basis points)" hint="Share of future funding reserved for contributors. 1500 = 15%.">
          <Input name="contributor_pool_bps" type="number" min={0} max={10000} defaultValue={base?.contributor_pool_bps ?? ""} />
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
          <Textarea name="terms" rows={6} maxLength={20000} defaultValue={base?.terms ?? ""} />
        </Field>
        <Field label="Eligibility rules (JSON)" className="sm:col-span-2">
          <Textarea
            name="eligibility"
            rows={3}
            className="font-mono"
            defaultValue={JSON.stringify(base?.eligibility ?? {}, null, 2)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="secondary" disabled={save.pending}>
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
