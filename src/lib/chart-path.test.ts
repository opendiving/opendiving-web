import { describe, expect, it } from "vitest";
import { buildAreaPath, smoothBandPath, smoothPath } from "@/lib/chart-path";

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
