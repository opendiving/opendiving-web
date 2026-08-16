import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

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
