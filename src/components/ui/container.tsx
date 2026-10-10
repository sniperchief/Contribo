import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ContainerProps = HTMLAttributes<HTMLDivElement> & { size?: "md" | "lg" };

/** Page column: 1200px max width, 16px side padding on phones and 40px on desktop. */
export function Container({ size = "lg", className, ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-10", size === "lg" ? "max-w-[1280px]" : "max-w-3xl", className)}
      {...props}
    />
  );
}
