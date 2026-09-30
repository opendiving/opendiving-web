import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Progress } from "./progress";

// Load-bearing: without the stylesheet `h-2` and `w-full` compute to nothing,
// and the assertions below would pass against a bar nobody can see.
import "@/app/globals.css";

// The invariant is geometry: the painted fill ends at the fraction of its track.
// The indicator is moved into place rather than sized, so what is measured is
// where its right edge lands - which holds for either way of drawing it.
function measure(value: number, max: number) {
  const { getByRole, unmount } = render(
    <div style={{ width: "400px" }}>
      <Progress value={value} max={max} aria-label="Uploading" />
    </div>,
  );
  const track = getByRole("progressbar");
  const fill = track.querySelector<HTMLElement>(
    '[data-slot="progress-indicator"]',
  )!;
  const trackBox = track.getBoundingClientRect();
  const fillBox = fill.getBoundingClientRect();
  unmount();
  return { trackBox, fillBox };
}

describe("Progress", () => {
  it("ends its fill at the share of the track that the value is of the whole", () => {
    const { trackBox, fillBox } = measure(300, 1000);

    expect(trackBox.width).toBe(400);
    expect(trackBox.height).toBeGreaterThan(0);
    expect(fillBox.height).toBe(trackBox.height);
    expect(
      Math.abs((fillBox.right - trackBox.left) / trackBox.width - 0.3),
    ).toBeLessThan(1 / trackBox.width);
  });

  it("shows no fill at the start", () => {
    const { trackBox, fillBox } = measure(0, 1000);

    expect(fillBox.right).toBeLessThanOrEqual(trackBox.left);
  });

  it("fills the track exactly, and no further, past the end", () => {
    const { trackBox, fillBox } = measure(2500, 1000);

    expect(fillBox.right).toBe(trackBox.right);
    expect(fillBox.left).toBe(trackBox.left);
  });
});
