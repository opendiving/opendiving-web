import type {
  CommonsDiveSitePoints,
  DiveSiteOwner,
  DiveSitePoint,
} from "@/lib/api/dive-sites";
import type { LatLon, LatLonBounds } from "@/lib/basemap";

// The finder's map points, built from the compact rows the two points routes
// answer. Kept apart from the map so the finder can name a point without
// loading MapLibre, and so the building is tested without a renderer.

/** Where the map is: its centre, and the box on screen in the map's own longitudes. */
export interface FinderView {
  center: LatLon;
  bounds: LatLonBounds;
}

/** A point the diver touched on the map, with the credit a Commons record carries. */
export interface FinderMapPoint extends LatLon {
  uuid: string;
  name: string;
  owner: DiveSiteOwner;
  credit: string | null;
}

interface PointFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { uuid: string; name: string; source: string | null };
}

export interface PointCollection {
  type: "FeatureCollection";
  features: PointFeature[];
}

const feature = (
  longitude: number,
  latitude: number,
  uuid: string,
  name: string,
  source: string | null,
): PointFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [longitude, latitude] },
  properties: { uuid, name, source },
});

/**
 * The Commons records, less those the diver's own layer already draws: a saved
 * record is in both documents, and one dot drawn twice clusters as two.
 */
export function commonsCollection(
  doc: CommonsDiveSitePoints | null,
  drawnElsewhere: ReadonlySet<string>,
): PointCollection {
  return {
    type: "FeatureCollection",
    features: (doc?.points ?? [])
      .filter(([, , uuid]) => !drawnElsewhere.has(uuid))
      .map(([longitude, latitude, uuid, name, source]) =>
        feature(longitude, latitude, uuid, name, source),
      ),
  };
}

/** The diver's own and saved sites. `source` is null: their credit is on their rows. */
export function yoursCollection(
  points: readonly DiveSitePoint[] | null,
): PointCollection {
  return {
    type: "FeatureCollection",
    features: (points ?? []).map(([longitude, latitude, uuid, name]) =>
      feature(longitude, latitude, uuid, name, null),
    ),
  };
}

/**
 * The point a touched feature names. A saved Commons record is drawn on the
 * diver's layer, so its owner and credit come from the diver's document and
 * the Commons one's sources rather than from the layer it was touched on.
 */
export function pointOf(
  properties: { uuid?: unknown; name?: unknown; source?: unknown },
  [longitude, latitude]: [number, number],
  commons: CommonsDiveSitePoints | null,
  yours: readonly DiveSitePoint[] | null,
): FinderMapPoint | null {
  if (typeof properties.uuid !== "string") return null;
  const uuid = properties.uuid;
  const name = typeof properties.name === "string" ? properties.name : "";
  const own = yours?.find((point) => point[2] === uuid);
  const record = commons?.points.find((point) => point[2] === uuid);
  const owner: DiveSiteOwner = own
    ? own[4]
    : record
      ? "opendivingcommons"
      : "account";
  const source = record?.[4];
  return {
    uuid,
    name,
    latitude,
    longitude,
    owner,
    credit:
      owner === "opendivingcommons" && source
        ? (commons?.sources[source] ?? null)
        : null,
  };
}
