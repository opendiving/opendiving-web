import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import QRCode from "qrcode";

import { QrCode, qrRuns } from "./qr-code";

const URL_ =
  "https://opendiving.app/checkin/0123456789abcdefghijABCDEFGHIJ_-xyz";

describe("QrCode", () => {
  // The runs are a re-encoding of the library's matrix, so the one thing worth
  // pinning is that nothing is lost on the way: laid back onto a grid, they are
  // exactly the dark modules the library produced, and nothing else.
  it("draws exactly the library's dark modules", () => {
    const { modules } = QRCode.create(URL_, { errorCorrectionLevel: "M" });
    const { size, runs } = qrRuns(URL_);
    expect(size).toBe(modules.size);

    const drawn = new Set<string>();
    for (const [row, col, length] of runs) {
      for (let c = col; c < col + length; c++) drawn.add(`${row},${c}`);
    }
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        expect(drawn.has(`${row},${col}`)).toBe(modules.get(row, col) === 1);
      }
    }
  });

  it("is SVG elements rather than an injected string, black on white", () => {
    const { container } = render(<QrCode value={URL_} label="QR code" />);

    const svg = screen.getByRole("img", { name: "QR code" });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const rects = container.querySelectorAll("rect");
    // The background, then one per run.
    expect(rects.length).toBe(qrRuns(URL_).runs.length + 1);
    expect(rects[0]).toHaveAttribute("fill", "#ffffff");
    expect(rects[1]).toHaveAttribute("fill", "#000000");
    // A four-module quiet zone on every side.
    const { size } = qrRuns(URL_);
    expect(svg).toHaveAttribute("viewBox", `0 0 ${size + 8} ${size + 8}`);
  });
});
