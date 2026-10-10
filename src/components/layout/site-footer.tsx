import Link from "next/link";
import { Suspense } from "react";
import { HideOnChromeless } from "./chrome-visibility";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { Eyebrow } from "@/components/ui/eyebrow";
import { activeChain } from "@/lib/monad/chains";

const columns = [
  {
    title: "Platform",
    links: [
      { href: "/projects", label: "Projects" },
      { href: "/dashboard", label: "Dashboard" },
      { href: "/founder", label: "Founder console" },
    ],
  },
  {
    title: "Links",
    links: [
      { href: "https://github.com/sniperchief/Contribo#readme", label: "Documentation" },
      { href: "https://github.com/sniperchief/Contribo", label: "GitHub" },
    ],
  },
];

/** Site footer, hidden on chromeless routes (sign-in). */
export function SiteFooter() {
  const footer = <FooterContent />;
  return (
    <Suspense fallback={footer}>
      <HideOnChromeless>{footer}</HideOnChromeless>
    </Suspense>
  );
}

function FooterContent() {
  return (
    <footer className="bg-paper pt-16 pb-8">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-wrap justify-between gap-10">
          <div className="flex max-w-xs flex-col gap-3.5">
            <Logo />
            <p className="text-base text-deep-teal">Build together, get recognized, and share in the success of what you help build.</p>
          </div>
          <div className="flex flex-wrap gap-x-20 gap-y-8">
            {columns.map((column) => (
              <div key={column.title} className="flex flex-col gap-1">
                <Eyebrow className="mb-2">{column.title}</Eyebrow>
                {column.links.map((link) =>
                  link.href.startsWith("http") ? (
                    <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="py-1.5 text-base text-ink">
                      {link.label}
                    </a>
                  ) : (
                    <Link key={link.href} href={link.href} className="py-1.5 text-base text-ink">
                      {link.label}
                    </Link>
                  ),
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-mist pt-6 text-caption text-deep-teal">
          <span>2026 © Contribo. All rights reserved.</span>
          <span>Built on Monad · {activeChain.name}</span>
        </div>
      </Container>
    </footer>
  );
}
