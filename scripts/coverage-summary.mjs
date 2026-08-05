#!/usr/bin/env node
// Renders Vitest's `json-summary` coverage report (coverage/coverage-summary.json)
// as a Markdown table. Writes to $GITHUB_STEP_SUMMARY when running in GitHub
// Actions (see .github/workflows/ci.yml), otherwise prints to stdout.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const summaryPath = path.resolve("coverage", "coverage-summary.json");

if (!existsSync(summaryPath)) {
  console.error(
    `Coverage summary not found at ${summaryPath}. Run "npm run test:coverage" first.`,
  );
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const { total, ...fileSummaries } = summary;

function formatPct(metric) {
  return `${metric.covered}/${metric.total} (${metric.pct}%)`;
}

function formatRow(label, metrics) {
  return `| ${label} | ${formatPct(metrics.lines)} | ${formatPct(metrics.statements)} | ${formatPct(metrics.functions)} | ${formatPct(metrics.branches)} |`;
}

const lines = [
  "## Test Coverage",
  "",
  "| File | Lines | Statements | Functions | Branches |",
  "| --- | --- | --- | --- | --- |",
  formatRow("**All files**", total),
];

const sortedFilePaths = Object.keys(fileSummaries).sort((a, b) =>
  a.localeCompare(b),
);

for (const filePath of sortedFilePaths) {
  const relativePath = path.relative(process.cwd(), filePath);
  lines.push(formatRow(relativePath, fileSummaries[filePath]));
}

const markdown = `${lines.join("\n")}\n`;

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
} else {
  console.log(markdown);
}
