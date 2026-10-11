import { cn } from "@/lib/cn";
import type { ProjectStatus } from "@/types/database";

/** Project lifecycle as founders and contributors see it: Live, Ended, or not live yet. */
export function ProjectStatusBadge({
  status,
  draftLabel = "Not live",
  className,
}: {
  status: ProjectStatus;
  /** Label for a draft project, e.g. "In setup". */
  draftLabel?: string;
  className?: string;
}) {
  const live = status === "published";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-caption font-bold",
        live ? "bg-sky/40 text-deep-teal" : status === "archived" ? "bg-mist text-deep-teal" : "bg-terracotta/20 text-graphite",
        className,
      )}
    >
      {live ? (
        <span aria-hidden className="relative flex size-2">
          <span className="absolute inline-flex size-full rounded-full bg-deep-teal opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-deep-teal" />
        </span>
      ) : (
        <span aria-hidden className={cn("size-2 rounded-full", status === "archived" ? "bg-deep-teal/50" : "bg-terracotta")} />
      )}
      {live ? "Live" : status === "archived" ? "Ended" : draftLabel}
    </span>
  );
}
