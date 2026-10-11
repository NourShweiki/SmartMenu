# PROJECT_SPEC.md — Smart Menu Restaurant System

This file is the source of truth for Claude Code. Read this in full before writing any code. Follow the working rules in Section 1 for every single iteration, no exceptions.

---

## 1. Working Rules (read first, follow always)

**Iteration discipline:** Work in small iterations only. One iteration = one use case, one screen, or one clearly scoped fix — never "build the whole menu system" in one shot. Touch at most ~3–5 files per iteration unless explicitly told otherwise.

**After every iteration, stop and report in this exact format, then wait for approval before continuing:**

```
## What I did
- ...

## Why
- ...

## What's next
- ...

## Waiting for your go-ahead
```

**Do not skip ahead** to a layer that hasn't been approved yet (e.g. no UI before the matching use case exists and is approved). If a requirement changes mid-build, state which layer(s) are affected before making changes, so the blast radius is visible before you act.

**Set up skills first, before any building starts** (done manually by the team — see Section 9 for what each skill should contain).

---

## 2. Vision & Strategy

Three co-founders are building restaurant software for the Jordanian market, benchmarked against **Toast** (US) and **Foodics** (Jordan/MENA) — aiming to beat them with AI features and better local fit.

**The big goal:** a full **"Super POS"** system eventually — cashier, payments, printing, inventory — sold as a base product plus a paid advanced tier.

**The strategy:** Jordanian restaurants already have a POS and won't switch for an unproven company. So the first product is a standalone **Smart Menu** that works *alongside* whatever system a restaurant already has. It requires no replacement commitment, builds clients and reputation, and funds/informs the eventual full POS.

Everything is **API-first** and **multi-tenant from day one**, so the Smart Menu, later modules, and the eventual Super POS all plug into the same backend without a rebuild.

---

## 3. Product Scope — Phase 1: Smart Menu Platform

One shared platform serves **all restaurant clients** from a single codebase. Each restaurant's behavior is controlled by **settings/toggles in the database**, never custom code per client.

### 3.1 Three order modes (a client enables any combination)
1. **Dine-in** — customer orders from the table via QR, pays when leaving
2. **Takeout** — customer orders ahead, picks up and pays at the cashier
3. **Delivery** — only if the restaurant has its own delivery crew (build after dine-in/takeout are solid — bigger scope: addresses, fees, driver assignment)

### 3.2 Core pieces
- **Customer-facing menu** — installable as a PWA from the browser, no app store. Push notifications for offers (iOS requires "add to home screen" first — treat push as secondary, not the primary channel).
- **Staff order screen** — live incoming orders on any tablet, sound alert on new order, status flow below.
- **Owner portal** — owner edits menu, prices, photos, hides items, marks sold out, toggles features, edits branding — no code changes needed.
- **Internal setup portal** — the founders' own tool to onboard a new client fast (Section 7).

---

## 4. Dine-in Design — "Table Session" Model

This is the most fully designed flow. Build this first.

### Core concept
A **Table Session** is the central entity. Every order, service request, payment, feedback item, and notification for one visit belongs to one Table Session — not to an individual order. Fields: Session ID, Table ID, Status, Start/End, Duration. **Multiple customer devices can share one session** (several people at the same table).

### Customer flow
Scan table QR → join/create session → browse digital menu (an AI assistant can take natural-language orders, but **must be strictly grounded to real live menu data** — it must never invent items, prices, or availability) → build draft order → confirm → **can still add more items after confirming** → can request waiter / cleaning / payment → can view running bill → gets notified when order is ready → leaves feedback at session end.

### Order status flow
`NEW → CONFIRMED → PREPARING → READY → SERVED → COMPLETED`
On **READY**, push a notification to the customer's session device(s).
**Rule:** when a customer adds items after confirming, the addition re-enters the flow at NEW (kitchen treats it as freshly needed work, not something already done).
**Decided (Nour, 2026-10-11):** dine-in guests are notified when their order is READY too, not only takeout customers. (Assumed channel for dine-in: a notice on the devices that joined the table session, since no phone number is collected at a table; SMS for dine-in would mean asking the guest for a number first. Confirm before building SMS for dine-in.)
**Decided (Nour, 2026-10-11): only staff can cancel an order.** A customer cannot cancel an order or remove items from it once it is placed; they ask the staff. Still to settle when it is built: which roles may cancel, up to which status, and how a cancelled order shows on the bill.
**Open question — needs a decision before building this part:** can staff remove single items from a placed order, or only cancel the whole order?

