"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** How often a staff screen asks the server for its list again. */
export const LIVE_REFRESH_MS = 5000;

/**
 * Keeps a staff screen up to date by itself: every few seconds it asks the server to render the page again and
 * React swaps in what changed (open forms and buttons keep their state). Shows nothing.
 *
 * It is plain polling on purpose (decided 2026-10-11): nothing extra to run or to secure, it works the same on
 * every host, and a few tablets asking every 5 seconds is no load. If orders ever have to appear the very instant
 * they are placed, only THIS component changes: replace the timer with a push from the server (Supabase Realtime)
 * that calls the same `router.refresh()`.
 *
 * It does not ask while the tab is hidden (a tablet in a drawer costs nothing) and asks at once when the tab comes
 * back; it never starts a second request while one is still on its way.
 */
export function LiveRefresh({ everyMs = LIVE_REFRESH_MS }: { everyMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  busy.current = pending;

  useEffect(() => {
    const refresh = () => {
      if (document.hidden || busy.current) return;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);

  return null;
}
