import type { TxState } from "@/lib/contracts/tx";
import { activeChain } from "@/lib/monad/chains";
import { cn } from "@/lib/cn";

function txUrl(hash: string) {
  const explorer = activeChain.blockExplorers?.default;
  return explorer ? `${explorer.url}/tx/${hash}` : undefined;
}

/** Inline transaction status. Success is shown only after onchain confirmation. */
export function TxStatus({ state, className }: { state: TxState; className?: string }) {
  if (state.phase === "idle") return null;

  const step = state.step ? `${state.step}: ` : "";
  const link = state.hash && txUrl(state.hash);
  const content = {
    preparing: { tone: "text-muted", text: `${step}checking network and transaction…` },
    "awaiting-signature": { tone: "text-muted", text: `${step}confirm in your wallet…` },
    pending: { tone: "text-warning", text: `${step}submitted, waiting for onchain confirmation…` },
    confirmed: { tone: "text-success", text: `${step}confirmed onchain.` },
    failed: { tone: "text-danger", text: `${step}${state.error?.message ?? "failed."}` },
  }[state.phase];

  return (
    <p role="status" className={cn("text-sm", content.tone, className)}>
      {content.text}{" "}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          View transaction
        </a>
      )}
    </p>
  );
}
