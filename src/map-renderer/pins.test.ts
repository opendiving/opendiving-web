import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { placedLocations } from "@/lib/map-picture";
import { PIN_COLOURS, pinsSource } from "./pins";

// The browser's markers take their colours from the theme's tokens, and a
// picture's pins have to look the same - so the renderer's literals are held
// to the stylesheet the markers read.
const css = readFileSync(path.resolve("src/app/globals.css"), "utf8");

function token(block: string, name: string): string {
  const start = css.indexOf(`${block} {`);
  const body = css.slice(start, css.indexOf("\n  }", start));
  const match = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--${name} is not declared in ${block}`);
  return match[1].trim();
}

// `hsl(var(--x))`'s "H S% L%" as #rrggbb, rounded as a browser rounds it.
function hex(hsl: string): string {
  const [h, s, l] = hsl.split(/\s+/).map((part) => parseFloat(part));
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value =
      lightness - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

describe("the pins' colours", () => {
  it("are the theme's coral and background", () => {
    expect(PIN_COLOURS.light).toEqual({
      coral: hex(token(":root", "coral")),
      background: hex(token(":root", "background")),
    });
    expect(PIN_COLOURS.dark).toEqual({
      // Coral is not redeclared under `.dark`.
      coral: hex(token(":root", "coral")),
      background: hex(token(".dark", "background")),
    });
  });
});

describe("pinsSource", () => {
  it("draws each place in the order the browser adds its markers", () => {
    const source = pinsSource(
      placedLocations([
        { latitude: 28.57, longitude: 34.54 },
        { latitude: 28.56, longitude: 34.53, variant: "fix" },
      ]),
    );
    expect(source.data.features).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [34.54, 28.57] },
        properties: { variant: "pin", order: 0 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [34.53, 28.56] },
        properties: { variant: "fix", order: 1 },
      },
    ]);
  });
});