### Staff roles
- **Waiter (tablet):** confirms orders as they arrive, handles service requests (waiter call, cleaning), tells the cashier when a table is ready to pay. **Does not** hand this off automatically — it's a manual "ready to pay" signal to the cashier.
- **Cashier:** billing and closing only — confirm payment, generate receipt, close the session. **Does not see service requests** — that's the waiter's screen only. **Decided (Nour, 2026-10-10):** the cashier takes an order from SERVED to COMPLETED after the customer has paid, and may do nothing else to an order; the waiter moves orders up to SERVED but cannot complete them. Owner and manager can do every step. Enforced by the database, not only the screens.
- **No kitchen role or kitchen screen (decided by Nour, 2026-10-11):** the waiter moves an order through every step up to SERVED, as built. The roles stay Owner, Manager, Waiter, Cashier.
- **Owner/Manager:** full dashboard — sales, menu/category/modifier management, table & staff management (incl. QR generation, roles/permissions), order & payment history, reports & analytics.

### Session lifecycle (full loop)
Table QR Scan → Create/Join Session → Session Timer Starts → Browse Menu → AI Assistant or Manual Order → Order Created → Order Processing → **(loop: more orders / service requests can happen here)** → Serve Order → Customer Notification → Order Ready → Request Payment → Payment Confirmed → Session Ends (timer or manual) → Session Closed → Table returns to AVAILABLE.

### AI Feedback Analysis (owner side)
Categorizes complaints vs. suggestions, groups recurring issues, assigns priority.

### Open question
How does takeout/delivery map onto this Table-Session-style model, since there's no physical table? Likely needs an equivalent "Order Session" concept — not yet designed. Flag this before building takeout/delivery.

---

## 5. Data Model Rules (decided — treat as fixed constraints)

These are expensive to change later, so they are locked in:

- **Multi-tenant:** every table/record carries a `restaurant_id`. Data must be fully isolated per restaurant — no restaurant can see another's data under any circumstance.
- **API-first:** menu, orders, and statuses go through one clean API. Customer menu, staff screen, owner portal, and the future Super POS are all just clients of this API.
- **Settings-driven:** enabling/disabling a mode or feature per client is a database setting, never custom code per client.
- **Order price snapshot:** an order stores the item name/price *at the time of ordering* — later menu price edits must never retroactively change past orders.
- **Arabic + English, RTL support from day one** — this is not a later add-on.
- **Money stored as whole numbers in fils** (JOD has 3 decimal places — do not use a 2-decimal "cents" pattern). Include fields for tax and service charge.
- **UUIDs, not sequential IDs** — for clean future merging with the Super POS.
- **Roles:** Owner, Manager, Waiter, Cashier.
- **Table QR codes (decided with Nour, 2026-10-10):** the QR code carries a random token of at least 128 bits, never the table number, so a printed code survives renaming, cannot be guessed for another table, and can be replaced individually. The link has no language in it (`/t/<token>`); it redirects to the restaurant's default language. A table has one live session at a time. **A session closes automatically 2 hours after it starts (decided by Nour, 2026-10-10)**; staff can still end it earlier, and after it ends the next scan starts a fresh session.
- **Custom domains:** one codebase resolves the restaurant from the incoming domain. Every client starts on a subdomain (`name.ourapp.com`); custom domain is an upsell. Note: installed PWA + push subscriptions are tied to the domain — changing domains loses them. QR codes must point at a stable URL.
- **Loyalty points:** customers identified by **phone number only**, no login/account system. (Known tradeoff: no strong verification — flag for a lightweight safeguard like OTP later, not required at launch.)
- **Menu UI editing (owner-facing):** NOT a fixed theme picker, and NOT fully open design freedom. A constrained branding system — colors, logo, layout/section choices, possibly fonts/images — from a defined set of options. **DECIDED (Nour, 2026-10-10):** the editable elements are a **logo**, **one accent colour from a fixed palette of 8** (each readable with white text), and **written details** (restaurant name, tagline, about, address, phone, opening hours; Arabic + English). Built in Phase 3 step 12. Anything beyond this (fonts, layouts, custom colours, custom CSS) must NOT be added without asking: do not let this silently expand into full custom design per client.

