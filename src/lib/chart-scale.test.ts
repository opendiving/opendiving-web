import { describe, expect, it } from "vitest";
import {
  CHART_FULL_WIDTH_PX,
  axisTicks,
  countDomain,
  fittedChartWidth,
  labelCapacity,
  niceDomain,
} from "@/lib/chart-scale";

// Moved verbatim from `dive-gas.test.ts` along with the functions themselves;
// the examples are still phrased in RMV because that is the series they were
// written against, and they hold for any axis.

describe("niceDomain", () => {
  it("covers a typical RMV spread with a readable step", () => {
    // The real shape of a dive log: a few very relaxed dives, a few hard ones.
    expect(niceDomain([5.03, 12.67, 25.94])).toEqual({
      min: 5,
      max: 30,
      step: 5,
    });
  });

  it("always contains every value", () => {
    const values = [8.2, 19.9, 13.4, 22.1];
    const { min, max } = niceDomain(values);

    expect(min).toBeLessThanOrEqual(Math.min(...values));
    expect(max).toBeGreaterThanOrEqual(Math.max(...values));
  });

  it("does not anchor to zero", () => {
    // Anchoring at 0 would squash the band divers actually live in.
    expect(niceDomain([18, 19, 20]).min).toBeGreaterThan(0);
  });

  it("gives a flat series a band to sit in rather than a zero-height one", () => {
    // A zero-height range makes every scaled y coordinate NaN.
    expect(niceDomain([14, 14, 14])).toEqual({ min: 13, max: 15, step: 1 });
  });

  it("survives an empty series", () => {
    expect(niceDomain([])).toEqual({ min: 0, max: 1, step: 1 });
  });
});

describe("axisTicks", () => {
  it("includes both ends of the domain", () => {
    expect(axisTicks({ min: 5, max: 30, step: 5 })).toEqual([
      5, 10, 15, 20, 25, 30,
    ]);
  });

  it("does not accumulate floating-point drift on fractional steps", () => {
    // Accumulating `+= step` here yields 12.499999999999998 as a tick label.
    expect(axisTicks({ min: 10, max: 15, step: 2.5 })).toEqual([10, 12.5, 15]);
  });
});

describe("countDomain", () => {
  it("anchors at zero, so a bar's height is its quantity", () => {
    // The whole reason this exists alongside `niceDomain`, which would start
    // this axis at 8 and draw twelve dives as three times the block of ten.
    expect(countDomain(12).min).toBe(0);
  });

  it("labels whole dives, never halves", () => {
    // `niceDomain([0, 2])` picks a step of 0.5 and labels the axis 0, 0.5, 1 -
    // half a dive is not a thing anyone can log.
    for (const highest of [1, 2, 3, 5, 7, 12, 40, 137, 1200]) {
      for (const tick of axisTicks(countDomain(highest))) {
        expect(Number.isInteger(tick)).toBe(true);
      }
    }
  });

  it("always contains the tallest bar", () => {
    for (const highest of [1, 3, 9, 12, 41, 250, 999]) {
      expect(countDomain(highest).max).toBeGreaterThanOrEqual(highest);
    }
  });

  it("keeps the axis to a handful of gridlines", () => {
    for (const highest of [1, 4, 17, 63, 480, 5000]) {
      expect(axisTicks(countDomain(highest)).length).toBeLessThanOrEqual(6);
    }
  });

  it("doesn't leave the tallest bar stranded under a rounded-up axis", () => {
    // A real logbook's busiest year. At a target of four gaps this rounded to a
    // step of 100 and an axis of 300, so the tallest bar in the whole chart
    // stopped three quarters of the way up and the top quarter was always empty.
    const domain = countDomain(223);

    expect(domain).toEqual({ min: 0, max: 250, step: 50 });
    expect(223 / domain.max).toBeGreaterThan(0.85);
  });

  it("gives an empty logbook an axis to draw nothing in", () => {
    // Zero-height everywhere, but the gridlines and the baseline still have to
    // land somewhere finite.
    expect(countDomain(0)).toEqual({ min: 0, max: 1, step: 1 });
  });
});

describe("fittedChartWidth", () => {
  it("keeps the design width from the full-width container up", () => {
    expect(fittedChartWidth(720, CHART_FULL_WIDTH_PX)).toBe(720);
    expect(fittedChartWidth(720, 1100)).toBe(720);
  });

  it("narrows in step with a narrower container, so the scale holds", () => {
    // A 375px phone's card leaves the chart 293px.
    const width = fittedChartWidth(720, 293);

    expect(293 / width).toBeCloseTo(CHART_FULL_WIDTH_PX / 720);
  });

  it("uses the design width for a container it has not measured", () => {
    expect(fittedChartWidth(720, null)).toBe(720);
    expect(fittedChartWidth(720, 0)).toBe(720);
  });
});

describe("labelCapacity", () => {
  it("counts whole labels only", () => {
    expect(labelCapacity(664, 33)).toBe(20);
  });

  it("never offers fewer than one", () => {
    expect(labelCapacity(10, 33)).toBe(1);
  });
});
