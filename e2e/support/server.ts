/**
 * The server the browser tests run against: a PRODUCTION build that Playwright makes and starts itself
 * (playwright.config.ts), on its own port and in its own build folder. So the tests
 *   - always run the code as it is now (never a server somebody started earlier),
 *   - do not care what is on port 3000, and do not touch the dev server's `.next` folder (it can keep running),
 *   - see what real users will get: some faults only show in a production build (docs/PROGRESS.md, 2026-10-11).
 * No imports here: the Playwright config loads this file before anything else.
 */
export const E2E_PORT = 3100;

/** The stand-in for the Gemini API (e2e/support/fake-gemini.mjs): the test server's assistant talks to it, never to Google. */
export const FAKE_AI_PORT = 3199;

/** Build output of the test server (git-ignored). `next.config.ts` reads the folder name from NEXT_DIST_DIR. */
export const E2E_DIST_DIR = ".next-e2e";

/** The platform's own address (no restaurant). */
export const PLATFORM_ORIGIN = `http://localhost:${E2E_PORT}`;

/** A restaurant's address: `<slug>.localhost:<port>`. Chrome resolves *.localhost names by itself. */
export const originOf = (slug: string) => `http://${slug}.localhost:${E2E_PORT}`;

/**
 * For requests made from the test process (Node), which cannot resolve *.localhost names: go to this address and
 * name the site in the `Host` header (`hostOf`).
 */
export const LOOPBACK_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
export const hostOf = (slug: string) => `${slug}.localhost:${E2E_PORT}`;
