# Phase 6 summary: onboarding tools

Written 2026-10-12 for Nour. Phase 6 set out to make it possible to set up a new restaurant in under a day. This is what was built, step by step, what changed in each step, what was decided, and what is still open. The detailed working log is in [`PROGRESS.md`](PROGRESS.md).

## Where things stand

- Five of the six steps are finished and tested. The sixth (menu import by AI) is built but has never been run against the real AI service: it needs an AI key and your decision on cost.
- Custom domains were moved to Phase 7 by your decision.
- Everything runs on the local machine. Menus are mock data.
- Tests at the end of the phase: 476 unit, 42 integration, 417 database, 168 browser tests.
- The last full browser run passed 167 of 168. The one failure was a takeout order that took over 20 seconds to send; it passed when re-run. The cause is not known (see "Open items").

## Step 1: the team's setup tool

**What it does.** On the platform's own address (`/en/setup`, without a restaurant name in front), the SmartMenu team signs in, sees every restaurant, and creates a new one: names, web address, business type and the owner's email.

**What changed.**
- A "founder" is a person listed by hand in the database. Being a founder gives no access to any restaurant's data.
- A new restaurant, its settings (from the business type: dine-in or takeout) and its owner's account are created together or not at all. Sending the form twice creates nothing the second time.
- The owner gets a temporary password, shown once to the founder. At first sign-in the owner must choose their own; until then nothing else opens.
- Every member of staff can change their own password (the current one is asked for; at least 10 characters).
- The list shows each restaurant's owner, with a button to issue a new temporary password.

**Decided by you:** the owner's first password is a temporary one, not an invitation email.

## Step 2: staff accounts

**What it does.** The owner and the manager open **Staff** on the dashboard: who works here, add a member, change a role, give a new temporary password, remove.

**What changed.**
- New members are managers, waiters or cashiers. Owners are only created by the team.
- Nobody can change or remove themselves, and a restaurant can never be left without an owner. The database enforces both.
- An email that is in use at another restaurant is refused. Somebody who was removed can be hired again and keeps the same account.
- Removing somebody takes them out of the restaurant; the account is kept, so past orders still know who handled them.

**Decided by you:** these rules ("go ahead with these rules").

## Step 3: takeout

**What it does.** Where a restaurant takes takeout orders, a phone that has not scanned a table orders takeout: name, Jordanian mobile number, order number, collect and pay at the cashier. Demo Coffee (takeout only) can now take orders.

**What changed.**
- A takeout order belongs to a "pickup visit": the same thing as a table visit, without a table, carrying the customer's name and number. It starts with its first order and ends by itself when its last order is completed or cancelled.
- No service charge on takeout; tax as usual.
- The customer follows the order on the same phone like a table order, and can add to it while it is in progress without typing the name again.
- Staff see takeout orders in the same Orders screen, marked "Takeout" with the name and a number to call, and "handed over" instead of "served".
- The cashier can do every step of a takeout order. At a table the cashier still only completes.
- On a restaurant with both, a phone that scanned a table orders for the table; any other phone orders takeout.

**Decided by you:** "do what's best with takeout". The design above is mine and is written into the spec; change it there if it is wrong.

## Step 4: the owner's setup checklist

**What it does.** While a restaurant is being set up, the owner's dashboard lists what is still missing before the first order, each line a link to the screen that fixes it.

**What changed.**
- The lines: an item on the menu, tables with QR codes (only where there is table ordering), a logo or written details, staff (optional), a test order.
- Nothing is stored. Each line is worked out from what the restaurant has, so it ticks itself, and unticks itself if the thing goes away.
- The list disappears once everything required is done.

## Step 5: menu import from a spreadsheet

**What it does.** Under **Menu → Import from a spreadsheet**, the owner or manager uploads a CSV file (what Excel and Google Sheets export), sees a preview, and imports.

**What changed.**
- The preview shows every row and names every problem. Nothing is added until Import is pressed, and one bad row stops the whole file.
- New categories are created, existing ones are used. An item that is already there is skipped, so the same file can be imported twice.
- A template can be downloaded from the page. Up to 300 rows per file.
- Not in the file: option groups, photos, hidden and sold-out marks. Excel's own `.xlsx` format is not read; the page says to save as "CSV UTF-8".

## Step 6: menu import by AI (built, not proven)

**What it does.** On the same import page, the owner uploads a photo or PDF of the printed menu. An AI model drafts the rows, which go into the same preview as a spreadsheet. The owner checks and imports.

**What changed.**
- The feature only appears when an AI key is configured on the server. Without one the page says it is not switched on. That is the state today.
- The model is told to list only what is printed, never to invent an item or a price, and to leave a price empty when it cannot read it; the preview then flags that row.
- Files: JPG, PNG, WebP or PDF, up to 5 MB.

**What is not done.** This has never been run against the real AI service. I wrote it from the service's documentation and tested it with a stand-in for the network. Before relying on it, it needs one real run with a key.

**Needs you:**
- An Anthropic API key, put into `.env.local` as `ANTHROPIC_API_KEY` (never into the code).
- A decision on cost: every draft is one paid call on that key's account. I have not measured what a menu costs.

## Moved out of this phase

- **Custom domains** go to Phase 7, by your decision.

## Open items

None of these blocks the next phase. Each needs a decision or belongs to the hardening phase.

| Item | Why it matters |
|---|---|
| Placing an order was very slow once or twice in the test runs (over 20 seconds) | Cause not found. Worth investigating before a pilot. |
| Takeout orders can be sent by anybody, under any name and number, without limit | Prank orders would reach the kitchen. Decide before a takeout client goes live. |
| May the cashier cancel a takeout order nobody collects? | Today only the owner or manager can. Your call. |
| The team's sign-in is protected by a password only | A second factor belongs in the hardening phase. |
| One email can own only one restaurant | An owner with two branches needs two emails for now. |
| The last four database changes have not been replayed from an empty database | Proving it needs a reset, which wipes local data. Say when. |
| An import never updates an item that already exists | A changed price in the file is ignored. |
| Nothing records who added, changed or removed staff | An activity log is not built. |

## How to look at it

Start the app (`npm run dev`) and open:

| What | Address |
|---|---|
| Team setup tool | http://localhost:3000/en/setup |
| Staff screen, checklist, menu import | http://demo-dinein.localhost:3000/en/staff |
| Takeout as a customer | http://demo-takeout.localhost:3000/en/menu |
| Takeout as staff | http://demo-takeout.localhost:3000/en/staff/orders |

Demo accounts and their password are in `supabase/seed.sql`. When trying things by hand, name what you create "E2E ..." so the test cleanup removes it, and do not press the password or remove buttons on the demo accounts.
