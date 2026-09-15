import { createRequire } from "node:module"
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"
import tsParser from "@typescript-eslint/parser"

const require = createRequire(import.meta.url)

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextCoreWebVitals,
  {
    // `.claude/**` is git-ignored for the same reason it belongs here: it holds
    // agent worktrees, each a full checkout with its own `.next` and
    // `node_modules`. Those nested build outputs don't match the bare `.next/**`
    // pattern above, so linting the repo meant linting minified bundles - a few
    // hundred errors about someone else's generated code, in a script that is
    // supposed to fail only for ours.
    ignores: [".next/**", "out/**", "node_modules/**", "coverage/**", ".claude/**"],
  },
  {
    // First half of what `eslint-config-next` needs to run under ESLint 10.
    // The preset sets `settings.react.version = "detect"`, and that string is
    // the only thing that sends `eslint-plugin-react` down `detectReactVersion()`,
    // which reads `context.getFilename()` - removed in v10. Naming a version
    // skips the branch outright, so the plugin's rules keep working; nothing
    // here disables them. Read from React's own manifest rather than typed as a
    // literal, because a hardcoded "19" is a figure that goes stale silently the
    // next time React majors and nothing would fail to tell us.
    settings: { react: { version: require("react/package.json").version } },
  },
  {
    // Second half. Everything the preset does not hand to `@typescript-eslint`
    // it parses with `eslint-config-next/parser`, a re-export of Next's compiled
    // `@babel/eslint-parser`, whose `ScopeManager` predates v10's `addGlobals` -
    // and the preset declares over a thousand globals, so v10 calls it on every
    // such file and throws. Routing them through the TypeScript parser avoids it.
    // `.mts` and `.cts` are in this list because they are not: they are
    // TypeScript, but the preset's TS block does not claim them, so they reached
    // the Babel parser and were the last two files still failing.
    // The cost is that `next/babel`-specific syntax would no longer parse in a
    // plain `.js` file. Nothing here is such a file - these are config and
    // `scripts/*.mjs` - so it costs nothing today, and would announce itself
    // loudly rather than silently if that changed.
    files: ["**/*.{js,mjs,cjs,jsx,mts,cts}"],
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      // Guardrail against XSS: `dangerouslySetInnerHTML` bypasses React's
      // default output escaping, so introducing it (e.g. to render
      // markdown/rich text) needs a deliberate `eslint-disable` plus a
      // sanitizer (e.g. DOMPurify/rehype-sanitize), not an unreviewed add.
      "react/no-danger": "error",
    },
  },
]

export default config
