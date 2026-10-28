import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { getThemeStyles } from "@scalar/themes";
import { describe, expect, it } from "vitest";

import { API_REFERENCE_STYLE_HASHES } from "./api-reference-csp";

const require = createRequire(import.meta.url);

function hashSource(css: string): string {
  return `'sha256-${createHash("sha256").update(css, "utf8").digest("base64")}'`;
}

describe("API_REFERENCE_STYLE_HASHES", () => {
  it("allows the theme Scalar renders for the reference's configuration", () => {
    // Scalar's own composition: `customCss` (none), a newline, then the theme.
    const css = `\n${getThemeStyles(undefined, { fonts: false })}`.replace(
      /<\/style/gi,
      "<\\/style",
    );

    expect(API_REFERENCE_STYLE_HASHES).toContain(hashSource(css));
  });

  it("allows the toast stylesheet @scalar/use-toasts appends", () => {
    const source = readFileSync(require.resolve("@scalar/use-toasts"), "utf8");
    const literal = source.match(/createTextNode\(("(?:[^"\\]|\\.)*")\)/)?.[1];
    expect(literal).toBeDefined();

    expect(API_REFERENCE_STYLE_HASHES).toContain(
      hashSource(JSON.parse(literal!) as string),
    );
  });
});
