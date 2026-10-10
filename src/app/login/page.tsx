import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import mark from "@/assets/brand/contribo-mark.png";
import { getSupabaseConfig } from "@/lib/env";
import { GitHubSignIn } from "./github-sign-in";

export const metadata: Metadata = { title: "Sign in" };

/** Full-screen sign-in / get started experience (no site header or footer). */
export default function LoginPage() {
  const configured = getSupabaseConfig() !== null;

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden bg-ink px-4 py-20 text-paper">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 25%, rgba(31, 23, 56, 0.9), transparent 75%), radial-gradient(36% 32% at 50% 30%, rgba(203, 176, 235, 0.2), transparent 70%)",
        }}
      />

      <Link href="/" className="absolute top-6 left-6 text-sm font-medium text-paper/60 hover:text-paper sm:top-8 sm:left-10">
        ← Back to home
      </Link>

      <div className="relative flex flex-col items-center text-center">
        <div className="motion-safe:animate-float" style={{ "--float-duration": "8s" } as React.CSSProperties}>
          <Image
            src={mark}
            alt="Contribo"
            loading="eager"
            className="h-auto w-[200px] sm:w-[240px]"
            style={{ filter: "invert(1) drop-shadow(0 18px 40px rgba(203, 176, 235, 0.35))" }}
          />
        </div>

        <h1 className="mt-16 text-[40px] leading-none font-bold tracking-[-0.03em] sm:text-[44px]">Contribo</h1>

        <div className="mt-10 flex w-full flex-col items-center">
          <Suspense>
            <GitHubSignIn configured={configured} />
          </Suspense>
        </div>

        <p className="mt-6 max-w-xs text-sm text-mist/70">
          New here or returning, GitHub signs you in. No password needed.
        </p>
      </div>
    </div>
  );
}
