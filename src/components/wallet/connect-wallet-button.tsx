"use client";

import { useEffect, useRef, useState } from "react";
import {
  ProviderNotFoundError,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { Button } from "@/components/ui/button";
import { activeChain, explorerAddressUrl } from "@/lib/monad/chains";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Connects a browser wallet on the configured Monad network.
 * Phase 1 only establishes the connection; linking the address to a profile
 * (with a signed message) comes in a later phase.
 */
export function ConnectWalletButton() {
  const { address, chainId, status } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (status === "connected" && address) {
    if (chainId !== activeChain.id) {
      return (
        <Button
          variant="secondary"
          size="sm"
          disabled={switchChain.isPending}
          onClick={() => switchChain.mutate({ chainId: activeChain.id })}
        >
          <span className="size-2 rounded-full bg-warning" aria-hidden />
          Switch to {activeChain.name}
        </Button>
      );
    }

    const explorerUrl = explorerAddressUrl(address);

    return (
      <div className="relative" ref={menuRef}>
        <Button
          variant="secondary"
          size="sm"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="font-mono"
        >
          <span className="size-2 rounded-full bg-success" aria-hidden />
          {shortAddress(address)}
        </Button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-60 rounded-lg border border-line bg-surface p-1.5 shadow-pop"
          >
            <p className="px-2.5 py-2 text-xs text-muted">Connected to {activeChain.name}</p>
            {explorerUrl && (
              <a
                role="menuitem"
                href={explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md px-2.5 py-2 text-sm text-ink hover:bg-surface-sunken"
              >
                View on explorer
              </a>
            )}
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                disconnect.mutate();
                setOpen(false);
              }}
              className="block w-full rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  const isBusy = status === "connecting" || status === "reconnecting" || connect.isPending;

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isBusy}
        onClick={() => {
          connect.reset();
          setOpen((value) => !value);
        }}
      >
        {isBusy ? "Connecting…" : "Connect wallet"}
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-line bg-surface p-1.5 shadow-pop"
        >
          <p className="px-2.5 py-2 text-xs text-muted">Choose a wallet · {activeChain.name}</p>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              role="menuitem"
              type="button"
              onClick={() =>
                connect.mutate(
                  { connector, chainId: activeChain.id },
                  { onSuccess: () => setOpen(false) },
                )
              }
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
            >
              {connector.icon ? (
                // Wallet icons are data URIs supplied by the wallet (EIP-6963).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={connector.icon} alt="" className="size-5 rounded" />
              ) : (
                <span className="size-5 rounded bg-surface-sunken" aria-hidden />
              )}
              {connector.id === "injected" ? "Browser wallet" : connector.name}
            </button>
          ))}
          {connect.error && (
            <p className="px-2.5 py-2 text-xs text-danger">
              {connect.error instanceof ProviderNotFoundError
                ? "No browser wallet found. Install an EVM wallet extension to continue."
                : connect.error.message.split("\n")[0]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
