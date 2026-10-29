// Runs axe over one page of a running app and writes what it found as JSON: the
// accessibility check in `code-quality.yml`.
//
//   node scripts/axe-report.mjs http://localhost:3000 accessibility-report.json
//
// A report, not a gate. It exits non-zero only when it could not scan, so a page
// with violations passes and a broken scan does not. It scans `<main>` against
// WCAG 2.0 and 2.1 A and AA - so not the header or footer, and not best-practice
// rules such as `heading-order`.
//
// axe-core and playwright-core both come from `package-lock.json`. Chromium is
// the installed Chrome, found the way `scripts/screenshots.mjs` finds it, so
// nothing is fetched at run time.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

import { chromePath } from "./lib/local-stack.mjs";

const [url, output] = process.argv.slice(2);
if (!url || !output) {
  console.error("usage: node scripts/axe-report.mjs <url> <report.json>");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: chromePath() });
try {
  // The app's CSP admits only scripts carrying its nonce, which an injected
  // axe does not.
  const page = await (await browser.newContext({ bypassCSP: true })).newPage();
  // Not `load`: the page renders its content once the session check settles,
  // and at `load` `<main>` is still empty.
  await page.goto(url, { waitUntil: "networkidle" });
  await page.addScriptTag({
    path: createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
  });
  const results = await page.evaluate(() =>
    window.axe.run(
      { include: ["main"], exclude: ["iframe"] },
      { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } },
    ),
  );
  writeFileSync(output, JSON.stringify(results, null, 2));
  for (const { id, impact, nodes, help } of results.violations) {
    console.log(`${id} (${impact}, ${nodes.length}): ${help}`);
  }
  console.log(`${results.violations.length} violation(s) on ${url}.`);
} finally {
  await browser.close();
}
