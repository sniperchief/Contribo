"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useConfig, useConnection } from "wagmi";
import { signMessage } from "wagmi/actions";
import { linkWallet, unlinkWallet } from "@/app/contributions/actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { describeTxError } from "@/lib/contracts/tx";
import { shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { buildWalletLinkMessage } from "@/lib/wallet/link-message";

/** Links the connected wallet to the account by signing a user-bound message (no transaction, no gas). */
export function WalletLink({ userId, linkedWallet }: { userId: string; linkedWallet: string | null }) {
  const router = useRouter();
  const config = useConfig();
  const { address } = useConnection();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  const connectedIsLinked = !!address && address.toLowerCase() === linkedWallet?.toLowerCase();

  function link() {
    if (!address) return;
    setMessage({});
    startTransition(async () => {
      try {
        const text = buildWalletLinkMessage({
          userId,
          address,
          chainId: activeChain.id,
          nonce: crypto.randomUUID(),
          issuedAt: new Date().toISOString(),
        });
        const signature = await signMessage(config, { account: address, message: text });
        const result = await linkWallet(text, signature);
        setMessage(result.ok ? { success: "Wallet linked and verified." } : { error: result.error });
        if (result.ok) router.refresh();
      } catch (error) {
        setMessage({ error: describeTxError(error).message });
      }
    });
  }

  function unlink() {
    setMessage({});
    startTransition(async () => {
      const result = await unlinkWallet();
      setMessage(result.ok ? { success: "Wallet unlinked." } : { error: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {linkedWallet ? (
        <p className="text-ink">
          Verified payout wallet: <span className="font-mono">{shortAddress(linkedWallet)}</span>
        </p>
      ) : (
        <p className="text-muted">No verified wallet yet. Rewards can only be approved to a verified wallet.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ConnectWalletButton />
        {address && !connectedIsLinked && (
          <Button size="sm" onClick={link} disabled={pending}>
            {pending ? "Waiting for signature…" : linkedWallet ? "Replace with connected wallet" : "Link connected wallet"}
          </Button>
        )}
        {linkedWallet && (
          <Button size="sm" variant="ghost" onClick={unlink} disabled={pending}>
            Unlink
          </Button>
        )}
      </div>
      <p className="text-xs text-subtle">Linking asks your wallet to sign a message. It does not send a transaction.</p>
      <FormMessage error={message.error} success={message.success} />
    </div>
  );
}
