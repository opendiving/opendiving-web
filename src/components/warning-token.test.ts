import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Warning copy is `text-warning`, never a hand-picked amber pair: `--warning` is
// tuned per theme to clear AA on the surfaces it lands on, and a raw
// `text-amber-700 dark:text-amber-500` is a second, unmeasured copy of it - see
// DECISIONS.md, "Theme tokens". `tank-icon.tsx`'s helium fill is a gas colour,
// not a warning, so only text, borders and backgrounds are held to this.
const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(full) && !full.includes(".test.") ? [full] : [];
  });

describe("warning colour", () => {
  it("comes from the --warning token, not raw amber classes", () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          /\b(text|border|bg)-amber-\d/.test(line)
            ? [`${path.relative(SRC, file)}:${index + 1}`]
            : [],
        ),
    );

    expect(offenders).toEqual([]);
  });
});
