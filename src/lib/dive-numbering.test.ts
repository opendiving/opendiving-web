import { describe, expect, it } from "vitest";
import type { DiveNumberingSummary } from "@/lib/api/dives";
import { describeDiveNumbering } from "@/lib/dive-numbering";

function summary(
  overrides: Partial<DiveNumberingSummary> = {},
): DiveNumberingSummary {
  return {
    total_dives: 3,
    lowest: 1,
    highest: 3,
    missing_count: 0,
    duplicate_count: 0,
    out_of_date_order_count: 0,
    is_sequential: true,
    ...overrides,
  };
}

describe("describeDiveNumbering", () => {
  it("says nothing about an empty log", () => {
    expect(
      describeDiveNumbering(
        summary({ total_dives: 0, lowest: null, highest: null }),
      ),
    ).toBeNull();
  });

  it("says nothing about a log numbered consecutively in date order", () => {
    expect(describeDiveNumbering(summary())).toBeNull();
  });

  it("says nothing about a clean log that starts above one", () => {
    // The first 46 dives are in a paper logbook. Nothing is wrong here, and a
    // card offering to renumber would imply otherwise.
    expect(
      describeDiveNumbering(summary({ lowest: 47, highest: 49 })),
    ).toBeNull();
  });

  it("says nothing about a single dive, which is always tidy", () => {
    expect(
      describeDiveNumbering(
        summary({ total_dives: 1, lowest: 12, highest: 12 }),
      ),
    ).toBeNull();
  });

  it("gives a log collapsed onto one number that number rather than a range", () => {
    // Three dives all carrying #12: the range has no width, but there is still
    // something for a renumber to do.
    expect(
      describeDiveNumbering(
        summary({ lowest: 12, highest: 12, duplicate_count: 2 }),
      ),
    ).toBe("Numbered #12 — 2 dives share a number.");
  });

  it("counts unused numbers", () => {
    expect(
      describeDiveNumbering(
        summary({ highest: 6, missing_count: 3, is_sequential: false }),
      ),
    ).toBe("Numbered #1–#6 — 3 numbers unused.");
  });

  it("counts a single unused number in the singular", () => {
    expect(
      describeDiveNumbering(
        summary({ highest: 4, missing_count: 1, is_sequential: false }),
      ),
    ).toBe("Numbered #1–#4 — 1 number unused.");
  });

  it("counts shared numbers", () => {
    expect(describeDiveNumbering(summary({ duplicate_count: 2 }))).toBe(
      "Numbered #1–#3 — 2 dives share a number.",
    );
  });

  it("counts a single shared number in the singular", () => {
    expect(describeDiveNumbering(summary({ duplicate_count: 1 }))).toBe(
      "Numbered #1–#3 — 1 dive shares a number.",
    );
  });

  it("lists everything that's off in one sentence", () => {
    expect(
      describeDiveNumbering(
        summary({
          total_dives: 10,
          highest: 20,
          missing_count: 11,
          duplicate_count: 2,
          out_of_date_order_count: 4,
          is_sequential: false,
        }),
      ),
    ).toBe(
      "Numbered #1–#20 — 11 numbers unused, 2 dives share a number, 4 out of date order.",
    );
  });

  it("reports dives numbered out of date order even when the run is unbroken", () => {
    // 1, 3, 2 uses every number once between 1 and 3, so nothing is missing or
    // duplicated - but the log still doesn't read in the order it was dived.
    expect(describeDiveNumbering(summary({ out_of_date_order_count: 1 }))).toBe(
      "Numbered #1–#3 — 1 out of date order.",
    );
  });
});
