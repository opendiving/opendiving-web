import { describe, expect, it } from "vitest";

import {
  nearestByX,
  nearestWithin,
  viewBoxPoint,
  type PlotMark,
} from "./chart-readout";

const mark = (value: string, x: number, y: number): PlotMark<string> => ({
  value,
  x,
  y,
});

describe("viewBoxPoint", () => {
  it("scales a client point into the viewBox by the drawn width", () => {
    // A 720-unit drawing at 360 px: two units per pixel, on both axes.
    expect(
      viewBoxPoint({ left: 100, top: 50, width: 360 }, 720, 190, 80),
    ).toEqual({ x: 180, y: 60, scale: 2 });
  });
});

describe("nearestByX", () => {
  it("walks the marks by x, wherever they sit up the plot", () => {
    const marks = [mark("low", 100, 200), mark("high", 140, 10)];

    expect(nearestByX(marks, { x: 135, y: 200 })?.value).toBe("high");
  });

  it("breaks a tie in x by y", () => {
    const marks = [mark("top", 100, 20), mark("bottom", 100, 180)];

    expect(nearestByX(marks, { x: 100, y: 170 })?.value).toBe("bottom");
  });

  it("has nothing to say about no marks", () => {
    expect(nearestByX([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("nearestWithin", () => {
  const marks = [mark("a", 100, 100), mark("b", 130, 100)];

  it("picks the nearest mark in both axes", () => {
    expect(nearestWithin(marks, { x: 120, y: 104 }, 48)?.value).toBe("b");
  });

  it("picks nothing past its reach", () => {
    expect(nearestWithin(marks, { x: 100, y: 160 }, 48)).toBeNull();
  });

  it("reaches exactly as far as it says", () => {
    expect(nearestWithin(marks, { x: 100, y: 148 }, 48)?.value).toBe("a");
  });
});
