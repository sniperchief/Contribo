import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { AuthStatus, AuthStatusFallback } from "@/components/auth/auth-status";
import { Container } from "@/components/ui/container";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

const navigation = [
  { href: "/projects", label: "Projects" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/founder", label: "Founders" },
  { href: "/#how-it-works", label: "How it works" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur supports-[backdrop-filter]:bg-paper/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="Contribo home" className="shrink-0">
            <Logo className="h-6 sm:h-7" eager />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectWalletButton />
          </div>
          <Suspense fallback={<AuthStatusFallback />}>
            <AuthStatus />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}
