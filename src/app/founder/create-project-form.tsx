"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createProject } from "@/app/founder/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";

export function CreateProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createProject(formData);
          if (result.ok) router.push(`/founder/${result.data.id}`);
          else setError(result.error);
        });
      }}
    >
      <Field label="Project name">
        <Input name="name" required minLength={2} maxLength={80} placeholder="Monad SDK" />
      </Field>
      <Field label="Slug" hint="Used in the project URL: lowercase letters, numbers and hyphens.">
        <Input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,62}[a-z0-9]" placeholder="monad-sdk" />
      </Field>
      <Field label="Tagline" className="sm:col-span-2">
        <Input name="tagline" maxLength={160} placeholder="Typed client and tooling for Monad apps" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create draft project"}
        </Button>
        <FormMessage error={error} />
      </div>
    </form>
  );
}
