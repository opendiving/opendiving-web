import { describe, expect, it } from "vitest";
import {
  speciesDisplayName,
  speciesNameWithRank,
  speciesRankLabel,
  speciesSecondaryName,
  speciesSeenRange,
} from "./species";

describe("speciesDisplayName", () => {
  it("prefers the common name", () => {
    expect(
      speciesDisplayName({
        scientific_name: "Amphiprion ocellaris",
        common_name: "Ocellaris clownfish",
      }),
    ).toBe("Ocellaris clownfish");
  });

  it("falls back to the scientific name, which is the normal case", () => {
    // Most of the ocean has no English name, so this branch is what the picker
    // renders for most rows - not an error path.
    expect(
      speciesDisplayName({
        scientific_name: "Chromodoris annae",
        common_name: null,
      }),
    ).toBe("Chromodoris annae");
  });
});

describe("speciesSecondaryName", () => {
  it("gives the binomial to show beside a common name", () => {
    expect(
      speciesSecondaryName({
        scientific_name: "Mobula birostris",
        common_name: "Giant manta ray",
      }),
    ).toBe("Mobula birostris");
  });

  it("gives nothing when it would only repeat the display name", () => {
    expect(
      speciesSecondaryName({
        scientific_name: "Chromodoris annae",
        common_name: null,
      }),
    ).toBeUndefined();
  });
});

describe("speciesRankLabel", () => {
  it("passes a real rank through", () => {
    expect(speciesRankLabel("Family")).toBe("Family");
  });

  it("drops the API's 'unknown' placeholder", () => {
    // Not a rank: it is what the API writes when there is no rank to report -
    // a Wikidata entity with no taxon-rank statement, or a WoRMS record that
    // arrived without the field. Printed as-is the picker reads "Manta
    // americana, unknown" - a claim about the animal rather than about how much
    // is known.
    expect(speciesRankLabel("unknown")).toBeUndefined();
    expect(speciesRankLabel("Unknown")).toBeUndefined();
  });

  it("drops a blank rank", () => {
    expect(speciesRankLabel("")).toBeUndefined();
    expect(speciesRankLabel("   ")).toBeUndefined();
  });
});

describe("speciesNameWithRank", () => {
  it("leaves a species-rank binomial alone", () => {
    expect(
      speciesNameWithRank({
        scientific_name: "Amphiprion ocellaris",
        common_name: "Ocellaris clownfish",
        rank: "Species",
      }),
    ).toBe("Amphiprion ocellaris");
  });

  it("names the rank when the sighting is broader than a species", () => {
    // "Muraenidae" on its own reads as a species name and isn't one - a diver
    // who logged "a moray eel" logged a family.
    expect(
      speciesNameWithRank({
        scientific_name: "Muraenidae",
        common_name: null,
        rank: "Family",
      }),
    ).toBe("Muraenidae (Family)");
  });

  it("matches the rank case-insensitively", () => {
    // `rank` is WoRMS's own open vocabulary passed straight through, so its
    // capitalisation is theirs to change, not ours to depend on.
    expect(
      speciesNameWithRank({
        scientific_name: "Amphiprion ocellaris",
        common_name: null,
        rank: "species",
      }),
    ).toBe("Amphiprion ocellaris");
  });

  it("adds nothing when the rank is missing, blank or unknown", () => {
    for (const rank of ["  ", "", "unknown"]) {
      expect(
        speciesNameWithRank({
          scientific_name: "Amphiprion ocellaris",
          common_name: null,
          rank,
        }),
      ).toBe("Amphiprion ocellaris");
    }
  });
});

describe("speciesSeenRange", () => {
  it("prints one date for a species seen exactly once", () => {
    const seen = "2026-08-30T09:15:00+02:00";

    expect(speciesSeenRange(seen, seen)).toBe("Aug 30, 2026");
  });

  // The bug this function exists to hold. `first_seen`/`last_seen` are dive
  // start times to the second, so two dives on one day - the ordinary case,
  // since a diver logs several at a site and sees the same fish on each - are
  // different strings that render as the same date. Collapsing on the raw
  // values instead of the formatted ones gives "Aug 30, 2026 - Aug 30, 2026".
  it("collapses two sightings on the same day to one date", () => {
    expect(
      speciesSeenRange(
        "2026-08-30T09:15:00+02:00",
        "2026-08-30T14:40:00+02:00",
      ),
    ).toBe("Aug 30, 2026");
  });

  it("prints a range when the sightings fall on different days", () => {
    expect(
      speciesSeenRange(
        "2026-08-30T09:15:00+02:00",
        "2026-09-02T11:00:00+02:00",
      ),
    ).toBe("Aug 30, 2026 \u2013 Sep 2, 2026");
  });

  // Both ends are rendered in the zone the dive carries, not the viewer's - the
  // app-wide contract for a dive `start_time`. This pair is late enough on the
  // 30th in Thailand to be the 30th there and the 29th in UTC, so a formatter
  // that re-derived a local time would print the wrong day here and the right
  // one for any fixture logged at +00:00.
  it("reports each end in the zone its own dive was logged in", () => {
    expect(
      speciesSeenRange(
        "2026-08-30T02:00:00+07:00",
        "2026-08-30T02:00:00+07:00",
      ),
    ).toBe("Aug 30, 2026");
  });
});
