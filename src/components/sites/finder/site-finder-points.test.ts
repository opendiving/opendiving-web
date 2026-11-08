import { describe, expect, it } from "vitest";
import type {
  CommonsDiveSitePoints,
  DiveSitePoint,
} from "@/lib/api/dive-sites";
import {
  commonsCollection,
  pointOf,
  yoursCollection,
} from "./site-finder-points";

const CREDIT =
  "[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)";
const COMMONS: CommonsDiveSitePoints = {
  version: "v1",
  sources: { osm: CREDIT },
  points: [
    [34.54, 28.57, "canyon", "The Canyon", "osm"],
    [34.53, 28.5, "lighthouse", "Lighthouse", "osm"],
  ],
};
const YOURS: DiveSitePoint[] = [
  [34.53, 28.5, "lighthouse", "Lighthouse", "opendivingcommons"],
  [34.4, 28.4, "house-reef", "House reef", "account"],
];

describe("commonsCollection", () => {
  it("leaves out the records the diver's layer draws", () => {
    const collection = commonsCollection(COMMONS, new Set(["lighthouse"]));

    expect(collection.features.map((f) => f.properties.uuid)).toEqual([
      "canyon",
    ]);
    expect(collection.features[0].geometry.coordinates).toEqual([34.54, 28.57]);
  });

  it("is empty before the document is read", () => {
    expect(commonsCollection(null, new Set()).features).toEqual([]);
  });
});

describe("pointOf", () => {
  it("credits a Commons record with its source's credit", () => {
    expect(
      pointOf(
        { uuid: "canyon", name: "The Canyon" },
        [34.54, 28.57],
        COMMONS,
        YOURS,
      ),
    ).toEqual({
      uuid: "canyon",
      name: "The Canyon",
      latitude: 28.57,
      longitude: 34.54,
      owner: "opendivingcommons",
      credit: CREDIT,
    });
  });

  it("credits a saved record drawn on the diver's layer too", () => {
    const [feature] = yoursCollection(YOURS).features;
    expect(
      pointOf(feature.properties, feature.geometry.coordinates, COMMONS, YOURS),
    ).toMatchObject({ owner: "opendivingcommons", credit: CREDIT });
  });

  it("credits nothing on the diver's own site", () => {
    expect(
      pointOf(
        { uuid: "house-reef", name: "House reef" },
        [34.4, 28.4],
        COMMONS,
        YOURS,
      ),
    ).toMatchObject({ owner: "account", credit: null });
  });
});
