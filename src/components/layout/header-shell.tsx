"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { isChromeless } from "./chrome-visibility";

const landingLinks = [
  { href: "/#problem", label: "Problem" },
  { href: "/#solution", label: "Solution" },
  { href: "/#faq", label: "FAQ" },
];

const appLinks = [
  { href: "/projects", label: "Projects" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/founder", label: "Founder" },
];

/**
 * Landing: transparent bar with section anchors. App pages: white bar with a
 * Mist hairline, app navigation (current page underlined) and the account menu.
 * Wallets are connected where they are needed (onboarding, profile, onchain actions).
 */
export function HeaderShell({
  account,
  pathname,
}: {
  account: ReactNode;
  /** Current path, or `null` while it is not known yet (app header without an active link). */
  pathname: string | null;
}) {
  const landing = pathname === "/";
  // The sign-in page is a full-screen experience without navigation.
  if (isChromeless(pathname)) return null;

  return (
    <header className={cn(landing ? "bg-transparent" : "border-b border-mist bg-paper")}>
      <Container>
        <nav
          aria-label="Main"
          className={cn("flex flex-wrap items-center gap-x-10 gap-y-3", landing ? "justify-between py-5" : "py-3.5")}
        >
          <Link href="/" aria-label="Contribo home" className="shrink-0">
            <Logo eager />
          </Link>

          <div className={cn("flex flex-wrap items-center gap-x-8 text-base font-medium", !landing && "flex-1", landing && "gap-x-10")}>
            {(landing ? landingLinks : appLinks).map((link) => {
              const active = !landing && !!pathname && (pathname === link.href || pathname.startsWith(`${link.href}/`));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // Underline drawn from the left on hover; stays drawn for the current page.
                    "relative py-2.5 text-ink hover:text-ink",
                    "after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:origin-left after:rounded-full after:bg-ink",
                    "after:transition-transform after:duration-300 after:ease-out motion-reduce:after:transition-none",
                    active ? "after:scale-x-100" : "after:scale-x-0 hover:after:scale-x-100 focus-visible:after:scale-x-100",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {account}
          </div>
        </nav>
      </Container>
    </header>
  );
}

/** Header for the current URL. Render inside `<Suspense>` (the URL is request data on dynamic routes). */
export function HeaderForPath(props: { account: ReactNode }) {
  return <HeaderShell {...props} pathname={usePathname()} />;
}
