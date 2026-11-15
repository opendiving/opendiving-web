import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import jsQR from "jsqr";
import QRCode from "qrcode";

import { QrCode } from "./qr-code";
import { qrLayout, type QrLayout } from "./qr-layout";

// The flagship's two links: an invite with its 32 hex characters, and the longer check-in link
// with its 43 base64url ones.
const INVITE =
  "https://opendiving.app/join?via=dd61596d15ae703e0aa5a28b92586efd";
const CHECKIN =
  "https://opendiving.app/checkin/q7Zr2LmW-xk9fT3bQaVhN0pYs_Ue4gRjD8cLwKz5oM1";
// Long enough to reach version 7, whose centre alignment pattern leaves no room for the mark.
const LONG =
  "https://dives.example-club.org/checkin/q7Zr2LmW-xk9fT3bQaVhN0pYs_Ue4gRjD8cLwKz5oM1";

// Lays the layout back onto pixels the way the SVG draws it - patterns whole, data modules where
// drawn - and asks an independent decoder to read it.
function decode(layout: QrLayout) {
  const scale = 4;
  const quiet = 4;
  const width = (layout.size + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const dark = (row: number, col: number) => {
    for (let y = 0; y < scale; y++) {
      for (let x = 0; x < scale; x++) {
        const i =
          (((row + quiet) * scale + y) * width + (col + quiet) * scale + x) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
  };
  const ring = (row: number, col: number, size: number) => {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const edge = Math.min(r, c, size - 1 - r, size - 1 - c);
        if (edge !== 1) dark(row + r, col + c);
      }
    }
  };
  for (const [row, col] of layout.finders) {
    ring(row, col, 7);
    for (let r = 2; r < 5; r++)
      for (let c = 2; c < 5; c++) dark(row + r, col + c);
  }
  for (const [row, col] of layout.alignments) ring(row - 2, col - 2, 5);
  for (let row = 0; row < layout.size; row++) {
    for (let col = 0; col < layout.size; col++) {
      if (layout.drawn(row, col)) dark(row, col);
    }
  }
  return jsQR(pixels, width, width)?.data;
}

function dataModules(value: string) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "Q" });
  return modules;
}

describe("qrLayout", () => {
  it.each([INVITE, CHECKIN])(
    "still decodes %s with the mark's modules left out",
    (link) => {
      const layout = qrLayout(link);
      expect(layout.mark).not.toBeNull();
      expect(decode(layout)).toBe(link);
    },
  );

  // The mark gives up only what it covers: every dark module away from its bubbles is drawn, and
  // what it does take stays a small share of the symbol.
  it("clears only the modules around the bubbles", () => {
    const layout = qrLayout(CHECKIN);
    const modules = dataModules(CHECKIN);
    const middle = layout.size / 2;
    let cleared = 0;
    for (let row = 0; row < layout.size; row++) {
      for (let col = 0; col < layout.size; col++) {
        const inPattern =
          layout.finders.some(
            ([r, c]) => row >= r && row < r + 7 && col >= c && col < c + 7,
          ) ||
          layout.alignments.some(
            ([r, c]) => Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2,
          );
        if (modules.get(row, col) !== 1 || inPattern) continue;
        if (layout.drawn(row, col)) continue;
        cleared += 1;
        expect(Math.hypot(row + 0.5 - middle, col + 0.5 - middle)).toBeLessThan(
          layout.size * 0.25,
        );
      }
    }
    expect(cleared).toBeGreaterThan(0);
    expect(cleared / layout.size ** 2).toBeLessThan(0.06);
  });

  it("leaves the mark off a symbol with an alignment pattern at its centre", () => {
    const layout = qrLayout(LONG);
    const modules = dataModules(LONG);
    expect(layout.size).toBeGreaterThanOrEqual(45);
    expect(layout.mark).toBeNull();
    const middle = (layout.size - 1) / 2;
    expect(layout.alignments).toContainEqual([middle, middle]);
    for (let row = 0; row < layout.size; row++) {
      for (let col = 0; col < layout.size; col++) {
        if (layout.drawn(row, col)) expect(modules.get(row, col)).toBe(1);
      }
    }
    expect(decode(layout)).toBe(LONG);
  });
});

describe("QrCode", () => {
  it("is one labelled SVG carrying a light and a dark rendering and the mark", () => {
    const { container } = render(<QrCode value={INVITE} label="QR code" />);

    const svg = screen.getByRole("img", { name: "QR code" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const light = container.querySelector('[data-theme-variant="light"]');
    const dark = container.querySelector('[data-theme-variant="dark"]');
    expect(light).toHaveClass("dark:hidden");
    expect(dark).toHaveClass("hidden", "dark:inline");
    expect(light?.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
    // Three bubbles in coral, the smallest filled.
    const bubbles = container.querySelectorAll('g[stroke="#FF7F50"] circle');
    expect(bubbles).toHaveLength(3);
    // A four-module quiet zone on every side.
    const { size } = qrLayout(INVITE);
    expect(svg).toHaveAttribute("viewBox", `0 0 ${size + 8} ${size + 8}`);
  });
});
