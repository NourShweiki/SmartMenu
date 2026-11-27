"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { kitchenTimer, type TimerLevel } from "@/domain/order/kitchen-board";
import type { OrderStatus } from "@/domain/order/order";
import type { SessionKind } from "@/domain/table-session/pickup";

type Props = {
  status: OrderStatus;
  kind: SessionKind;
  placedAt: string;
  statusChangedAt: string;
  /** The server's clock when it drew the page: the device's own clock may be off, so the timer follows the server's. */
  serverNow: string;
};

const LEVEL_STYLE: Record<TimerLevel, string> = {
  green: "bg-green-100 text-green-900 ring-green-300",
  amber: "bg-amber-300 text-amber-950 ring-amber-500",
  red: "bg-red-600 text-white ring-red-700",
};

/** 75 -> "1:15"; 3725 -> "1:02:05". Western digits in both languages. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/**
 * A ticket's timer (PROJECT_SPEC.md §3.3): ticks every second in the browser. While the order is waited for it
 * counts from when it was placed, green / amber / red (fixed limits); once ready it shows how long it has waited
 * for pickup. The rule itself is `kitchenTimer` in the domain; this only redraws it.
 */
export function KitchenTimer({ status, kind, placedAt, statusChangedAt, serverNow }: Props) {
  const t = useTranslations("StaffKitchen.timer");
  // How far this device's clock is from the server's, measured when the page (or its refresh) arrived.
  const [offsetMs, setOffsetMs] = useState(0);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setOffsetMs(new Date(serverNow).getTime() - Date.now());
  }, [serverNow]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Before the first tick (and on the server) the page's own time is used, so nothing jumps after loading.
  const current = new Date(now === null ? new Date(serverNow).getTime() : now + offsetMs);
  const timer = kitchenTimer({ status, createdAt: new Date(placedAt), statusChangedAt: new Date(statusChangedAt) }, kind, current);
  const text = formatDuration(timer.seconds);

  if (timer.kind === "waitingForPickup") {
    return (
      <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-700 ring-1 ring-gray-300" aria-label={t("waitingLabel", { time: text })}>
        {t("waiting")} <bdi className="tabular-nums">{text}</bdi>
      </span>
    );
  }
  return (
    <span className={`rounded-lg px-3 py-1 text-xl font-bold tabular-nums ring-1 ${LEVEL_STYLE[timer.level]}`} aria-label={t("placedLabel", { time: text })} data-level={timer.level}>
      <bdi>{text}</bdi>
    </span>
  );
}
