import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Inputs: Fog background, 1px Mist border, 8px radius, 48px tall. */
const control =
  "w-full min-w-0 rounded-control border border-mist bg-fog px-3.5 text-base text-ink placeholder:text-subtle focus-visible:border-plum disabled:bg-mist disabled:text-deep-teal read-only:bg-mist read-only:text-deep-teal";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-caption text-deep-teal">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-24 py-3 leading-normal", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, "h-12 px-3", className)} {...props} />;
}

/** Inline result message for forms. */
export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (success) return <p role="status" className="text-sm text-success">{success}</p>;
  return null;
}
