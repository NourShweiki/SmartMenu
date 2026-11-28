"use client";

import { useEffect } from "react";

/**
 * Keeps the device's screen from going dark while this page is open (the kitchen screen sits on a counter all day).
 * Uses the browser's Screen Wake Lock where it exists; the browser drops the lock whenever the page is hidden, so it
 * is asked for again when the page comes back. Where the browser has no wake lock this does nothing: the device's
 * own "never sleep" setting is then the way. Shows nothing.
 */
export function KeepAwake() {
  useEffect(() => {
    type Lock = { release(): Promise<void> };
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<Lock> } }).wakeLock;
    if (!wakeLock) return;
    let lock: Lock | null = null;
    let stopped = false;
    const request = () => {
      if (document.hidden || stopped) return;
      wakeLock
        .request("screen")
        .then((granted) => {
          if (stopped) void granted.release();
          else lock = granted;
        })
        .catch(() => {}); // refused (battery saver, no permission): the screen just follows its own settings
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => {});
    };
  }, []);
  return null;
}
