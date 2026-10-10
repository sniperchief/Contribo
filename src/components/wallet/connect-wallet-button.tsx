"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { cn } from "@/lib/cn";

const pill = "inline-flex h-11 items-center gap-2 rounded-control px-4 text-sm font-medium transition-colors";

/**
 * Opens the RainbowKit modal: detected browser wallets first, plus recommended
 * wallets with download links when none is installed. Once connected it shows
 * the network and address, or a prompt to switch to Monad.
 */
export function ConnectWalletButton({ className }: { className?: string }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openConnectModal, openAccountModal, openChainModal }) => {
        const ready = mounted;
        if (!ready) {
          return <span aria-hidden className={cn(pill, "w-36 animate-pulse bg-mist", className)} />;
        }
        if (!account || !chain) {
          return (
            <button type="button" onClick={openConnectModal} className={cn(pill, "bg-ink text-paper hover:bg-plum", className)}>
              <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="6" width="18" height="13" rx="3" />
                <path d="M3 10h18M16 14.5h2" />
              </svg>
              Connect wallet
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className={cn(pill, "bg-cream text-graphite hover:bg-terracotta/40", className)}>
              Wrong network · switch to Monad
            </button>
          );
        }
        return (
          <button type="button" onClick={openAccountModal} className={cn(pill, "bg-mist text-deep-teal hover:bg-sky/40", className)}>
            <span aria-hidden className="size-2 rounded-full bg-success" />
            {chain.name} · {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
