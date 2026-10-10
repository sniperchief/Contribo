import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <Container size="md" className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <p className="font-mono text-sm text-subtle">404</p>
      <h1 className="text-3xl font-bold text-ink">This page doesn&apos;t exist yet</h1>
      <p className="text-muted">It may have moved, or it&apos;s still being built.</p>
      <Link href="/" className={buttonStyles({ variant: "secondary" })}>
        Back to home
      </Link>
    </Container>
  );
}