---

## 6. Features Confirmed as Phase 1 Scope

All of the following are Phase 1 (Smart Menu), not deferred to the later full-POS stage:

- Weekly report to the owner (part of Reports & Analytics)
- SMS when order is ready
- Push offers via the installed PWA
- Owner-editable menu UI (see constraints in Section 5)
- Data analysis based on orders (sales, popular items, peak hours, average order value)
- Custom domain/subdomain per client (see Section 5)
- Loyalty points via phone number (see Section 5)
- Sound notification on new incoming order (staff screen)

This means Phase 3 (menu & owner portal) and Phase 6 (onboarding/reports) carry more scope than a minimal build — size estimates should account for this.

---

## 7. Fast Client Onboarding (target: under 1 day per client)

- **Presets by business type** — choosing "dine-in" or "takeout" auto-configures sensible default settings.
- **Bulk menu import** — spreadsheet upload, or AI reading a photo/PDF of an existing menu to draft items for review.
- **Simple branding only** — logo, colors, name via settings, within the constraints from Section 5.
- **Setup checklist** — menu, tables & QR codes, domain, test order, staff training.
- **Rule:** "Configure, don't customize." A one-off client request becomes a real feature only if the pattern repeats across multiple clients — it never becomes custom code for one client.

---

## 8. Clean Architecture (how the code must be structured)

Requirements will change often. Clean Architecture isolates business rules from frameworks, UI, and the database, so a changing requirement touches one layer instead of the whole codebase.

### Layers (outer depends on inner, never the reverse)
```
┌─────────────────────────────────────────┐
│  Infrastructure (outermost)              │
│  Supabase client, SMS/push provider,      │
│  file storage, payment later              │
├─────────────────────────────────────────┤
│  Interface / API                         │
│  Next.js routes, request/response shapes │
├─────────────────────────────────────────┤
│  Application (use cases)                 │
│  "confirm order", "add item to session", │
│  "mark ready", "close session"           │
├─────────────────────────────────────────┤
│  Domain (innermost — pure logic)         │
│  Restaurant, Table Session, Order,       │
│  Menu Item, statuses, business rules     │
└─────────────────────────────────────────┘
```
- **Domain:** plain logic, no framework imports. E.g. "an order can only move from CONFIRMED to PREPARING." No Supabase import here.
- **Application:** one use case per action (e.g. `confirmOrder`, `addItemToSession`). Calls domain rules; calls infrastructure only through an interface, never directly.
- **Interface/API:** Next.js API routes — thin, just translates HTTP in/out to a use case call.
- **Infrastructure:** the only layer allowed to import Supabase, SMS providers, etc.

### Folder structure
```
/domain
  /restaurant
  /table-session
  /order
  /menu
/application
  /use-cases
/interface
  /api
  /web (customer menu, staff screen, owner portal)
/infrastructure
  /supabase
  /notifications (sms, push)
```

### Build order
1. Domain models first (Restaurant, Table Session, Order, Menu Item, statuses) — no database yet, just types + rules, testable in isolation.
2. Infrastructure adapter for Supabase — implements storage for the domain models.
3. One use case end-to-end (e.g. "create order") — proves all 4 layers connect.
4. Interface/API layer for that use case.
5. Repeat per feature: domain → infrastructure → use case → API → UI, always in that order.
6. UI last, per screen (owner portal → customer menu → staff screen), consuming the API only.

Domain rules get built and agreed on first because they're the hardest to change. UI comes last because it's the most likely to be revised and the cheapest to redo.

---

## 9. Tech Stack & Tooling

- **Next.js + TypeScript** — one project for customer menu, staff screen, and owner portal
- **Supabase** — Postgres, auth, image storage, and live/real-time updates (powers instant order updates on the staff screen)
- **Claude Code** — primary dev tool
- **Hosting** — DECIDED (2026-10-03): **Vercel + Supabase** for now. Vercel builds every push (preview URL per branch/PR, `main` = test environment). Supabase is standard Postgres, so moving to AWS later stays possible.

