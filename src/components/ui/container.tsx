import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ContainerProps = HTMLAttributes<HTMLDivElement> & { size?: "md" | "lg" };

/** Horizontally centred page column with responsive gutters. */
export function Container({ size = "lg", className, ...props }: ContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        size === "lg" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
      {...props}
    />
  );
}
