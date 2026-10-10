"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/action-result";

/** Runs a server action, tracks its message, and refreshes server data on success. */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  function run<T>(action: () => Promise<ActionResult<T>>, success?: string, onSuccess?: (data: T) => void) {
    setMessage({});
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setMessage(success ? { success } : {});
        onSuccess?.(result.data);
        router.refresh();
      } else {
        setMessage({ error: result.error });
      }
    });
  }

  return { pending, message, setMessage, run };
}
