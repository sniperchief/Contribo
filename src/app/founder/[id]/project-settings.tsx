"use client";

import { setProjectStatus, updateProjectDetails } from "@/app/founder/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import type { ProjectStatus, Tables } from "@/types/database";
import { useServerAction } from "./use-action";

export function ProjectSettings({ project }: { project: Tables<"projects"> }) {
  const details = useServerAction();
  const status = useServerAction();

  const nextStatus: Array<{ status: ProjectStatus; label: string }> =
    project.status === "published"
      ? [
          { status: "draft", label: "Unpublish" },
          { status: "archived", label: "Archive" },
        ]
      : [{ status: "published", label: "Publish project" }];

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-5 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          details.run(() => updateProjectDetails(project.id, formData), "Saved.");
        }}
      >
        <Field label="Name">
          <Input name="name" defaultValue={project.name} required minLength={2} maxLength={80} />
        </Field>
        <Field label="Website" hint="Optional, https:// only.">
          <Input name="website_url" type="url" defaultValue={project.website_url ?? ""} placeholder="https://" />
        </Field>
        <Field label="Tagline" className="sm:col-span-2">
          <Input name="tagline" defaultValue={project.tagline ?? ""} maxLength={160} />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea name="description" rows={4} defaultValue={project.description ?? ""} maxLength={4000} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={details.pending}>
            {details.pending ? "Saving…" : "Save details"}
          </Button>
          {nextStatus.map((option) => (
            <Button
              key={option.status}
              variant="secondary"
              tone={option.status === "published" ? "sky" : "mist"}
              disabled={status.pending}
              onClick={() => status.run(() => setProjectStatus(project.id, option.status))}
            >
              {option.label === "Archive" ? "Archive project" : option.label}
            </Button>
          ))}
          <FormMessage {...details.message} />
          <FormMessage {...status.message} />
        </div>
      </form>
    </div>
  );
}
