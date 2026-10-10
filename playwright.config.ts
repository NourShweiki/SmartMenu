import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests: a real browser against the real app and the LOCAL Supabase (Docker).
 * Run: `npx supabase start` + `npx supabase db reset` (known demo data), then `npm run test:e2e`.
 * They are NOT part of `npm run check` or CI (CI has no database); like the integration tests they run locally.
 *
 * Uses the Chrome installed on the machine (no browser download). One worker: both demo restaurants share one
 * database, and the few tests that change something put it back.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000, // the dev server compiles each page the first time it is opened
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
  // Reuses `npm run dev` if it is already running; otherwise starts it.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