### Skills to set up before building starts (`.claude/skills/<name>/SKILL.md`)
- `architecture-rules` — the layer rules from Section 8, so Claude Code enforces them on every file it writes
- `data-model` — the constraints from Section 5 (restaurant_id, fils, snapshot pricing, UUIDs, etc.)
- `arabic-rtl` — bilingual field handling and RTL layout rules
- Use the built-in `/code-review` skill after each iteration.

### Process
- **Jira:** Phase = Epic, Feature = Story, small piece = Task. Board: Backlog → In Progress → Review → Testing → Done. Nothing is "Done" without tests + review.
- **CI/CD:** every push runs checks/tests/build; merge to main auto-deploys to a test environment; going live is a manual approval step.
- **Testing:** built alongside each phase, not left to the end — unit tests from this spec, plus end-to-end tests (Playwright) clicking through the real menu and staff flows.

---

## 10. Roadmap — Phases

Each phase ends with something demoable.

0. **Planning** — this spec, confirmed. *Done when: team agrees on it.*
1. **Foundation** — repo/branching, project skeleton, database, dev/test/live environments, first CI/CD pipeline. *Done when: a push auto-builds/tests/deploys a blank app.*
2. **Core backend** — restaurants, users/roles, auth, data isolation, settings storage. *Done when: two test restaurants exist and can't see each other's data.*
3. **Menu & owner portal** — categories, items, options, prices, photos, hide/sold-out, Arabic/English, branding system. *Done when: an owner can build/edit a full menu and theme.*
4. **Customer ordering** — customer menu, cart, dine-in with table QR, takeout with phone number, order creation. *Done when: a customer can place an order end-to-end.*
5. **Staff order screen** — live orders, sound alert, status changes, order-ready SMS, waiter/cashier role split. *Done when: a placed order appears instantly and "Ready" texts the customer.*
6. **Onboarding tools** — presets, bulk/AI menu import, branding, custom domains, setup checklist. *Done when: a test client is fully set up in under a day.*
7. **Installable app & notifications** — PWA install, push offers, consent handling.
8. **Hardening** — security review, load testing, error monitoring, backups, data protection check.
9. **Pilot** — one real restaurant, real orders, daily feedback and fixes.
10. **Launch & iterate** — more clients → delivery mode → AI features → eventually the full Super POS.

---

## 11. Team

| Person | Background | Suggested Focus |
|---|---|---|
| **Nour** | DevOps/AWS/Terraform/Docker/CI-CD, some front-end/UI-UX | Repo, environments, CI/CD, Jira, security & data isolation, monitoring/backups, deployment, internal setup tooling |
| **Abdullah** | React, Tailwind, Arabic/English RTL, Flutter, Supabase, SQL, built an Oracle APEX POS before | Data model, owner portal, customer menu, staff order screen |
| **Omar** | AI/LLM agents, Python, JavaScript, Playwright; built a restaurant ordering chatbot before | Notification service, AI menu import, AI ordering assistant, push notifications, E2E testing |

---

## 12. Open Questions (resolve before the relevant phase starts)

- Can staff remove single items from a placed order, or only cancel the whole order? (customers can do neither: decided 2026-10-11, see Section 4)
- How does takeout/delivery map onto the Table-Session model? (blocks Phase 4/10 delivery work)
- Loyalty points: exact earn/redeem rules (blocks Phase 6/10 loyalty work)
- ~~Menu UI editing: exact list of editable elements~~ — DECIDED 2026-10-10 (see Section 5)
- Order cancellation details: only staff can cancel (decided 2026-10-11); which roles, up to which status, and the effect on the bill are still open (CANCELLED status is not built yet)
- Is tax charged on top of the service charge? (assumed yes; kept as is by Nour, 2026-10-10)
- Pricing model (intentionally deferred — doesn't block building)
- Who owns finding/talking to the first pilot restaurant (doesn't block building)

---

*This is a living document. Update it when a decision changes — don't let Claude Code work from stale assumptions.*
