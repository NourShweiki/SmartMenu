"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

/** How often a staff screen asks the server for its list again. */
export const LIVE_REFRESH_MS = 5000;

/**
 * Keeps a screen up to date by itself: every few seconds it asks the server to render the page again and React
 * swaps in what changed (open forms and buttons keep their state). Shows nothing. Used by the staff order and
 * open tables screens, and by a guest's menu page while one of their orders is still on its way.
 *
 * It is plain polling on purpose (decided 2026-10-11): nothing extra to run or to secure, it works the same on
 * every host, and a few devices asking every few seconds is no load. If changes ever have to appear the very
 * instant they happen, only THIS component changes: replace the timer with a push from the server (Supabase
 * Realtime) that calls the same `router.refresh()`.
 *
 * It never starts a second request while one is still on its way. By default it does not ask while the tab is
 * hidden (a tablet in a drawer costs nothing) and asks at once when the tab comes back; `whileHidden` keeps it
 * asking in the background too, for a guest waiting for "your order is ready" with the menu in another tab
 * (browsers slow hidden pages down a lot, and stop them on a locked phone: it is a best effort).
 */
export function LiveRefresh({ everyMs = LIVE_REFRESH_MS, whileHidden = false }: { everyMs?: number; whileHidden?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  busy.current = pending;

  useEffect(() => {
    const refresh = () => {
      if ((document.hidden && !whileHidden) || busy.current) return;
      startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs, whileHidden]);

  return null;
}
