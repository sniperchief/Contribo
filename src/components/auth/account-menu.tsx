"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { activeChain } from "@/lib/monad/chains";
import { VerifiedBadge } from "./verified-badge";

type AccountMenuProps = {
  /** GitHub username when the account was linked through GitHub sign-in. */
  githubLogin: string | null;
  displayName: string;
  avatarUrl: string | null;
  /** Whether a payout wallet is linked and verified; if not, the menu nudges the user to link one. */
  walletLinked: boolean;
};

/** Header account button: avatar, @username with a verified tick, and a menu with profile and sign-out. */
export function AccountMenu({ githubLogin, displayName, avatarUrl, walletLinked }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
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

  const label = githubLogin ? `@${githubLogin}` : displayName;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={walletLinked ? label : `${label}: payout wallet not linked`}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-11 items-center gap-2.5 rounded-full bg-paper p-1 text-[15px] font-bold text-ink hover:bg-fog sm:pr-3.5"
      >
        {!walletLinked && <span aria-hidden className="absolute top-0.5 left-8 size-3 rounded-full border-2 border-paper bg-terracotta" />}
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={36} height={36} unoptimized className="size-9 rounded-full bg-lavender" />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-lavender text-sm">{label.replace("@", "").charAt(0).toUpperCase()}</span>
        )}
        {/* Phones show the avatar only, leaving room for the menu button. */}
        <span className="hidden max-w-36 truncate sm:inline">{label}</span>
        {githubLogin && <VerifiedBadge className="hidden sm:block" />}
        <svg aria-hidden viewBox="0 0 20 20" className={`hidden size-4 transition-transform sm:block ${open ? "rotate-180" : ""}`}>
          <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 rounded-card border border-mist bg-paper p-2">
          <div className="flex items-center gap-1.5 px-3 pt-2 pb-3 text-caption text-deep-teal">
            Signed in with GitHub
            {githubLogin && <VerifiedBadge className="size-3.5" />}
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-control px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-fog"
          >
            View profile
          </Link>
          {!walletLinked && (
            <Link
              href="/profile#wallet"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between rounded-control px-3 py-2.5 text-[15px] font-medium text-ink hover:bg-fog"
            >
              Link payout wallet
              <span aria-hidden className="size-2.5 rounded-full bg-terracotta" />
            </Link>
          )}
          {address && (
            <div className="mx-1 my-1 flex items-center justify-between gap-2 rounded-control bg-fog px-3 py-2.5">
              <span className="min-w-0 text-caption text-deep-teal">
                {activeChain.name}
                <span className="block truncate font-mono text-sm text-ink">{shortAddress(address)}</span>
              </span>
              <button
                type="button"
                role="menuitem"
                onClick={() => disconnect()}
                className="shrink-0 text-sm font-medium text-ink hover:text-plum"
              >
                Disconnect
              </button>
            </div>
          )}
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              role="menuitem"
              className="block w-full rounded-control px-3 py-2.5 text-left text-[15px] font-medium text-ink hover:bg-fog"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
