"use client";

import { useEffect, useState } from "react";

/**
 * Workaround for a bug in the React build that Next.js 15.5 ships (19.2.0-canary-0bdb9206-20250818). Remove it once
 * an upgrade fixes the bug: the check is `e2e/staff-menu.spec.ts` against a PRODUCTION build with this component
 * taken out (see docs/PROGRESS.md, 2026-10-11).
 *
 * What goes wrong: when a Server Action (or `router.refresh()`) updates the page the user is already looking at, the
 * new page arrives as a stream and React starts rendering before the stream has ended. If the last piece arrives at
 * the wrong moment (while React is in the middle of that render), React is told "your data is here" during the render
 * and loses the message. Everything has arrived, but React waits forever: the screen keeps its old content (a toggle
 * stays flipped without its badge, a saved list does not change) until a reload. The save itself always went through.
 * It only shows in production builds; the dev server is too slow to hit the timing.
 *
 * The cure: ANY new state update makes React try its waiting work again. So this component, which shows nothing,
 * updates its own state right after each request to our own server has completely finished. If nothing was waiting,
 * that costs one empty re-render.
 */
export function StuckRenderGuard() {
  const [, nudge] = useState(0);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    const timers = new Set<number>();
    const nudgeIn = (ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        nudge((n) => n + 1);
      }, ms);
      timers.add(id);
    };
    // A "resource" entry is reported once a response has been read to its end: exactly the moment after which a
    // lost wake-up can no longer be followed by a real one.
    const observer = new PerformanceObserver((list) => {
      const ownRequestFinished = list
        .getEntries()
        .some((entry) => (entry as PerformanceResourceTiming).initiatorType === "fetch" && entry.name.startsWith(window.location.origin));
      if (!ownRequestFinished) return;
      nudgeIn(0);
      nudgeIn(250); // again, in case the first one landed while React was still inside the render that loses the message
    });
    observer.observe({ type: "resource" });
    return () => {
      observer.disconnect();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return null;
}
