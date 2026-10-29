import { describe, expect, it } from "vitest";
import {
  type ChartView,
  fullView,
  isZoomed,
  panView,
  scaleView,
} from "./chart-zoom";

describe("scaleView", () => {
  it("holds the instant under a wheel where it was", () => {
    // A quarter of the way across 0-1000, zoomed 2x: 250 stays a quarter across.
    expect(scaleView(fullView(1000), 2, 0.25, 0.25, 1000, 10)).toEqual({
      start: 125,
      end: 625,
    });
  });

  it("carries the anchor along with fingers that slide while they pinch", () => {
    // 500 was half-way; the fingers' midpoint ends a quarter across.
    expect(scaleView(fullView(1000), 2, 0.5, 0.25, 1000, 10)).toEqual({
      start: 375,
      end: 875,
    });
  });

  it("zooms no closer than the minimum span", () => {
    const view = scaleView(fullView(1000), 1000, 0.5, 0.5, 1000, 100);
    expect(view.end - view.start).toBe(100);
  });

  it("zooms no further out than the whole axis, and stays on it", () => {
    expect(scaleView({ start: 800, end: 900 }, 0.01, 0, 0, 1000, 10)).toEqual(
      fullView(1000),
    );
    expect(scaleView({ start: 800, end: 1000 }, 0.5, 1, 1, 1000, 10)).toEqual({
      start: 600,
      end: 1000,
    });
  });

  it("comes back to the whole axis from a zoom in and out by the same factor", () => {
    for (const anchor of [0, 0.25, 0.3, 0.5, 0.7, 1]) {
      const zoomedIn = scaleView(
        fullView(2_781_000),
        Math.exp(0.5),
        anchor,
        anchor,
        2_781_000,
        60_000,
      );
      expect(
        scaleView(zoomedIn, Math.exp(-0.5), anchor, anchor, 2_781_000, 60_000),
      ).toEqual(fullView(2_781_000));
    }
  });

  it("comes back to the whole axis from wheel steps in and out", () => {
    // A wheel zooms each step on the view the last one left.
    const step = (view: ChartView, factor: number, anchor: number) =>
      scaleView(view, factor, anchor, anchor, 3_600_000, 60_000);
    for (const notches of [1, 2, 5, 8]) {
      for (const anchor of [0.123, 0.5, 0.9]) {
        let view = fullView(3_600_000);
        for (let n = 0; n < notches; n++)
          view = step(view, Math.exp(0.5), anchor);
        for (let n = 0; n < notches; n++)
          view = step(view, Math.exp(-0.5), anchor);
        expect(view, `${notches} at ${anchor}`).toEqual(fullView(3_600_000));
      }
    }
  });

  it("does not zoom an axis shorter than the minimum span", () => {
    expect(scaleView(fullView(50), 4, 0.5, 0.5, 50, 100)).toEqual(fullView(50));
  });
});

describe("panView", () => {
  it("moves the view and keeps its span", () => {
    expect(panView({ start: 100, end: 300 }, 50, 1000)).toEqual({
      start: 150,
      end: 350,
    });
  });

  it("stops at either end", () => {
    expect(panView({ start: 100, end: 300 }, -500, 1000)).toEqual({
      start: 0,
      end: 200,
    });
    expect(panView({ start: 700, end: 900 }, 500, 1000)).toEqual({
      start: 800,
      end: 1000,
    });
  });
});

describe("isZoomed", () => {
  it("is false only for the whole axis", () => {
    expect(isZoomed(fullView(1000), 1000)).toBe(false);
    expect(isZoomed({ start: 0, end: 999 }, 1000)).toBe(true);
  });
});
