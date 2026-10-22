"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/app/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import {
  notificationHref,
  notificationLabels,
  notificationTones,
  unreadBadge,
  type NotificationRow,
} from "@/lib/notifications";

/**
 * Header bell with the unread count. Tapping it opens a panel listing the
 * latest notifications, loaded when opened. Opening the panel does not mark
 * anything read: only tapping a notification or "Mark all as read" does.
 */
export function NotificationMenu({ count: serverCount }: { count: number }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [count, setCount] = useState(serverCount);
  // Take the server's count again whenever the page data refreshes.
  const [lastServerCount, setLastServerCount] = useState(serverCount);
  if (serverCount !== lastServerCount) {
    setLastServerCount(serverCount);
    setCount(serverCount);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    startLoading(async () => {
      const result = await listNotifications();
      if (result.ok) {
        setItems(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  function openItem(n: NotificationRow) {
    setOpen(false);
    if (!n.read_at) {
      setItems((list) => list?.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item)) ?? null);
      setCount((c) => Math.max(0, c - 1));
      // A failed update only leaves it unread; navigation still happens.
      void markNotificationRead(n.id).then(() => router.refresh());
    }
    router.push(notificationHref(n));
  }

  function markAll() {
    const now = new Date().toISOString();
    setItems((list) => list?.map((item) => ({ ...item, read_at: item.read_at ?? now })) ?? null);
    setCount(0);
    void markAllNotificationsRead().then(() => router.refresh());
  }

  const badge = unreadBadge(count);

  return (
    <div ref={ref} className="lg:relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        aria-label={badge ? `Notifications, ${count} unread` : "Notifications"}
        onClick={toggle}
        className={cn(
          "relative grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-paper",
          open ? "bg-paper" : "bg-paper/60",
        )}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" />
          <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-paper bg-terracotta px-1 text-[11px] leading-none font-bold text-ink">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          className={cn(
            "z-50 flex flex-col overflow-hidden rounded-card border border-mist bg-paper",
            // Phones: full width under the header pill. Desktop: a dropdown under the bell.
            "fixed inset-x-4 top-[84px] max-h-[calc(100dvh-100px)]",
            "lg:absolute lg:inset-x-auto lg:top-full lg:right-0 lg:mt-2 lg:max-h-[min(560px,calc(100dvh-120px))] lg:w-[400px]",
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-mist px-5 py-3.5">
            <p className="text-base font-bold">Notifications</p>
            {count > 0 && items && items.length > 0 && (
              <button type="button" onClick={markAll} className="text-sm font-medium text-ink hover:text-plum">
                Mark all as read
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {error ? (
              <p className="px-5 py-6 text-sm text-danger">{error}</p>
            ) : !items ? (
              <p className="px-5 py-6 text-sm text-deep-teal" aria-busy={loading}>
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="px-5 py-6 text-sm text-deep-teal">
                Nothing yet. You&apos;ll hear here when a contribution is verified, reviewed, approved onchain or paid.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="border-b border-mist last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-fog",
                        !n.read_at && "bg-lavender/15",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-terracotta")}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={notificationTones[n.type]} className="px-2.5 py-1">
                            {notificationLabels[n.type]}
                          </Badge>
                          {!n.read_at && <span className="sr-only">Unread.</span>}
                        </span>
                        <span className={cn("text-sm text-ink", !n.read_at && "font-medium")}>{n.message}</span>
                        <time dateTime={n.created_at} className="text-caption text-deep-teal">
                          {formatDateTime(n.created_at)}
                        </time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
