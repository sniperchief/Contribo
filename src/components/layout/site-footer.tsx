import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { activeChain } from "@/lib/monad/chains";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo variant="mark" className="h-6" />
          <p className="text-sm text-muted">Build together, get recognized, share in the success.</p>
        </div>
        <p className="text-xs text-subtle">
          Built for the Monad developer ecosystem · Network: {activeChain.name}
        </p>
      </Container>
    </footer>
  );
}
