import { describe, expect, it } from "vitest";
import { cropExportWidth } from "./image-crop";
import { AVATAR_EXPORT_SIZE } from "./api/auth";

// Only the sizing rule is unit-tested. `cropToBlob` is canvas, and jsdom has no
// canvas implementation at all - a test of it would be a test of the mock standing in
// for the API under test.
describe("cropExportWidth", () => {
  it("caps at the size the caller stores anyway", () => {
    expect(cropExportWidth(4000, AVATAR_EXPORT_SIZE)).toBe(AVATAR_EXPORT_SIZE);
  });

  it("does not upscale a crop smaller than that", () => {
    // A 200 px crop blown up to 512 costs bytes and invents detail; the API declines
    // to upscale for the same reason, so a client that did would be undone anyway.
    expect(cropExportWidth(200, AVATAR_EXPORT_SIZE)).toBe(200);
  });

  it("rounds a fractional crop down", () => {
    // `croppedAreaPixels` is fractional, and a fractional canvas dimension is
    // silently truncated by the platform rather than rejected.
    expect(cropExportWidth(199.7, AVATAR_EXPORT_SIZE)).toBe(199);
  });

  it("never returns a dimension a canvas would reject", () => {
    // `canvas.width = 0` throws on `drawImage`, so a degenerate crop has to floor at
    // one pixel rather than at zero.
    expect(cropExportWidth(0, AVATAR_EXPORT_SIZE)).toBe(1);
    expect(cropExportWidth(0.4, AVATAR_EXPORT_SIZE)).toBe(1);
    expect(cropExportWidth(-10, AVATAR_EXPORT_SIZE)).toBe(1);
  });

  it("falls back to the caller's full size for a non-finite crop", () => {
    expect(cropExportWidth(Number.NaN, AVATAR_EXPORT_SIZE)).toBe(
      AVATAR_EXPORT_SIZE,
    );
  });
});
