import { defineConfig } from "@playwright/test";
import { E2E_DIST_DIR, E2E_PORT, PLATFORM_ORIGIN } from "./e2e/support/server";

/**
 * End-to-end tests: a real browser against the real app and the LOCAL Supabase (Docker).
 * Run: `npx supabase start` (and `npx supabase db reset` for known demo data), then `npm run test:e2e`.
 * They are NOT part of `npm run check` or CI (CI has no database); like the integration tests they run locally.
 *
 * Playwright builds the app for production and starts that build itself, on its own port and in its own build
 * folder (see e2e/support/server.ts), then stops it again. Nothing else needs to be running, and a dev server on
 * port 3000 is neither used nor disturbed. The build adds about a minute to every run; that is the price of always
 * testing the current code in the form users get.
 *
 * Uses the Chrome installed on the machine (no browser download). One worker: both demo restaurants share one
 * database, and the few tests that change something put it back.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next build && npx next start --port ${E2E_PORT}`,
    env: { NEXT_DIST_DIR: E2E_DIST_DIR },
    url: PLATFORM_ORIGIN,
    // Never a server that is already there: it could be an old build. If the port is taken (a run that was killed
    // left its server behind), Playwright says so; stop that process and run again.
    // The one exception is on request, for repeating a spec quickly while writing it: start the test server
    // yourself (PowerShell: `$env:NEXT_DIST_DIR=".next-e2e"; npx next build; npx next start --port 3100`) and run with
    // E2E_REUSE_SERVER=1. You are then responsible for rebuilding after changing the app.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    timeout: 300_000, // includes the build
    // Shown, not hidden: when the build fails, its output is the only place that says why.
    stdout: "pipe",
    stderr: "pipe",
  },
});
