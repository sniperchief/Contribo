import { Suspense } from "react";
import { AuthStatus, AuthStatusFallback } from "@/components/auth/auth-status";
import { HeaderForPath, HeaderShell } from "./header-shell";

export function SiteHeader() {
  const slots = {
    account: (
      <Suspense fallback={<AuthStatusFallback />}>
        <AuthStatus />
      </Suspense>
    ),
  };
  return (
    <Suspense fallback={<HeaderShell {...slots} pathname={null} />}>
      <HeaderForPath {...slots} />
    </Suspense>
  );
}
