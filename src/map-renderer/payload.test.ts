import { describe, expect, it } from "vitest";

import { DIVE_CARD_FRAME, TRIP_CARD_FRAME } from "@/lib/map-picture";
import {
  MAX_PLACES,
  parsePayload,
  PayloadError,
  payloadFrame,
  payloadPlaces,
} from "./payload";

const DIVE = {
  kind: "dive",
  theme: "light",
  dive_sites: [
    { latitude: 28.5721, longitude: 34.5372 },
    { latitude: null, longitude: null },
  ],
  entry_latitude: null,
  entry_longitude: null,
  exit_latitude: 28.5689,
  exit_longitude: 34.5355,
};

const PLACE = {
  latitude: 26.82,
  longitude: 30.8,
  bbox_south: 22,
  bbox_north: 31.67,
  bbox_west: 24.7,
  bbox_east: 36.9,
};

const TRIP = {
  kind: "trip",
  theme: "dark",
  parts: [{ location: PLACE }, { location: null }],
};

function rejects(body: unknown, message: RegExp) {
  let thrown: unknown;
  try {
    parsePayload(body);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(PayloadError);
  expect((thrown as Error).message).toMatch(message);
}

describe("parsePayload", () => {
  it("takes a dive and a trip in the contract's shape", () => {
    expect(parsePayload(DIVE)).toEqual(DIVE);
    expect(parsePayload(TRIP)).toEqual(TRIP);
  });

  it("takes a dive with no site and a trip with no part", () => {
    expect(parsePayload({ ...DIVE, dive_sites: [] })).toMatchObject({
      dive_sites: [],
    });
    expect(parsePayload({ ...TRIP, parts: [] })).toMatchObject({ parts: [] });
  });

  // The API digests exactly the fields it sends, so one this side read and the
  // digest left out would be a picture that never updates.
  it("refuses a field the contract does not name", () => {
    rejects({ ...DIVE, name: "Blue Hole" }, /unexpected name/);
    rejects(
      { ...DIVE, dive_sites: [{ latitude: 1, longitude: 2, name: "x" }] },
      /dive_sites\[0\] has unexpected name/,
    );
    rejects(
      { ...TRIP, parts: [{ location: { ...PLACE, name: "Egypt" } }] },
      /parts\[0\]\.location has unexpected name/,
    );
    rejects(
      { ...TRIP, parts: [{ location: null, start_date: "2026-04-18" }] },
      /parts\[0\] has unexpected start_date/,
    );
  });

  it("refuses a body missing a field, rather than reading it as null", () => {
    const { exit_longitude: _, ...dive } = DIVE;
    rejects(dive, /missing exit_longitude/);
    const { bbox_east: __, ...place } = PLACE;
    rejects({ ...TRIP, parts: [{ location: place }] }, /missing bbox_east/);
    rejects({ ...TRIP, parts: [{}] }, /parts\[0\] is missing location/);
  });

  it("refuses an unknown kind or theme", () => {
    rejects({ ...DIVE, kind: "site" }, /kind/);
    rejects({ ...DIVE, theme: "sepia" }, /theme/);
    rejects({ ...DIVE, theme: undefined }, /theme/);
    rejects([DIVE], /object/);
    rejects(null, /object/);
  });

  it("refuses a coordinate that is not a number or null", () => {
    rejects({ ...DIVE, exit_latitude: "28.5" }, /exit_latitude/);
    rejects(
      { ...DIVE, dive_sites: [{ latitude: 1, longitude: true }] },
      /dive_sites\[0\]\.longitude must be a number or null/,
    );
    rejects({ ...DIVE, dive_sites: "none" }, /dive_sites must be a list/);
  });

  it("refuses a coordinate off the globe", () => {
    rejects({ ...DIVE, exit_latitude: 91 }, /exit_latitude must be within ±90/);
    rejects(
      { ...TRIP, parts: [{ location: { ...PLACE, bbox_west: -181 } }] },
      /bbox_west must be within ±180/,
    );
  });

  it("refuses a list longer than any record has", () => {
    const sites = Array.from({ length: MAX_PLACES + 1 }, () => ({
      latitude: 1,
      longitude: 1,
    }));
    rejects({ ...DIVE, dive_sites: sites }, /more than/);
  });
});

describe("payloadPlaces", () => {
  // The dive and trip pages' own functions, so a card shows what its record's
  // page shows: sites as pins and recorded fixes as rings.
  it("derives a dive's places as the dive page does", () => {
    const places = payloadPlaces(parsePayload(DIVE));
    expect(
      places.map(({ latitude, longitude, variant }) => ({
        latitude,
        longitude,
        variant,
      })),
    ).toEqual([
      { latitude: 28.5721, longitude: 34.5372, variant: "pin" },
      { latitude: 28.5689, longitude: 34.5355, variant: "fix" },
    ]);
  });

  it("derives a trip's places as the trip page does, footprints included", () => {
    const places = payloadPlaces(parsePayload(TRIP));
    expect(places).toHaveLength(1);
    expect(places[0].bounds).toEqual({
      south: 22,
      north: 31.67,
      west: 24.7,
      east: 36.9,
    });
  });

  it("draws nothing named, since it is sent no names", () => {
    const places = payloadPlaces(parsePayload(TRIP));
    expect(places.every(({ name }) => name === "")).toBe(true);
  });
});

describe("payloadFrame", () => {
  it("fits a dive for the outlined dive card and a trip for the trip card", () => {
    expect(payloadFrame(parsePayload(DIVE))).toBe(DIVE_CARD_FRAME);
    expect(payloadFrame(parsePayload(TRIP))).toBe(TRIP_CARD_FRAME);
  });
});
