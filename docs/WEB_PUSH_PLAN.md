# Plan: "your order is ready" with the page closed (web push)

Status: **W1 and W2 done and merged into `main` (PR #9, 2026-11-08); W3-W7 not built.** Nour approved the plan, W1 and W2 on 2026-11-08;
the questions below are still open (the defaults in them stand until Nour says otherwise). Written 2026-11-08 after Nour asked for a notification that reaches the
customer without the website open. Each step below is one iteration and waits for Nour's go-ahead.

## What the customer gets

1. The customer places an order (takeout, or dine-in at a table) and sees "Your orders".
2. They tap **"Notify me when it's ready"** and allow notifications.
3. They close the page or lock the phone.
4. Staff press **READY**. The phone shows "Order #12 is ready, Demo Coffee". Tapping it opens the order page.

Free: no cost per message (the browsers' own push services carry it).

| Phone | Works with the page closed? |
|---|---|
| Android (Chrome, Samsung Internet, Firefox) | Yes |
| Desktop (Chrome, Edge, Firefox, Safari) | Yes |
| iPhone / iPad, iOS 16.4+ | Only after "Add to Home Screen" and opening it from there (Apple's rule). Needs step W7. |
| iPhone, older iOS | No: the on-page notice stays the only signal |

The on-page notice, sound and vibration that exist today stay exactly as they are. Push is an extra on top.

## How it works (short)

- We create one pair of **VAPID keys** for the platform (free, generated once with a command; the private key is a
  secret in `.env.local` / Vercel, the public key is sent to the page).
- When the customer allows notifications, their browser gives a **subscription**: an address at Google's / Mozilla's /
  Apple's / Microsoft's push service plus two keys to encrypt the message. We store it with the customer's **visit**
  (the table session or the pickup visit; the visit id comes from the server-set cookie, never from the browser).
- When an order becomes READY (`moveOrderStatus` already returns `notifyCustomer: true` for this), the server sends an
  encrypted message to every subscription of that order's visit. The service worker (`public/sw.js`) receives it and
  shows the notification.

## Decisions already fixed by the rules (no question needed)

- **One codebase, settings in the database:** push is for every restaurant; no per-restaurant code. (A per-restaurant
  on/off setting is NOT planned; ask Nour if one is wanted.)
- **Multi-tenant:** every stored subscription carries `restaurant_id`; RLS on; guests never read the table directly.
- **Visit from the cookie:** the subscription is tied to the visit the server cookie names, so a guest can only ask
  to be told about their own visit's orders.
- **Bilingual:** the message is written in the language of the page the customer subscribed from (`/ar` or `/en`).
- **Never block the staff:** sending happens after the status change is saved (Next's `after()`), with a short
  timeout. A failed or slow push never fails or slows the READY button.

## Security points built in

- **No server request to an address the browser chose freely (SSRF):** the server POSTs to the subscription's
  endpoint, so the endpoint must be `https://` on a known push service only (`fcm.googleapis.com`,
  `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`). Anything else is refused when
  saving. Checked in the domain and again in the database.
- **Limits:** at most 5 subscriptions per visit; the subscribe action is rate-limited like the other guest actions.
- **Short life:** subscriptions are deleted when the visit closes or after 12 hours (the cookie's own life), and at
  once when the push service answers "gone" (404/410).
- **Nothing private in the message:** order number and restaurant name only; no items, prices, name or phone.
- **Keys:** `VAPID_PRIVATE_KEY` never committed; names documented in `.env.example`. Without keys the feature is simply
  off (the "Notify me" button keeps today's behaviour), like the AI assistant without its key.

## Steps (one iteration each, in the project's build order)

| Step | Layer | What | Tests (area `orders`) |
|---|---|---|---|
| **W1** ✅ | Domain | `PushSubscription` value (`src/domain/table-session/push-subscription.ts`): endpoint allow-list (https, default port, no user/password, known push hosts with a dot boundary), key format and length checks. **Done 2026-11-08.** The message TEXT moved to W5: user-facing strings live in `messages/ar.json` + `en.json` (arabic-rtl rule), not in the domain. | Unit (7): accepted / refused endpoints (http, other port, IP addresses, `localhost`, look-alike hosts, trailing dot, too long, spaces / control characters / backslashes), normalized form stored, wrong key sizes, alphabets and non-canonical endings. |
| **W2** ✅ | Database | **Done 2026-11-08:** migration `20261108120000_push_subscriptions.sql`, as below, plus: the endpoint is checked in the database too (`is_push_endpoint`, also a CHECK on the column; only the normalized form), keys by format, `locale` ar/en; rows are deleted by a trigger when the visit closes; the list for an order is empty unless the order is READY, the visit is live and the caller may move it (cashier: takeout only). Planned: Migration `push_subscriptions` (`id uuid`, `restaurant_id`, `session_id`, `endpoint`, `p256dh`, `auth`, `locale`, `created_at`; unique per visit + endpoint). RLS on, no direct grants. SECURITY DEFINER functions: `save_push_subscription` (restaurant slug + visit id; visit must be open and belong to that restaurant; 5-per-visit cap; endpoint allow-list again), `push_subscriptions_for_order` (staff of that restaurant with the right to move orders), `remove_push_subscription`. Old rows removed with the visit. | pgTAP: another restaurant's visit refused, closed visit refused, cap, bad endpoint refused, staff of restaurant B cannot read A's, anon cannot read. **Built: 50 pgTAP tests** (`push_subscriptions.test.sql`, area `orders`). |
| **W3** | Infrastructure | Ports `PushSubscriptionRepository` and `PushSender` (`send` -> sent / gone / failed). Supabase adapter; `web-push` adapter with VAPID keys from env, 5-second timeout; a no-op sender when keys are missing. Wired in `container.ts`. | Integration: save / list / remove against local Supabase. Unit: the sender maps 201 / 404 / 410 / timeout correctly (with a fake push server). |
| **W4** | Use cases | `subscribeToReadyNotice` (guest; visit from cookie) and `notifyOrderReady` (sends to every subscription of the order's visit, removes "gone" ones, never throws). | Unit with fakes: only READY sends, gone subscriptions removed, a failing send does not fail the use case, other visits are not told. |
| **W5** | API | The ready message text in both message files (order number + restaurant name only), chosen by the language the guest subscribed from. Server action `subscribeToReadyNoticeAction` (validates the browser's subscription JSON, reads the visit from the cookie, rate limit). The staff action `order-queue-actions.ts` calls `notifyOrderReady` inside `after()` when `notifyCustomer` is true. The public VAPID key passed to the guest page. | Unit for the action's input checks; existing staff-action tests still green. |
| **W6** | UI | `guest-orders.tsx`: "Notify me" also subscribes (`pushManager.subscribe`) and sends it to the action. `public/sw.js`: a `push` handler (show the notification) and `notificationclick` opens the orders page when no window is open. Texts in `messages/ar.json` + `en.json`. | Browser spec (both demo restaurants, /ar + /en): button appears, permission granted, a subscription is saved; a READY sent through a stand-in push server reaches the service worker. |
| **W7** | UI (small) | Web app manifest (`app/manifest.ts`: name, icons, `display: standalone`) so iPhones can "Add to Home Screen" and get push; a one-line hint for iPhone users on the order page. Overlaps with Phase 7's installable app. | Unit/browser: manifest served; hint shown on iPhone user agent only. |

Rough size: W1-W5 are small (half a day each or less), W6 is the largest, W7 small. Push can be tried for real on an
Android phone or a desktop browser after W6 (localhost works for push in Chrome; a phone needs the https address of a
deployment or a tunnel).

## Questions for Nour (before W1)

1. **Library:** `web-push` is the standard Node library. Its newest version 4.0.0 came out on 2026-11-06 (two days
   ago); the plan is to use the long-stable **3.6.7** (or wait until 4.0.0 is at least two weeks old and `npm audit`
   is clean). OK?
2. **Dine-in too, or takeout only?** The plan covers both (the spec already says dine-in guests are told when READY).
3. **iPhone (W7):** do it now, or leave it with Phase 7's installable app? Without it, iPhone users keep only the
   on-page notice.
4. **Spec change:** the spec says push is "secondary" and "no SMS for now". This plan keeps both true (push is an extra,
   the on-page notice stays the one that always works, still no SMS). SMS / WhatsApp stay a separate, paid decision.

## Not in this plan

- SMS or WhatsApp (cost per message, provider account; a separate decision).
- Push for offers / marketing (Phase 7; needs consent rules).
- Notifications for "cancelled" (could reuse everything here later; ask first).
