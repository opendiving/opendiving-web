import { describe, expect, it } from "vitest";
import type { Dive } from "@/lib/api/dives";
import type { TripPart } from "@/lib/api/trips";
import { tripDiveSections } from "./trip-dive-sections";

const dive = (uuid: string, start_time: string) =>
  ({ uuid, start_time }) as Dive;

const uuids = (sections: ReturnType<typeof tripDiveSections>) =>
  sections.map((section) =>
    section.kind === "part"
      ? { part: section.partIndex, dives: section.dives.map((d) => d.uuid) }
      : { loose: section.dives.map((d) => d.uuid) },
  );

const DAHAB: TripPart = {
  location: { name: "Dahab" },
  start_date: "2026-04-03",
  end_date: "2026-04-08",
};
const SHARM: TripPart = {
  location: { name: "Sharm" },
  start_date: "2026-04-10",
  end_date: "2026-04-12",
};

describe("tripDiveSections", () => {
  it("puts each dive under the part its day falls in, between the dives none covers", () => {
    // Newest first, as the trip lists them.
    const dives = [
      dive("after", "2026-04-14T09:00:00+02:00"),
      dive("sharm", "2026-04-12T09:00:00+02:00"),
      dive("gap-2", "2026-04-09T15:00:00+02:00"),
      dive("gap-1", "2026-04-09T09:00:00+02:00"),
      dive("dahab-2", "2026-04-08T09:00:00+02:00"),
      dive("dahab-1", "2026-04-03T09:00:00+02:00"),
    ];
    expect(uuids(tripDiveSections(dives, [DAHAB, SHARM]))).toEqual([
      { loose: ["after"] },
      { part: 1, dives: ["sharm"] },
      { loose: ["gap-2", "gap-1"] },
      { part: 0, dives: ["dahab-2", "dahab-1"] },
    ]);
  });

  it("reads a dive's day off its own wall clock, not the instant's UTC day", () => {
    // 00:30 on Apr 3 in Dahab is still Apr 2 in UTC.
    const dives = [dive("early", "2026-04-03T00:30:00+02:00")];
    expect(uuids(tripDiveSections(dives, [DAHAB]))).toEqual([
      { part: 0, dives: ["early"] },
    ]);
  });

  it("covers a dive with no time recorded, or no offset", () => {
    const dives = [
      dive("naive", "2026-04-05T10:00:00"),
      dive("date-only", "2026-04-04"),
    ];
    expect(uuids(tripDiveSections(dives, [DAHAB]))).toEqual([
      { part: 0, dives: ["naive", "date-only"] },
    ]);
  });

  it("gives a part with one date that day alone, and a part with none no day", () => {
    const parts: TripPart[] = [
      { location: { name: "Nowhen" } },
      { start_date: "2026-04-05" },
      { end_date: "2026-04-07" },
    ];
    const dives = [
      dive("d7", "2026-04-07T09:00:00Z"),
      dive("d6", "2026-04-06T09:00:00Z"),
      dive("d5", "2026-04-05T09:00:00Z"),
    ];
    expect(uuids(tripDiveSections(dives, parts))).toEqual([
      { part: 2, dives: ["d7"] },
      { loose: ["d6"] },
      { part: 1, dives: ["d5"] },
      { part: 0, dives: [] },
    ]);
  });

  it("gives a day two parts cover to the first of them, and keeps one section per part", () => {
    const overlapping: TripPart = {
      start_date: "2026-04-05",
      end_date: "2026-04-11",
    };
    const dives = [
      dive("sharm", "2026-04-11T09:00:00Z"),
      dive("both", "2026-04-06T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z"),
      dive("only-overlap", "2026-04-09T09:00:00Z"),
    ];
    expect(uuids(tripDiveSections(dives, [DAHAB, overlapping]))).toEqual([
      { part: 1, dives: ["sharm", "only-overlap"] },
      { part: 0, dives: ["both", "dahab"] },
    ]);
  });

  it("slots a part holding no dive in where its last day falls, splitting the dives around it", () => {
    const empty: TripPart = {
      location: { name: "Safaga" },
      start_date: "2026-04-12",
      end_date: "2026-04-13",
    };
    const dives = [
      dive("after", "2026-04-15T09:00:00Z"),
      dive("gap-newer", "2026-04-14T09:00:00Z"),
      dive("gap-older", "2026-04-09T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z"),
    ];
    expect(uuids(tripDiveSections(dives, [DAHAB, empty]))).toEqual([
      { loose: ["after", "gap-newer"] },
      { part: 1, dives: [] },
      { loose: ["gap-older"] },
      { part: 0, dives: ["dahab"] },
    ]);
    // Between two parts' cards, with no loose dive to split.
    expect(
      uuids(tripDiveSections([dives[0], dives[3]], [DAHAB, empty])),
    ).toEqual([
      { loose: ["after"] },
      { part: 1, dives: [] },
      { part: 0, dives: ["dahab"] },
    ]);
  });

  it("puts a part with no dates just above the part it follows", () => {
    const nowhen: TripPart = { location: { name: "Nowhen" } };
    const dives = [
      dive("sharm", "2026-04-11T09:00:00Z"),
      dive("dahab", "2026-04-04T09:00:00Z"),
    ];
    expect(uuids(tripDiveSections(dives, [DAHAB, nowhen, SHARM]))).toEqual([
      { part: 2, dives: ["sharm"] },
      { part: 1, dives: [] },
      { part: 0, dives: ["dahab"] },
    ]);
    // Leading the trip, it goes below the part it precedes.
    expect(uuids(tripDiveSections(dives, [nowhen, DAHAB, SHARM]))).toEqual([
      { part: 2, dives: ["sharm"] },
      { part: 1, dives: ["dahab"] },
      { part: 0, dives: [] },
    ]);
  });

  it("lists every part of a trip with no dives, newest first", () => {
    expect(uuids(tripDiveSections([], [DAHAB, SHARM]))).toEqual([
      { part: 1, dives: [] },
      { part: 0, dives: [] },
    ]);
  });
});
