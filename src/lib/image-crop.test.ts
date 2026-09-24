import { describe, expect, it } from "vitest";
import { cropExportWidth } from "./image-crop";
import { CERTIFICATION_CARD_EXPORT_WIDTH as MAX_WIDTH } from "./certification";

// Only the sizing rule is unit-tested. `cropToBlob` is canvas, and jsdom has no
// canvas implementation at all - a test of it would be a test of the mock standing in
// for the API under test.
describe("cropExportWidth", () => {
  it("caps at the size the caller stores anyway", () => {
    expect(cropExportWidth(4000, MAX_WIDTH)).toBe(MAX_WIDTH);
  });

  it("does not upscale a crop smaller than that", () => {
    // A 200 px crop blown up to the card width costs bytes and invents detail, and the
    // API stores a card's bytes as they arrive.
    expect(cropExportWidth(200, MAX_WIDTH)).toBe(200);
  });

  it("rounds a fractional crop down", () => {
    // `croppedAreaPixels` is fractional, and a fractional canvas dimension is
    // silently truncated by the platform rather than rejected.
    expect(cropExportWidth(199.7, MAX_WIDTH)).toBe(199);
  });

  it("never returns a dimension a canvas would reject", () => {
    // `canvas.width = 0` throws on `drawImage`, so a degenerate crop has to floor at
    // one pixel rather than at zero.
    expect(cropExportWidth(0, MAX_WIDTH)).toBe(1);
    expect(cropExportWidth(0.4, MAX_WIDTH)).toBe(1);
    expect(cropExportWidth(-10, MAX_WIDTH)).toBe(1);
  });

  it("falls back to the caller's full size for a non-finite crop", () => {
    expect(cropExportWidth(Number.NaN, MAX_WIDTH)).toBe(MAX_WIDTH);
  });
});
