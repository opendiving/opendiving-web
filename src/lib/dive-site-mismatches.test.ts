import { describe, expect, it } from "vitest";
import type { DiveSite } from "@/lib/api/dive-sites";
import { diveSiteMismatches } from "./dive-site-mismatches";

const site = (name: string, overrides: Partial<DiveSite> = {}): DiveSite => ({
  uuid: `site-${name}`,
  name,
  user_uuid: "user-1",
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("diveSiteMismatches", () => {
  it("measures each site against the first one that records the property", () => {
    expect(
      diveSiteMismatches(
        [
          site("Plain"),
          site("Lake", { water_type: "fresh", altitude: 1800 }),
          site("Lagoon", { water_type: "brackish", altitude: 1800.4 }),
          site("Tarn", { water_type: "fresh", altitude: 2400 }),
        ],
        "metric",
      ),
    ).toEqual([
      [],
      [],
      ["Brackish, unlike Lake (fresh water)"],
      ["Altitude 2400 m, unlike Lake (1800 m)"],
    ]);
  });

  it("says nothing of a site that records neither", () => {
    expect(
      diveSiteMismatches(
        [site("Lake", { water_type: "fresh", altitude: 0 }), site("Plain")],
        "metric",
      ),
    ).toEqual([[], []]);
  });

  it("reads the altitudes in the diver's units", () => {
    expect(
      diveSiteMismatches(
        [site("Sea", { altitude: 0 }), site("Tarn", { altitude: 2400 })],
        "imperial",
      )[1],
    ).toEqual(["Altitude 7874 ft, unlike Sea (0 ft)"]);
  });
});
