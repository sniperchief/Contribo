"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SignedOutActions } from "@/components/auth/auth-status";
import { VerifiedBadge } from "@/components/auth/verified-badge";
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

type HeaderUser = { label: string; avatarUrl: string | null; verified: boolean; walletLinked: boolean };

/** Session state known to the header, or `null` while it is loading. */
export type HeaderSession = { onboarded: boolean; user: HeaderUser | null } | null;

/**
 * Floating pill header that stays at the top while scrolling: logo on the left,
 * links grouped on the right beside the main action. App links appear only once
 * the user has signed up and chosen a role. On phones the pill holds just the
 * logo and a menu button that opens a full-screen menu.
 */
export function HeaderShell({
  account,
  session,
  pathname,
}: {
  account: ReactNode;
  session: HeaderSession;
  /** Current path, or `null` while it is not known yet (no active link). */
  pathname: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const landing = pathname === "/";
  const links = landing ? landingLinks : session?.onboarded ? appLinks : [];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The sign-in page is a full-screen experience without navigation.
  if (isChromeless(pathname)) return null;

  const isActive = (href: string) => !landing && !!pathname && (pathname === href || pathname.startsWith(`${href}/`));

  return (
    <header className="sticky top-0 z-40 pt-3 sm:pt-4">
      <Container className="max-w-[820px]">
        <nav
          aria-label="Main"
          className={cn(
            "flex h-16 items-center justify-between gap-6 rounded-full border pr-2.5 pl-6 backdrop-blur-md transition-colors duration-300",
            scrolled ? "border-mist bg-paper/85" : "border-transparent bg-mist/80",
          )}
        >
          <Link href="/" aria-label="Contribo home" className="shrink-0">
            <Logo eager />
          </Link>

          <div className="hidden items-center gap-7 lg:flex">
            {links.length > 0 && (
              <div className="flex items-center gap-7 text-base font-medium">
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
            )}
            {account}
          </div>

          {session && (
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
              className="grid size-11 place-items-center rounded-full bg-ink text-paper hover:bg-plum lg:hidden"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          )}
        </nav>
      </Container>

      {menuOpen && session && (
        <MobileMenu links={links} isActive={isActive} user={session.user} onClose={() => setMenuOpen(false)} />
      )}
    </header>
  );
}

/** Full-screen phone menu: large links, then the account (profile, sign out) or Get started / Login. */
function MobileMenu({
  links,
  isActive,
  user,
  onClose,
}: {
  links: NavLink[];
  isActive: (href: string) => boolean;
  user: HeaderUser | null;
  onClose: () => void;
}) {
  // Lock page scroll while open; close on Escape or when the screen grows to desktop width.
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onResize = () => desktop.matches && onClose();
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
    };
  }, [onClose]);

  const accountLink = "flex items-center justify-between rounded-control px-4 py-3.5 text-body-lg font-medium text-ink hover:bg-fog";

  return (
    <div
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col bg-paper motion-safe:animate-menu-in lg:hidden"
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

      <Container className="flex flex-1 flex-col justify-between gap-10 overflow-y-auto pt-6 pb-10">
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

        {user ? (
          <div className="flex flex-col gap-1 rounded-card bg-fog p-2">
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              {user.avatarUrl ? (
                <Image src={user.avatarUrl} alt="" width={40} height={40} unoptimized className="size-10 rounded-full bg-lavender" />
              ) : (
                <span className="grid size-10 place-items-center rounded-full bg-lavender font-bold">
                  {user.label.replace("@", "").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 truncate text-base font-bold">{user.label}</span>
              {user.verified && <VerifiedBadge />}
            </div>
            <Link href="/profile" onClick={onClose} className={accountLink}>
              View profile
            </Link>
            {!user.walletLinked && (
              <Link href="/profile#wallet" onClick={onClose} className={accountLink}>
                Link payout wallet
                <span aria-hidden className="size-2.5 rounded-full bg-terracotta" />
              </Link>
            )}
            <form action="/auth/sign-out" method="post">
              <button type="submit" className={cn(accountLink, "w-full text-left")}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <div onClick={onClose}>
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
