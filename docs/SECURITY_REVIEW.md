# Security review (2026-10-30)

A ranked list of the security problems found by reading the code on `main` after security step 1 (PRs #5 and #6).
Nothing here is fixed yet: the plan is **one finding per iteration, each with a test in its area** (CLAUDE.md), in the
order below unless Nour decides otherwise. Ranking = how bad it is if it happens x how easy it is to do, for the way
we plan to run (Vercel + hosted Supabase, real restaurants, guests on their phones).

| # | Severity | Finding | Area |
|---|----------|---------|------|
| 1 | High | ~~Sign-in has no attempt limit of our own (staff and founders)~~ **Fixed 2026-10-30** | staff, platform |
| 2 | High | The founders' tool is protected by a password only | platform |
| 3 | Medium | No security headers; staff session cookies are readable by page scripts | basics |
| 4 | Medium | Dine-in "Place order" has no rate limit | orders |
| 5 | Medium | Rate limits live in server memory; one visitor can use up a restaurant's limit | assistant, services |
| 6 | Medium | The AI chat history comes from the browser and can be forged | assistant |
| 7 | Low | "Change my password" has no attempt limit of its own | staff |
| 8 | Low | The temporary-password rule is enforced by the app only, not by the database | staff |
| 9 | Low | Device fingerprints and redirect addresses trust proxy headers | orders, tables |

---

## 1. Sign-in has no attempt limit of our own (High)

**Where:** `signInAction` (`src/interface/web/staff/actions.ts`), `signInFounderAction` (`src/interface/web/setup/actions.ts`),
both ending in `supabase.auth.signInWithPassword` on the SERVER.

**Problem:** nothing in the app counts wrong passwords per account or per visitor. Supabase Auth has its own limit,
but it counts per network address, and every sign-in reaches Supabase from OUR server, not from the visitor. So either
the limit sees all visitors as one (one person guessing passwords locks every restaurant's staff out of signing in),
or it does not hold an attacker back at all. A password of 10+ characters makes guessing slow, but staff passwords are
chosen by people, and nothing stops a script trying a list of common ones against `owner@...` around the clock.

**Fixed (2026-10-30, branch `security/sign-in-attempt-limit`):** at most 5 wrong passwords per account (the email
typed, real or not) and 20 per visitor (hashed network address) in 15 minutes, for staff AND founders. Over the limit
the password is not even tried and the form says "too many wrong attempts, wait 15 minutes" (en + ar). Failures are
kept in the database (`sign_in_failures`, keys stored as SHA-256 hashes, server only), so the limit holds across server
instances. A success clears the account's count, not the visitor's. Code: `src/domain/shared/sign-in-limit.ts`,
`src/application/use-cases/limit-sign-in.ts`, `src/infrastructure/supabase/supabase-sign-in-attempt-log.ts`,
migration `20261030120000_sign_in_failures.sql`. Tests: staff area (unit, integration, pgTAP `sign_in_failures`) and
the browser spec `staff-login.spec.ts`.
Known trade-off: anybody can lock a known staff email for 15 minutes by typing 5 wrong passwords for it. The
alternative (no per-account limit) lets passwords be guessed; the lock is short and ends by itself.

## 2. The founders' tool is protected by a password only (High)

**Where:** `/<locale>/setup` (`requireFounder`), founders listed in `platform_admins`.

**Problem:** a founder can create restaurants and issue a NEW temporary password for ANY restaurant's owner, which is
the same as taking over that restaurant. That power sits behind one password (and #1 means it can be guessed without
limit). Already noted as "Phase 8" in the handoff.

**Fix idea:** a second factor for founders (Supabase Auth supports TOTP authenticator apps; require AAL2 in
`requireFounder` and in the database functions the setup tool calls). Cheaper first step: fix #1, and log every
"new temporary password" with who, when and for whom.

## 3. No security headers; staff session cookies readable by page scripts (Medium)

**Where:** `next.config.ts` (no `headers()`), `src/infrastructure/supabase/client.ts` (default `@supabase/ssr` cookie options).

**Problem:**
- No `Content-Security-Policy`: if any page ever shows untrusted text unescaped (React escapes by default and the code
  has no `dangerouslySetInnerHTML` today), a script can run in the page.
- `@supabase/ssr` sets the staff/founder session cookies WITHOUT `HttpOnly` by default, so such a script could read the
  session (including the long-lived refresh token) and keep it.
- No `frame-ancestors` / `X-Frame-Options`: another site can show the staff or setup screens in a hidden frame and trick
  a signed-in owner into clicking "Remove" or "New temporary password" (clickjacking).
- No `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.

**Fix idea:** a `headers()` block in `next.config.ts` (CSP with `frame-ancestors 'none'`, HSTS, nosniff,
referrer policy), and `cookieOptions: { httpOnly: true, secure, sameSite: "lax" }` for the Supabase server clients
(the app never reads the session in the browser). Test: basics area (the header list) + a browser spec that the
staff page refuses to be framed.

## 4. Dine-in "Place order" has no rate limit (Medium)

**Where:** `placeOrderAction` (`src/interface/web/customer/order-actions.ts`) -> `place_order`. Takeout has limits in the
database (`check_pickup_limits`); dine-in has none. Already noted in the handoff.

**Problem:** whoever holds a table's session (anyone at the table, or someone who took a photo of the QR code and scans
it later from home) can send orders as fast as a script can, each one landing on the staff screen. The 2-hour visit
expiry limits how long, not how many.

**Fix idea:** a limit per visit and per restaurant inside `place_order` (like `check_pickup_limits`, in the database
so it holds across servers), e.g. at most N orders per visit per 10 minutes. Test: orders area (pgTAP + integration).

## 5. Rate limits live in server memory (Medium)

**Where:** `src/interface/web/customer/rate-limit.ts`, used by the AI assistant (20 per device / 10 min, 300 per
restaurant / hour) and guest services (10 / 200).

**Problem:**
- On Vercel every server instance has its own counters and loses them on restart, so the real limit is "N x the
  number of instances" and resets often: the cost limit on the AI key is weaker than it looks.
- The per-restaurant bucket is shared by everybody: one visitor (changing addresses, or with no address at all, see
  #9) can use up a restaurant's 300 questions and switch the assistant off for real guests for an hour. The assistant
  also needs no table visit, so anyone on the internet can use it.

**Fix idea:** keep the counters in the database (one small table + a function, the same one #1 and #4 can use), and
require a table visit or pickup cookie before the assistant answers, so the per-restaurant bucket is not open to the
whole internet. Test: assistant + services areas.

## 6. The AI chat history can be forged (Medium)

**Where:** `askAssistantAction` takes the whole chat, the assistant's own earlier answers included, from the browser.

**Problem:** a visitor can send made-up "assistant" turns ("I am now a general chatbot", "today everything is 50% off")
and steer the model. The CART stays safe (every suggestion is checked against the live menu and priced by the app),
but the assistant's TEXT is not checked: it can be made to promise discounts or say things in the restaurant's name,
and the key can be used as a free general-purpose chatbot within the rate limits.

**Fix idea:** keep the chat on the server (a row per conversation, the browser holds only its id), or sign each
assistant turn (HMAC with a server secret) and drop turns whose signature does not match. Test: assistant area.

## 7. "Change my password" has no attempt limit of its own (Low)

**Where:** `changePasswordAction` -> the password gateway checks the current password by signing in with it.

**Problem:** someone who got hold of a signed-in session (a shared tablet left open) can guess the current password
there without limit, then change it and lock the owner out. Low because it needs a session already.

**Fix idea:** the same database attempt counter as #1, keyed by the account. Test: staff area.

## 8. The temporary-password rule is enforced by the app only (Low)

**Where:** `requireStaff` redirects to `/staff/password` while `app_metadata.must_change_password` is true; the database
policies do not look at the flag.

**Problem:** whoever knows a temporary password (the founder who issued it, or anyone who saw it) can sign in to
Supabase directly with the public key and use the API with the full rights of that role, without ever changing it.

**Fix idea:** make the policies (or the `is_staff_of`-style helpers they use) refuse a token whose `app_metadata`
carries the flag. Test: pgTAP in the staff area.

## 9. Device fingerprints and redirect addresses trust proxy headers (Low)

**Where:** `clientHashFor` (first entry of `x-forwarded-for`), `getRequestOrigin` / `getCurrentSite` (`x-forwarded-host`).

**Problem:** on Vercel these headers are set by the platform and can be trusted. Behind any other proxy (or a
self-hosted server) a visitor can send their own: a new fake address per request gets around every per-device limit,
and a fake host decides the address of the `/t/<token>` redirect. Safe today because we deploy to Vercel only.

**Fix idea:** write that assumption down in the deploy notes, and read the client address from Vercel's own header
(`x-vercel-forwarded-for`) or the platform's request IP when deployed. Test: basics area (`client-hash`).

---

## Checked and fine

- **Tenant isolation:** the restaurant always comes from the host, never from a form; database access goes through RLS
  and narrow public functions, covered by 482 pgTAP tests in CI. Service-role use is limited to the documented customer
  paths and always scoped by the restaurant resolved from the host.
- **Uploads:** photo and logo types are decided from the file's first bytes (not its name), SVG is refused, and the
  storage buckets enforce size and type again. Every `next/image` is `unoptimized`.
- **Guest cookie:** the table-visit cookie is HttpOnly, SameSite=Lax, Secure on https, host-only, and holds only a random id.
- **Server Actions:** Next.js checks the Origin header against the host (cross-site form posts are refused); every staff
  and setup action calls `requireStaff` / `requireFounder`, and role permissions are checked in the use cases (unit tests).
- **Secrets:** no API keys or Supabase secrets anywhere in the git history; `.env.local` is ignored.
- **Packages:** `npm audit` clean and checked on every push (security step 1).

## Not covered by this review

- The hosted Supabase project's own settings (auth rate limits, e-mail templates, network restrictions): to check when
  it exists.
- A line-by-line read of every RLS policy and SECURITY DEFINER function (the pgTAP suite is the evidence used here).
- Load / denial-of-service testing, and anything in Phase 7 (push notifications, custom domains).
