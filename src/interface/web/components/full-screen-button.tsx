"use client";

import { useEffect, useState } from "react";

/** Puts the page in full screen (and back), for a screen that stays on a counter. Hidden where the browser cannot. */
export function FullScreenButton({ enterLabel, exitLabel }: { enterLabel: string; exitLabel: string }) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    setSupported(typeof document.documentElement.requestFullscreen === "function");
    const update = () => setActive(document.fullscreenElement !== null);
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  if (!supported) return null;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <button type="button" onClick={toggle} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-100">
      {active ? exitLabel : enterLabel}
    </button>
  );
}
