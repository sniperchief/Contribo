"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { SKILLS, SOCIAL_FIELDS, type PrimaryRole, type SkillId, type SocialLinks } from "@/lib/profile";
import { setPrimaryRole } from "../welcome/actions";
import { updateProfileDetails, updateSkills } from "./actions";

type Message = { error?: string; success?: string };

export function ProfileDetailsForm({
  displayName,
  bio,
  websiteUrl,
  socialLinks,
}: {
  displayName: string | null;
  bio: string | null;
  websiteUrl: string | null;
  socialLinks: SocialLinks;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>({});

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setMessage({});
        startTransition(async () => {
          const result = await updateProfileDetails(formData);
          setMessage(result.ok ? { success: "Profile saved." } : { error: result.error });
          if (result.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Display name">
          <Input name="display_name" maxLength={80} defaultValue={displayName ?? ""} placeholder="Your name" />
        </Field>
        <Field label="Website" hint="Optional, https:// only.">
          <Input name="website_url" type="url" defaultValue={websiteUrl ?? ""} placeholder="https://" />
        </Field>
        <Field label="Bio" className="sm:col-span-2" hint="Up to 500 characters.">
          <Textarea name="bio" rows={3} maxLength={500} defaultValue={bio ?? ""} placeholder="What you build and what you're interested in." />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-5">
        <legend className="mb-5 text-body-lg font-bold">Social accounts</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              <Input
                name={`social_${field.key}`}
                defaultValue={socialLinks[field.key] ?? ""}
                placeholder={field.placeholder}
                maxLength={200}
                autoComplete="off"
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
        <FormMessage error={message.error} success={message.success} />
      </div>
    </form>
  );
}

export function SkillsPicker({ selected }: { selected: SkillId[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<SkillId>>(new Set(selected));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>({});

  function toggle(id: SkillId) {
    setMessage({});
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2.5" role="group" aria-label="Tech stack">
        {SKILLS.map((skill) => {
          const on = chosen.has(skill.id);
          return (
            <button
              key={skill.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(skill.id)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-badge border-2 px-4 text-sm font-medium transition-colors",
                on ? "border-plum bg-lavender text-plum" : "border-mist bg-paper text-deep-teal hover:border-lavender",
              )}
            >
              {on && (
                <svg aria-hidden viewBox="0 0 20 20" className="size-4">
                  <path fill="currentColor" d="M8.1 14.3 3.8 10l1.4-1.4 2.9 2.9 6.7-6.7 1.4 1.4z" />
                </svg>
              )}
              {skill.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          tone="lavender"
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updateSkills([...chosen]);
              setMessage(result.ok ? { success: "Skills saved." } : { error: result.error });
              if (result.ok) router.refresh();
            })
          }
        >
          {pending ? "Saving…" : "Save skills"}
        </Button>
        <span className="text-sm text-deep-teal">
          {chosen.size} of {SKILLS.length} selected
        </span>
        <FormMessage error={message.error} success={message.success} />
      </div>
    </div>
  );
}

/** Switches the user's primary role (a preference that only changes where they start). */
export function RoleSwitch({ role }: { role: PrimaryRole | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>({});
  const options: Array<{ id: PrimaryRole; label: string }> = [
    { id: "contributor", label: "Contributor" },
    { id: "founder", label: "Founder" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Primary role" className="inline-flex rounded-control bg-fog p-1">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={role === option.id}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setPrimaryRole(option.id);
                setMessage(result.ok ? { success: "Saved. This changes where you land after signing in." } : { error: result.error });
                if (result.ok) router.refresh();
              })
            }
            className={cn(
              "h-10 rounded-control px-5 text-[15px] font-medium",
              role === option.id ? "bg-ink text-paper" : "text-ink hover:bg-mist",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <FormMessage error={message.error} success={message.success} />
    </div>
  );
}
