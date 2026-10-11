"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SignedOutActions } from "@/components/auth/auth-status";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { cn } from "@/lib/cn";
import { isChromeless } from "./chrome-visibility";

type NavLink = { href: string; label: string };

const landingLinks: NavLink[] = [
  { href: "/#problem", label: "Problem" },
  { href: "/#solution", label: "Solution" },
  { href: "/#faq", label: "FAQ" },
];

const appLinks: NavLink[] = [
  { href: "/projects", label: "Explore" },
  { href: "/dashboard", label: "Contributions" },
  { href: "/founder", label: "My projects" },
];

/** Session state known to the header, or `null` while it is loading. */
type HeaderSession = { signedIn: boolean; onboarded: boolean } | null;

/**
 * Landing: transparent bar with section anchors. App pages: white bar with a
 * Mist hairline and app navigation (current page underlined), shown only once
 * the user has signed up and chosen a role. Links sit centered on desktop and
 * move into a full-screen menu on phones.
 */
export function HeaderShell({
  account,
  session,
  pathname,
}: {
  account: ReactNode;
  session: HeaderSession;
  /** Current path, or `null` while it is not known yet (app header without an active link). */
  pathname: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const landing = pathname === "/";
  const links = landing ? landingLinks : session?.onboarded ? appLinks : [];
  const signedOut = session !== null && !session.signedIn;
  const hasMenu = links.length > 0 || signedOut;

  // The sign-in page is a full-screen experience without navigation.
  if (isChromeless(pathname)) return null;

  const isActive = (href: string) => !landing && !!pathname && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className={cn(landing ? "bg-transparent" : "border-b border-mist bg-paper")}>
      <Container>
        <nav aria-label="Main" className={cn("grid grid-cols-[1fr_auto] items-center gap-x-6 md:grid-cols-[1fr_auto_1fr]", landing ? "py-5" : "py-3.5")}>
          <Link href="/" aria-label="Contribo home" className="shrink-0 justify-self-start">
            <Logo eager />
          </Link>

          <div className="hidden items-center gap-x-10 text-base font-medium md:flex">
            {links.map((link) => {
              const active = isActive(link.href);
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

          <div className="flex items-center gap-3 justify-self-end">
            {account}
            {hasMenu && (
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMenuOpen(true)}
                className="grid size-11 place-items-center rounded-full bg-mist text-ink hover:bg-sky/40 md:hidden"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            )}
          </div>
        </nav>
      </Container>

      {menuOpen && (
        <MobileMenu links={links} isActive={isActive} signedOut={signedOut} onClose={() => setMenuOpen(false)} />
      )}
    </header>
  );
}

/** Full-screen phone menu: large links, then Get started / Login for visitors. */
function MobileMenu({
  links,
  isActive,
  signedOut,
  onClose,
}: {
  links: NavLink[];
  isActive: (href: string) => boolean;
  signedOut: boolean;
  onClose: () => void;
}) {
  // Lock page scroll while open; close on Escape or when the screen grows to desktop width.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const desktop = window.matchMedia("(min-width: 768px)");
    const onResize = () => desktop.matches && onClose();
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [onClose]);

  return (
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col bg-paper motion-safe:animate-menu-in md:hidden"
    >
      <Container className="flex items-center justify-between py-5">
        <Link href="/" aria-label="Contribo home" onClick={onClose}>
          <Logo />
        </Link>
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="grid size-11 place-items-center rounded-full bg-mist text-ink hover:bg-sky/40"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </Container>

      <Container className="flex flex-1 flex-col justify-between overflow-y-auto pt-8 pb-10">
        <nav aria-label="Mobile" className="flex flex-col">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              aria-current={isActive(link.href) ? "page" : undefined}
              style={{ animationDelay: `${60 + index * 50}ms` }}
              className={cn(
                "flex items-center justify-between border-b border-mist py-5 text-[32px] leading-none font-bold tracking-[-0.02em] text-ink",
                "motion-safe:animate-fade-up",
                isActive(link.href) && "text-plum",
              )}
            >
              {link.label}
              <span aria-hidden className="text-2xl text-deep-teal">→</span>
            </Link>
          ))}
        </nav>

        {signedOut && (
          <div onClick={onClose} className="pt-10">
            <SignedOutActions stacked />
          </div>
        )}
      </Container>
    </div>
  );
}

/** Header for the current URL. Render inside `<Suspense>` (the URL is request data on dynamic routes). */
export function HeaderForPath(props: { account: ReactNode; session: HeaderSession }) {
  return <HeaderShell {...props} pathname={usePathname()} />;
}
