import { describe, expect, it } from "vitest";
import type { DiveNumberingSummary } from "@/lib/api/dives";
import type { ImportDiveReport } from "@/lib/api/logbook-import";
import {
  describeDiveNumbering,
  importRenumberScope,
  numberingTangledSince,
} from "@/lib/dive-numbering";

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

describe("numberingTangledSince", () => {
  it("is true where more dives share a number than before", () => {
    expect(
      numberingTangledSince(summary(), summary({ duplicate_count: 2 })),
    ).toBe(true);
  });

  it("is true where more dives are out of date order than before", () => {
    expect(
      numberingTangledSince(
        summary({ out_of_date_order_count: 1 }),
        summary({ out_of_date_order_count: 3 }),
      ),
    ).toBe(true);
  });

  it("is false where the log is no more tangled than before", () => {
    const tangled = summary({ duplicate_count: 2, out_of_date_order_count: 1 });
    expect(numberingTangledSince(tangled, tangled)).toBe(false);
  });

  it("is false where only unused numbers grew, which a file's own numbers make", () => {
    expect(
      numberingTangledSince(summary(), summary({ missing_count: 40 })),
    ).toBe(false);
  });
});

function importedDive(
  start_time: string | null,
  outcome: ImportDiveReport["outcome"] = "created",
): ImportDiveReport {
  return {
    uuid: outcome === "skipped" ? null : "d",
    outcome,
    files_added: 0,
    recordings_added: 0,
    reason: null,
    start_time,
    duration: null,
    max_depth: null,
    device: null,
    members: [],
  };
}

describe("importRenumberScope", () => {
  it("starts on the day of the earliest dive the import brought into the log", () => {
    expect(
      importRenumberScope(
        [
          importedDive("2019-05-01T09:00:00+02:00"),
          importedDive("2019-03-12T09:00:00+02:00", "restored"),
          // Already in the log, so not where the import's dives begin.
          importedDive("2018-01-01T09:00:00+02:00", "linked"),
          importedDive("2017-01-01T09:00:00+02:00", "updated"),
          importedDive("2016-01-01T09:00:00+02:00", "skipped"),
        ],
        120,
      ),
    ).toEqual({
      fromDate: "2019-03-12",
      lastInstantBefore: "2019-03-11T23:59:59+02:00",
    });
  });

  it("is null where no dive entered the log", () => {
    expect(
      importRenumberScope(
        [
          importedDive("2019-03-12T09:00:00+02:00", "linked"),
          importedDive(null, "skipped"),
        ],
        120,
      ),
    ).toBeNull();
  });

  it("reads the day at the given offset, so the scope reaches a dive just past midnight further east", () => {
    // 19:30 on the 11th in UTC, 22:30 at +03:00.
    expect(
      importRenumberScope([importedDive("2019-03-12T00:30:00+05:00")], 180),
    ).toEqual({
      fromDate: "2019-03-11",
      lastInstantBefore: "2019-03-10T23:59:59+03:00",
    });
  });

  it("places a naive start at its wall clock as UTC and a bare date at the start of its day", () => {
    expect(
      importRenumberScope([importedDive("2019-03-12T01:00:00")], -120),
    ).toEqual({
      fromDate: "2019-03-11",
      lastInstantBefore: "2019-03-10T23:59:59-02:00",
    });
    expect(importRenumberScope([importedDive("2019-03-12")], 0)).toEqual({
      fromDate: "2019-03-12",
      lastInstantBefore: "2019-03-11T23:59:59+00:00",
    });
  });
});
