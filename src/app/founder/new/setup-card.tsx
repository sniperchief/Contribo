import { cn } from "@/lib/cn";

/** Bordered card used by every setup screen. */
export function SetupCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("flex flex-col gap-6 rounded-card border-2 border-mist bg-paper p-6 sm:p-9", className)}>{children}</section>;
}

export function SetupHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-heading-sm">{title}</h2>
      {description && <p className="text-base text-deep-teal">{description}</p>}
    </div>
  );
}
