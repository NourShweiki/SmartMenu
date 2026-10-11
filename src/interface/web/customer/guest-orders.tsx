"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { PublicOrder } from "@/application/ports/table-session-gateway";
import type { OrderStatus } from "@/domain/order/order";
import { localized } from "@/domain/shared/localized";
import { LiveRefresh } from "@/interface/web/components/live-refresh";
import { formatPrice } from "@/interface/web/format";
import type { Locale } from "@/interface/web/i18n/locales";
import { chime, createAudioOutput } from "@/interface/web/sound";
import { orderUpdates } from "./order-updates";

/** How often a guest's phone asks how its orders are doing (only while one is still on its way). */
const GUEST_REFRESH_MS = 8000;

/**
 * An order the guests are still waiting for: placed but not yet on the table. Once it is SERVED nothing is left to
 * announce (paying happens at the till), so a phone stops asking then, instead of asking every few seconds until
 * the bill is paid or the visit ends. A reload always shows the current state anyway.
 */
const ON_ITS_WAY: readonly OrderStatus[] = ["NEW", "CONFIRMED", "PREPARING", "READY"];

const STATUS_STYLE: Record<OrderStatus, string> = {
  NEW: "bg-gray-100 text-gray-700",
  CONFIRMED: "bg-blue-50 text-blue-800",
  PREPARING: "bg-amber-50 text-amber-900",
  READY: "bg-green-600 text-white",
  SERVED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-gray-100 text-gray-500",
  CANCELLED: "bg-white text-gray-500 ring-1 ring-gray-300",
};

type Notice = { key: string; kind: "ready" | "cancelled"; text: string };

/**
 * Shows a system notification for "your order is ready". Phones only allow this through a service worker (Android),
 * desktops also directly; where neither works nothing happens, and the notice on the page is what the guest gets.
 */
async function notify(title: string, body: string) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const options = { body, tag: "smartmenu-order-ready" };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // Not available here: the on-page notice stands.
  }
}

/**
 * "Your orders" on a guest's phone: every order of the table's visit with how far it has got, kept up to date by
 * itself while one is still on its way. When an order becomes READY the guest is told, on the page (always), with
 * a sound and a vibration (once they have touched the page, as browsers require), and with a system notification
 * if they asked for one. A cancellation is shown the same way, without the fanfare.
 */
export function GuestOrders({ orders, restaurantName }: { orders: readonly PublicOrder[]; restaurantName: string }) {
  const t = useTranslations("Menu.orders");
  const locale = useLocale() as Locale;
  const seen = useRef<Map<number, OrderStatus> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  // "default" = not asked yet; null = this browser has no notifications (the button is not shown).
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    setPermission("Notification" in window ? Notification.permission : null);
    // The first touch of the page is what lets the browser play the "ready" sound later.
    const unlock = () => {
      audio.current ??= createAudioOutput();
      void audio.current?.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  useEffect(() => {
    const result = orderUpdates(seen.current, orders);
    seen.current = result.seen;
    if (result.ready.length === 0 && result.cancelled.length === 0) return;
    const fresh: Notice[] = [
      ...result.ready.map((number) => ({ key: `ready-${number}`, kind: "ready" as const, text: t("readyNotice", { number }) })),
      ...result.cancelled.map((number) => ({ key: `cancelled-${number}`, kind: "cancelled" as const, text: t("cancelledNotice", { number }) })),
    ];
    setNotices((current) => [...current.filter((n) => !fresh.some((f) => f.key === n.key)), ...fresh]);
    if (result.ready.length > 0) {
      if (audio.current?.state === "running") chime(audio.current);
      navigator.vibrate?.([200, 100, 200]);
      void notify(t("readyNotice", { number: result.ready[0]! }), restaurantName);
    }
    // Only a change of the orders is news; `t` and the name are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders]);

  const askForNotifications = async () => {
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      // Phones show notifications only through a service worker; registering it is harmless elsewhere.
      if (answer === "granted") await navigator.serviceWorker?.register("/sw.js");
    } catch {
      setPermission("denied");
    }
  };

  const waiting = orders.some((order) => ON_ITS_WAY.includes(order.status));

  return (
    <section aria-labelledby="your-orders" className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200">
      {waiting && <LiveRefresh everyMs={GUEST_REFRESH_MS} whileHidden />}

      {notices.map((notice) => (
        <div
          key={notice.key}
          role="alert"
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 font-semibold ${notice.kind === "ready" ? "bg-green-600 text-white" : "bg-red-50 text-red-800"}`}
        >
          <p>
            <bdi>{notice.text}</bdi>
          </p>
          <button
            type="button"
            onClick={() => setNotices((current) => current.filter((n) => n.key !== notice.key))}
            className={`shrink-0 rounded-lg px-3 py-1 text-sm ${notice.kind === "ready" ? "bg-white/20 hover:bg-white/30" : "bg-white hover:bg-red-100"}`}
          >
            {t("dismiss")}
          </button>
        </div>
      ))}

      <h2 id="your-orders" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <ul className="divide-y divide-gray-100">
        {orders.map((order) => {
          const cancelled = order.status === "CANCELLED";
          return (
            <li key={order.number} aria-label={t("order", { number: order.number })} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <bdi className={`font-semibold ${cancelled ? "text-gray-400 line-through" : ""}`}>{t("order", { number: order.number })}</bdi>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[order.status]}`}>{t(`status.${order.status}`)}</span>
                </span>
                <bdi className={`tabular-nums ${cancelled ? "text-gray-400 line-through" : ""}`}>{formatPrice(order.totalFils, locale)}</bdi>
              </div>
              <p className={`text-sm ${cancelled ? "text-gray-400" : "text-gray-600"}`}>
                {order.lines.map((line) => `${line.quantity} × ${localized(line.name, locale)}`).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>

      {waiting && permission === "default" && (
        <button type="button" onClick={askForNotifications} className="self-start rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-100">
          {t("notifyMe")}
        </button>
      )}
      {waiting && permission === "granted" && <p className="text-sm text-gray-600">{t("notifyOn")}</p>}
    </section>
  );
}
