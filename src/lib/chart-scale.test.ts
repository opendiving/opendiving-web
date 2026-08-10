import { describe, expect, it } from "vitest";
import { axisTicks, niceDomain } from "@/lib/chart-scale";

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
