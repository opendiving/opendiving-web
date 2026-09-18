import { defineConfig, devices } from "@playwright/test";

// A port of its own, so the suite never adopts a dev server on :3000 or the
// measurement build on :3001 — neither of which was built with the testing API.
const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://127.0.0.1:${PORT}`;

// The e2e suite lives outside Vitest's `src/**/*.test.*` include and is run by
// Playwright alone; `npm run ci` does not touch it. `CONTRIBUTING.md` says how
// to run it locally and why it needs no API.
export default defineConfig({
  testDir: "e2e",
  // One worker: every test drives the same production server, and `instant()`'s
  // lock is a cookie on the browser context, so two scopes running at once
  // against one origin would fight over it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // The assertions are about what paints at a click, so a slow shared runner is
  // the expected source of a false red. One retry, and a trace of the first
  // attempt to read if the retry passes too.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The header's desktop nav is `hidden md:flex`; at a phone width the "Gear"
    // link one of these tests clicks is inside a menu that has to be opened
    // first, which is a different navigation.
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, because prefetching is only enabled in production and
    // an instant navigation is a claim about a prefetched shell. `next start`
    // warns about `output: "standalone"` and serves anyway, as the measurement
    // harness already relies on.
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    // A cold `npm run build` on a shared runner.
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_EXPOSE_TESTING_API: "1",
      // Empty, not absent: a checkout's `.env` sets this to the split-origin
      // `http://localhost:8000/api/v1`, which `next build` would bake into the
      // bundle. The tests answer the API from the browser, and `src/proxy.ts`
      // derives `connect-src` from this same variable — so a baked cross-origin
      // base would have the CSP refuse those requests before Playwright's router
      // ever saw them. Empty puts the client back on the relative `/api/v1`.
      // `@next/env` leaves a key already in `process.env` alone, so this wins
      // over `.env` in a checkout, and a worktree has no `.env` to begin with.
      NEXT_PUBLIC_API_URL: "",
    },
  },
});
