import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextCoreWebVitals,
  {
    ignores: [".next/**", "out/**", "node_modules/**", "coverage/**"],
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
