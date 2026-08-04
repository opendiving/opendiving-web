import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextCoreWebVitals,
  {
    ignores: [".next/**", "out/**", "node_modules/**"],
  },
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      // eslint-plugin-react-hooks v7 (bundled by eslint-config-next 16) added this rule and
      // flags this codebase's common "fetch on mount" useEffect pattern as an error. Downgraded
      // to a warning pending a deliberate refactor of data-fetching effects; see PR/upgrade notes.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]

export default config
