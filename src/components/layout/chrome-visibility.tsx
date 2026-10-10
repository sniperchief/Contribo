"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Routes that render full-screen without the site header and footer (the sign-in experience). */
export const CHROMELESS_ROUTES = ["/login"];

export function isChromeless(pathname: string | null): boolean {
  return !!pathname && CHROMELESS_ROUTES.includes(pathname);
}

/** Renders its children except on chromeless routes. Render inside `<Suspense>`. */
export function HideOnChromeless({ children }: { children: ReactNode }) {
  return isChromeless(usePathname()) ? null : children;
}
