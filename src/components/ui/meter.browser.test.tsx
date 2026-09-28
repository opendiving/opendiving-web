import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { Meter } from "./meter";

// Load-bearing: without the stylesheet `h-2` computes to nothing, and the
// height assertion below would pass against a bar nobody can see.
import "@/app/globals.css";

// The invariant is geometry - the filled part's width over the track's is the
// ratio - and jsdom lays nothing out, so every width there is 0 and a ratio
// assertion passes against any markup.
function measure(value: number, max: number) {
  const { getByRole, unmount } = render(
    <div style={{ width: "400px" }}>
      <Meter value={value} max={max} aria-label="Storage used" />
    </div>,
  );
  const track = getByRole("meter");
  const fill = track.querySelector<HTMLElement>('[data-slot="meter-fill"]')!;
  const trackBox = track.getBoundingClientRect();
  const fillBox = fill.getBoundingClientRect();
  unmount();
  return { trackBox, fillBox };
}

describe("Meter", () => {
  it("fills the share of the track that the value is of the range", () => {
    const { trackBox, fillBox } = measure(300, 1000);

    expect(trackBox.width).toBe(400);
    expect(trackBox.height).toBeGreaterThan(0);
    expect(fillBox.height).toBe(trackBox.height);
    expect(Math.abs(fillBox.width / trackBox.width - 0.3)).toBeLessThan(
      1 / trackBox.width,
    );
  });

  it("draws no fill at zero", () => {
    const { fillBox } = measure(0, 1000);

    expect(fillBox.width).toBe(0);
  });

  it("fills the track exactly, and no further, past the top of the range", () => {
    const { trackBox, fillBox } = measure(2500, 1000);

    expect(fillBox.width).toBe(trackBox.width);
    expect(fillBox.left).toBe(trackBox.left);
  });
});
