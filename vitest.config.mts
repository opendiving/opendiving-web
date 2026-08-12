import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Registers jest-dom's matchers and the handful of browser APIs jsdom lacks
    // that Radix needs - see the file for which and why.
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      // "text"/"html" are for local/browsable reports; "json-summary" feeds
      // scripts/coverage-summary.mjs, which renders the GitHub Actions job
      // summary (see .github/workflows/ci.yml).
      reporter: ["text", "html", "json-summary"],
      // Was `src/lib/**` only, which made `hooks/`, `contexts/`, `components/` and
      // `app/` invisible to the report - so "coverage is fine" said nothing about
      // the layers where the divergent-error-handling and stale-state bugs lived.
      include: [
        "src/lib/**/*.{ts,tsx}",
        "src/hooks/**/*.{ts,tsx}",
        "src/contexts/**/*.{ts,tsx}",
        "src/components/**/*.{ts,tsx}",
        "src/app/**/*.{ts,tsx}",
      ],
      exclude: [
        // Vendored from shadcn/ui and deliberately kept close to upstream, so its
        // coverage number would measure how much of someone else's library this app
        // happens to render rather than anything about this app.
        "src/components/ui/**",
      ],
      // Floors, not targets. Set just under the current numbers so a real drop fails
      // the build without ordinary movement doing so. Raise them as coverage grows;
      // lowering one to make a build pass is the thing they exist to prevent.
      //
      // The global numbers look low because `components/` and `app/` are in scope and
      // almost entirely untested. That is deliberate: the point of widening the scope
      // was to make the gap *visible* in the report rather than to flatter the
      // headline figure. The per-directory floors below are what actually hold the
      // tested layers to account.
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
