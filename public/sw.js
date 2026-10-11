// SmartMenu service worker. It exists for ONE reason: phones only show a web notification ("your order is ready")
// through a service worker. It is registered when a guest asks to be notified, and it caches nothing and touches
// no request (there is deliberately no "fetch" handler): the app behaves exactly as it does without it.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Tapping the notification brings the guest back to the menu page they have open.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      return open ? open.focus() : undefined;
    }),
  );
});
