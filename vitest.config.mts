import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Repeated into each project below, deliberately. `resolve.alias` is **not**
// inherited by inline projects - a project that omits it resolves no `@/...`
// import at all, and the failure reads as a missing module rather than as a
// missing alias.
const alias = { "@": path.resolve(dirname, "./src") };

// Anything ending `.browser.test.ts(x)` belongs to the second project. The unit
// project's own `src/**/*.test.{ts,tsx}` matches those files too - `*` spans
// dots - so the two are separated by an exclude rather than by the include
// patterns being disjoint. `configDefaults.exclude` is spread back in because
// setting `exclude` replaces the defaults outright, and dropping them would
// walk `node_modules` looking for tests.
const BROWSER_TESTS = "src/**/*.browser.test.{ts,tsx}";

// Code that only ever runs on the server - the map renderer, the middleware,
// route handlers and the modules behind them - is tested in Node, where `fetch`,
// `AbortSignal` and `Response` are the ones it runs against in production rather
// than jsdom's. A project of its own, because the unit project's setup file
// patches a `window` that Node does not have.
const NODE_TESTS = [
  "src/map-renderer/**/*.test.ts",
  "src/proxy.test.ts",
  "src/app/robots.test.ts",
  "src/app/healthz/route.test.ts",
  "src/lib/api-proxy.test.ts",
  "src/lib/api/config.server.test.ts",
  "src/lib/runtime-config.test.ts",
];

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...configDefaults.exclude, BROWSER_TESTS, ...NODE_TESTS],
          // Scoped to this project, and that is the point rather than tidiness.
          // `vitest.setup.ts` is a jsdom patch kit - a no-op `ResizeObserver`, a
          // `matchMedia` that always answers false, pointer-capture no-ops.
          // Root `setupFiles` *are* inherited by projects, so left at the root
          // it would load into the real browser below and override working
          // implementations with stubs, breaking precisely the behaviour a real
          // browser was brought in to test.
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          include: NODE_TESTS,
          exclude: [...configDefaults.exclude, BROWSER_TESTS],
          setupFiles: ["./vitest.setup.node.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "browser",
          include: [BROWSER_TESTS],
          setupFiles: ["./vitest.setup.browser.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Every layer is in scope, so "coverage is fine" says something about the
      // layers where error handling and stale state go wrong, not only about `lib/`.
      include: [
        "src/lib/**/*.{ts,tsx}",
        "src/hooks/**/*.{ts,tsx}",
        "src/contexts/**/*.{ts,tsx}",
        "src/components/**/*.{ts,tsx}",
        "src/app/**/*.{ts,tsx}",
        "src/proxy.ts",
        "src/map-renderer/**/*.ts",
      ],
      exclude: [
        // Vendored from shadcn/ui and deliberately kept close to upstream, so its
        // coverage number would measure how much of someone else's library this app
        // happens to render rather than anything about this app.
        "src/components/ui/**",
      ],
      // Floors, not targets, checked by `npm run test:coverage` - CI does not run it.
      // Set just under the current numbers so a real drop fails the run without
      // ordinary movement doing so. Raise them as coverage grows; lowering one to
      // make a run pass is the thing they exist to prevent.
      //
      // The global numbers look low because `components/` and `app/` are in scope and
      // almost entirely untested. That is deliberate: the scope makes the gap *visible*
      // in the report rather than flattering the headline figure. The per-directory
      // floors below are what actually hold the tested layers to account.
      thresholds: {
        statements: 24,
        branches: 19,
        functions: 18,
        lines: 23,
        "src/lib/**": {
          statements: 60,
          branches: 70,
          functions: 45,
          lines: 60,
        },
        "src/hooks/**": {
          statements: 42,
          branches: 32,
          functions: 38,
          lines: 44,
        },
        "src/contexts/**": {
          statements: 80,
          branches: 60,
          functions: 78,
          lines: 82,
        },
      },
    },
  },
});
