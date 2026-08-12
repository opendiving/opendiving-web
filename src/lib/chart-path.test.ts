import { describe, expect, it } from "vitest";
import {
  barPath,
  buildAreaPath,
  smoothBandPath,
  smoothPath,
} from "@/lib/chart-path";

describe("buildAreaPath", () => {
  it("closes the shape along the baseline", () => {
    const path = buildAreaPath(
      [
        { x: 10, y: 20 },
        { x: 20, y: 40 },
        { x: 30, y: 30 },
      ],
      100,
    );

    expect(path).toBe("M10,20 L20,40 L30,30 L30,100 L10,100 Z");
  });

  it("is empty for an empty series, rather than a stray `Z`", () => {
    expect(buildAreaPath([], 100)).toBe("");
  });
});

describe("smoothPath", () => {
  it("is empty for an empty series", () => {
    expect(smoothPath([])).toBe("");
  });

  it("draws nothing but a move for a single point", () => {
    // A stretch of diving containing one dive - the same no-op a one-point
    // `<polyline>` was.
    expect(smoothPath([{ x: 10, y: 20 }])).toBe("M10,20");
  });

  it("keeps two points a straight line", () => {
    // Both tangents equal the secant, so the control points land on the segment
    // itself. Nothing to smooth between two points, and a bowed line between
    // them would be an invention.
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 30, y: 30 },
      ]),
    ).toBe("M0,0 C10,10 20,20 30,30");
  });

  it("starts at the first point and ends at the last", () => {
    const path = smoothPath([
      { x: 0, y: 50 },
      { x: 10, y: 20 },
      { x: 20, y: 35 },
    ]);

    expect(path.startsWith("M0,50")).toBe(true);
    expect(path.endsWith("20,35")).toBe(true);
  });

  it("never overshoots a local extreme", () => {
    // The whole reason this is monotone cubic and not Catmull-Rom. A dip in a
    // trend line must not be drawn dipping below its lowest value: on the gas
    // chart that would render a gas consumption the diver never achieved,
    // sitting under their actual best dive.
    const path = smoothPath([
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 20, y: 10 },
      { x: 30, y: 100 },
      { x: 40, y: 100 },
    ]);

    const ys = [...path.matchAll(/[,\s]-?[\d.]+,(-?[\d.]+)/g)].map((match) =>
      Number(match[1]),
    );

    expect(Math.min(...ys)).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });

  it("flattens rather than dividing by zero on a repeated x", () => {
    // Two dives logged at the same instant. Improbable, but an infinite slope
    // would put `NaN` in the `d` attribute and blank the whole line.
    const path = smoothPath([
      { x: 0, y: 10 },
      { x: 0, y: 20 },
      { x: 10, y: 30 },
    ]);

    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it("rounds coordinates instead of emitting float noise", () => {
    const path = smoothPath([
      { x: 0, y: 0 },
      { x: 10, y: 1 / 3 },
      { x: 20, y: 1 },
    ]);

    expect(path).not.toMatch(/\d\.\d{3}/);
  });
});

describe("smoothBandPath", () => {
  const upper = [
    { x: 0, y: 10 },
    { x: 10, y: 20 },
    { x: 20, y: 15 },
  ];
  const lower = [
    { x: 0, y: 30 },
    { x: 10, y: 40 },
    { x: 20, y: 35 },
  ];

  it("runs out along the upper edge and back along the lower, closed", () => {
    const path = smoothBandPath(upper, lower);

    expect(path.startsWith("M0,10")).toBe(true);
    // The turn at the far end: the last upper point, then across to the last
    // lower point.
    expect(path).toContain("20,15 L20,35");
    expect(path.endsWith("Z")).toBe(true);
  });

  it("is empty when there is no width to fill", () => {
    // One shared point is a line, not a band, and an unbalanced pair is a bug in
    // the caller - either way, better to draw nothing than a torn shape.
    expect(smoothBandPath([upper[0]], [lower[0]])).toBe("");
    expect(smoothBandPath(upper, lower.slice(1))).toBe("");
  });
});

describe("barPath", () => {
  it("rounds the top corners and leaves the bottom square", () => {
    // Up the left side, round the top, down the right, and along the baseline -
    // which stays flat, so the bar sits on the axis rather than floating.
    expect(barPath(10, 60, 20, 40, 3)).toBe(
      "M10,100 L10,63 Q10,60 13,60 L27,60 Q30,60 30,63 L30,100 Z",
    );
  });

  it("never rounds more than the bar can carry", () => {
    // A one-dive bar in a fifty-dive year is a couple of units tall; the
    // full radius on it would bow the sides out into a lens.
    expect(barPath(10, 98, 20, 2, 3)).toBe(
      "M10,100 L10,100 Q10,98 12,98 L28,98 Q30,98 30,100 L30,100 Z",
    );
  });

  it("draws nothing for a month with no diving", () => {
    // An absence, not a sliver: a zero-height bar would still show a 3-unit cap.
    expect(barPath(10, 100, 20, 0, 3)).toBe("");
  });
});
