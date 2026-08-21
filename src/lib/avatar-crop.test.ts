import { describe, expect, it } from "vitest";
import { AVATAR_EXPORT_SIZE, avatarExportSize } from "./avatar-crop";

// Only the sizing rule is unit-tested. `cropToPngBlob` is canvas, and jsdom has no
// canvas implementation at all - a test of it would be a test of the mock standing in
// for the API under test.
describe("avatarExportSize", () => {
  it("caps at the size the API stores anyway", () => {
    expect(avatarExportSize(4000)).toBe(AVATAR_EXPORT_SIZE);
  });

  it("does not upscale a crop smaller than that", () => {
    // A 200 px crop blown up to 512 costs bytes and invents detail; the API declines
    // to upscale for the same reason, so a client that did would be undone anyway.
    expect(avatarExportSize(200)).toBe(200);
  });

  it("rounds a fractional crop down", () => {
    // `croppedAreaPixels` is fractional, and a fractional canvas dimension is
    // silently truncated by the platform rather than rejected.
    expect(avatarExportSize(199.7)).toBe(199);
  });

  it("never returns a dimension a canvas would reject", () => {
    // `canvas.width = 0` throws on `drawImage`, so a degenerate crop has to floor at
    // one pixel rather than at zero.
    expect(avatarExportSize(0)).toBe(1);
    expect(avatarExportSize(0.4)).toBe(1);
    expect(avatarExportSize(-10)).toBe(1);
  });

  it("falls back to the full size for a non-finite crop", () => {
    expect(avatarExportSize(Number.NaN)).toBe(AVATAR_EXPORT_SIZE);
  });
});
