// What `POST /render` accepts, and the places and frame a body draws.
//
// The body is the positional subset of the API's `DiveRead` and `TripRead` -
// which are also the web's `Dive` and `Trip` - and nothing else, so the
// renderer feeds it to the same functions the dive and trip pages map with, and
// a card and its record's page show the same places by construction. Anything
// beyond those fields is refused rather than ignored: the API digests exactly
// what it sends, and a field this side read but the digest left out would be a
// picture that never updates.

import { diveMapLocations } from "@/components/dives/dive-map-locations";
import {
  DIVE_CARD_FRAME,
  placedLocations,
  TRIP_CARD_FRAME,
  type CardFrame,
  type PlacedLocation,
} from "@/lib/map-picture";
import { tripPartLocations } from "@/lib/trip-parts";

export type Theme = "light" | "dark";

type Coordinate = number | null;

export interface DivePayload {
  kind: "dive";
  theme: Theme;
  dive_sites: { latitude: Coordinate; longitude: Coordinate }[];
  entry_latitude: Coordinate;
  entry_longitude: Coordinate;
  exit_latitude: Coordinate;
  exit_longitude: Coordinate;
}

export interface TripLocationPayload {
  latitude: Coordinate;
  longitude: Coordinate;
  bbox_south: Coordinate;
  bbox_north: Coordinate;
  bbox_west: Coordinate;
  bbox_east: Coordinate;
}

export interface TripPayload {
  kind: "trip";
  theme: Theme;
  parts: { location: TripLocationPayload | null }[];
}

export type RenderPayload = DivePayload | TripPayload;

// Far past any real dive or trip, and low enough that a body cannot make one
// render walk an unbounded list.
export const MAX_PLACES = 500;

/** A body that breaks the shape `POST /render` takes: the 400. */
export class PayloadError extends Error {}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Exactly these keys: a missing one is as much a broken body as an extra one.
function keys(value: unknown, expected: readonly string[], what: string): Json {
  if (!isObject(value)) throw new PayloadError(`${what} must be an object`);
  const present = Object.keys(value);
  const missing = expected.filter((key) => !(key in value));
  const extra = present.filter((key) => !expected.includes(key));
  if (missing.length > 0) {
    throw new PayloadError(`${what} is missing ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    throw new PayloadError(`${what} has unexpected ${extra.join(", ")}`);
  }
  return value;
}

function coordinate(value: unknown, limit: 90 | 180, what: string): Coordinate {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PayloadError(`${what} must be a number or null`);
  }
  if (Math.abs(value) > limit) {
    throw new PayloadError(`${what} must be within ±${limit}`);
  }
  return value;
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new PayloadError(`${what} must be a list`);
  if (value.length > MAX_PLACES) {
    throw new PayloadError(`${what} holds more than ${MAX_PLACES} entries`);
  }
  return value;
}

const DIVE_KEYS = [
  "kind",
  "theme",
  "dive_sites",
  "entry_latitude",
  "entry_longitude",
  "exit_latitude",
  "exit_longitude",
] as const;
const TRIP_KEYS = ["kind", "theme", "parts"] as const;
const LOCATION_KEYS = [
  "latitude",
  "longitude",
  "bbox_south",
  "bbox_north",
  "bbox_west",
  "bbox_east",
] as const;

/** The body, checked against the contract, or a thrown `PayloadError`. */
export function parsePayload(body: unknown): RenderPayload {
  if (!isObject(body)) throw new PayloadError("the body must be an object");
  const { theme } = body;
  if (theme !== "light" && theme !== "dark") {
    throw new PayloadError('theme must be "light" or "dark"');
  }

  if (body.kind === "dive") {
    const dive = keys(body, DIVE_KEYS, "a dive");
    return {
      kind: "dive",
      theme,
      dive_sites: list(dive.dive_sites, "dive_sites").map((site, index) => {
        const what = `dive_sites[${index}]`;
        const checked = keys(site, ["latitude", "longitude"], what);
        return {
          latitude: coordinate(checked.latitude, 90, `${what}.latitude`),
          longitude: coordinate(checked.longitude, 180, `${what}.longitude`),
        };
      }),
      entry_latitude: coordinate(dive.entry_latitude, 90, "entry_latitude"),
      entry_longitude: coordinate(dive.entry_longitude, 180, "entry_longitude"),
      exit_latitude: coordinate(dive.exit_latitude, 90, "exit_latitude"),
      exit_longitude: coordinate(dive.exit_longitude, 180, "exit_longitude"),
    };
  }

  if (body.kind === "trip") {
    const trip = keys(body, TRIP_KEYS, "a trip");
    return {
      kind: "trip",
      theme,
      parts: list(trip.parts, "parts").map((part, index) => {
        const what = `parts[${index}]`;
        const { location } = keys(part, ["location"], what);
        if (location === null) return { location: null };
        const at = `${what}.location`;
        const checked = keys(location, LOCATION_KEYS, at);
        return {
          location: {
            latitude: coordinate(checked.latitude, 90, `${at}.latitude`),
            longitude: coordinate(checked.longitude, 180, `${at}.longitude`),
            bbox_south: coordinate(checked.bbox_south, 90, `${at}.bbox_south`),
            bbox_north: coordinate(checked.bbox_north, 90, `${at}.bbox_north`),
            bbox_west: coordinate(checked.bbox_west, 180, `${at}.bbox_west`),
            bbox_east: coordinate(checked.bbox_east, 180, `${at}.bbox_east`),
          },
        };
      }),
    };
  }

  throw new PayloadError('kind must be "dive" or "trip"');
}

/** The places a body draws, as the dive and trip pages derive them. */
export function payloadPlaces(payload: RenderPayload): PlacedLocation[] {
  return placedLocations(
    payload.kind === "dive"
      ? diveMapLocations(payload)
      : tripPartLocations(payload.parts),
  );
}

/** The frame a body's picture is fitted for: its kind's smallest card. */
export function payloadFrame(payload: RenderPayload): CardFrame {
  return payload.kind === "dive" ? DIVE_CARD_FRAME : TRIP_CARD_FRAME;
}
