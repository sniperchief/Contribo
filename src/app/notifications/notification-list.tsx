"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { notificationHref, notificationLabels, notificationTones, type NotificationRow } from "@/lib/notifications";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = notifications.filter((n) => !n.read_at).length;

  function open(n: NotificationRow) {
    startTransition(async () => {
      // A failed update only leaves the item unread; navigation still happens.
      if (!n.read_at) await markNotificationRead(n.id);
      router.push(notificationHref(n));
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-base text-deep-teal">
          <span className="font-bold text-ink">{unread}</span> unread
        </p>
        {unread > 0 && (
          <Button
            size="sm"
            variant="secondary"
            tone="sky"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead();
                router.refresh();
              })
            }
          >
            Mark all as read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <p className="text-base text-deep-teal">
          Nothing yet. You&apos;ll hear here when a contribution is verified, reviewed, approved onchain or paid.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-badge border border-mist">
          {notifications.map((n) => (
            <li key={n.id} className="border-b border-mist last:border-b-0">
              <button
                type="button"
                onClick={() => open(n)}
                disabled={pending}
                className={cn(
                  "flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-fog disabled:cursor-wait sm:px-6",
                  !n.read_at && "bg-lavender/15",
                )}
              >
                <span
                  aria-hidden
                  className={cn("mt-2 size-2.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-terracotta")}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={notificationTones[n.type]}>{notificationLabels[n.type]}</Badge>
                    {!n.read_at && <span className="sr-only">Unread.</span>}
                    <time dateTime={n.created_at} className="text-caption text-deep-teal">
                      {formatDateTime(n.created_at)}
                    </time>
                  </span>
                  <span className={cn("text-base text-ink", !n.read_at && "font-medium")}>{n.message}</span>
                </span>
                <span aria-hidden className="mt-1 shrink-0 text-deep-teal">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
