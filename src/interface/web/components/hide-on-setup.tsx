"use client";

import { usePathname } from "next/navigation";

/** Renders its children except on the founders' setup tool, which never belongs to a restaurant (not even a previewed one). */
export function HideOnSetup({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? "";
  return /^\/(ar|en)\/setup(\/|$)/.test(path) ? null : children;
}
