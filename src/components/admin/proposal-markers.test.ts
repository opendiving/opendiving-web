import { describe, expect, it } from "vitest";
import {
  openStreetMapPinHref,
  pinMoveMetres,
  reviewMarkers,
} from "./proposal-markers";
import type { AdminDiveSiteProposal } from "@/lib/api/admin";

const PIN = { latitude: 27.5, longitude: 34.25 };
const members = {
  name: "Coral Garden",
  other_names: [],
  ...PIN,
  location_name: null,
  external_ids: [],
  depth_from: null,
  depth_to: null,
  water_type: null,
  altitude: null,
  entry_types: [],
};
const match = {
  uuid: "record-1",
  name: "Coral Gardens",
  other_names: [],
  ...PIN,
  location_name: null,
  external_ids: [],
  attribution: null,
  rule: "within_20_m" as const,
  distance_metres: 15,
  qualifier_siblings: false,
};
const proposal: AdminDiveSiteProposal = {
  uuid: "proposal-1",
  kind: "change",
  message: "",
  created_at: "2026-11-01T10:00:00Z",
  proposer: { name: "Sam", accepted_count: 0, declined_count: 0 },
  site_uuid: "record-9",
  current: members,
  proposed: { ...members, latitude: 27.51 },
  changed: ["latitude", "longitude"],
  matches: [],
};

describe("reviewMarkers", () => {
  it("puts the proposed pin first, then a change's current pin", () => {
    expect(reviewMarkers(proposal, "metric")).toEqual([
      {
        kind: "proposed",
        label: "Proposed",
        latitude: 27.51,
        longitude: 34.25,
      },
      { kind: "current", label: "Current", ...PIN },
    ]);
  });

  it("draws no current pin where the change leaves it, or for a new site", () => {
    const unmoved = { ...proposal, proposed: members };
    const newSite = { ...proposal, kind: "new_site" as const };

    expect(reviewMarkers(unmoved, "metric").map((m) => m.kind)).toEqual([
      "proposed",
    ]);
    expect(reviewMarkers(newSite, "metric").map((m) => m.kind)).toEqual([
      "proposed",
    ]);
  });

  it("names a match with its distance, in the reader's units", () => {
    const labels = (units: "metric" | "imperial") =>
      reviewMarkers(
        { ...proposal, matches: [match, { ...match, distance_metres: null }] },
        units,
      )
        .filter((marker) => marker.kind === "match")
        .map((marker) => marker.label);

    expect(labels("metric")).toEqual(["Coral Gardens · 15 m", "Coral Gardens"]);
    expect(labels("imperial")[0]).toBe("Coral Gardens · 49 ft");
  });

  it("leaves out a match with no pin, and draws nothing with no proposed pin", () => {
    const pinless = { ...match, latitude: null, longitude: null };
    expect(
      reviewMarkers({ ...proposal, matches: [pinless] }, "metric"),
    ).toHaveLength(2);
    expect(
      reviewMarkers(
        {
          ...proposal,
          proposed: { ...members, latitude: null, longitude: null },
        },
        "metric",
      ),
    ).toEqual([]);
  });
});

describe("pinMoveMetres", () => {
  it("measures a change, and nothing else", () => {
    expect(pinMoveMetres(proposal)).toBeCloseTo(1112, 0);
    expect(pinMoveMetres({ ...proposal, proposed: members })).toBeNull();
    expect(pinMoveMetres({ ...proposal, kind: "new_site" })).toBeNull();
  });
});

describe("openStreetMapPinHref", () => {
  it("marks the pin and opens on it", () => {
    expect(openStreetMapPinHref(PIN)).toBe(
      "https://www.openstreetmap.org/?mlat=27.5&mlon=34.25#map=17/27.5/34.25",
    );
  });
});
