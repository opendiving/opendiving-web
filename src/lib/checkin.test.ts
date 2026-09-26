import { describe, it, expect } from "vitest";

import {
  divingFiguresFromWire,
  divingFiguresToWire,
  hasDivingFigures,
  loggedDivingFigures,
} from "./checkin";
import type { UserDiveStats } from "@/lib/api/dive-stats";

const stats: UserDiveStats = {
  user_uuid: "user-1",
  total_dives: 142,
  max_depth: 39.6,
  total_time: 360000,
  species_seen: 12,
  created_at: "2026-01-01T00:00:00+00:00",
};

describe("loggedDivingFigures", () => {
  it("takes the last dive's own calendar day, not the reader's", () => {
    // 00:30 on the 15th in +02:00 is still the 14th in UTC and the 14th in a
    // negative-offset browser. The dive was logged on the 15th.
    expect(loggedDivingFigures(stats, "2026-08-15T00:30:00+02:00")).toEqual({
      totalDives: 142,
      maxDepth: 39.6,
      lastDiveOn: "2026-08-15",
    });
  });

  it("is all nulls when neither request landed", () => {
    expect(loggedDivingFigures(null, null)).toEqual({
      totalDives: null,
      maxDepth: null,
      lastDiveOn: null,
    });
  });

  it("keeps a zeroed stat, which is a diver with nothing logged rather than nothing known", () => {
    const empty = { ...stats, total_dives: 0, max_depth: 0 };
    expect(loggedDivingFigures(empty, null).totalDives).toBe(0);
    expect(hasDivingFigures(loggedDivingFigures(empty, null))).toBe(true);
  });
});

describe("hasDivingFigures", () => {
  it("is false only when all three are absent", () => {
    expect(
      hasDivingFigures({ totalDives: null, maxDepth: null, lastDiveOn: null }),
    ).toBe(false);
    expect(
      hasDivingFigures({
        totalDives: null,
        maxDepth: null,
        lastDiveOn: "2026-08-14",
      }),
    ).toBe(true);
  });
});

describe("the figures on the wire", () => {
  // A cleared figure is null on both sides, and the link prints nothing for it, so a
  // round trip has to keep every null a null rather than a zero or an empty string.
  it("round-trips, cleared figures included", () => {
    const figures = { totalDives: 310, maxDepth: null, lastDiveOn: null };
    expect(divingFiguresToWire(figures)).toEqual({
      total_dives: 310,
      max_depth: null,
      last_dive_on: null,
    });
    expect(divingFiguresFromWire(divingFiguresToWire(figures))).toEqual(
      figures,
    );
  });
});
