import { describe, expect, it } from "vitest";
import {
  externalIdHref,
  pickExternalId,
  registryLabel,
  sameExternalId,
} from "./external-ids";

const osm = (identifier: string) => ({
  registry: "openstreetmap",
  identifier,
});
const wikidata = (identifier: string) => ({ registry: "wikidata", identifier });

describe("pickExternalId", () => {
  it("adds the row's entry to a site that carries none", () => {
    expect(pickExternalId([], null, osm("node/1"))).toEqual({
      externalIds: [osm("node/1")],
      added: osm("node/1"),
    });
  });

  // The wrong row, then the right one: the site is named and placed by the second,
  // so it must not stay linked to the first.
  it("replaces the entry an earlier pick in the same dialog added", () => {
    const first = pickExternalId([], null, osm("node/1"));
    const second = pickExternalId(
      first.externalIds,
      first.added,
      wikidata("Q2"),
    );

    expect(second).toEqual({
      externalIds: [wikidata("Q2")],
      added: wikidata("Q2"),
    });
  });

  // An entry an import brought is the site's, and leaves only when the diver
  // removes it.
  it("keeps every entry the site carried when the dialog opened", () => {
    const opening = [
      wikidata("Q9"),
      { registry: "wrecksite", identifier: "1" },
    ];
    const first = pickExternalId(opening, null, osm("node/1"));
    const second = pickExternalId(
      first.externalIds,
      first.added,
      osm("node/2"),
    );

    expect(second.externalIds).toEqual([...opening, osm("node/2")]);
  });

  // Re-picking the row a site was made from would otherwise send one pair twice.
  it("adds nothing for a row whose entry the site already carries", () => {
    const opening = [osm("node/1")];

    expect(pickExternalId(opening, null, osm("node/1"))).toEqual({
      externalIds: opening,
      added: null,
    });
  });

  // Back to a row the site carried from the start: the earlier pick's entry goes,
  // and nothing is left for a third pick to replace.
  it("drops the earlier pick's entry for a row the site already carried", () => {
    const opening = [osm("node/1")];
    const first = pickExternalId(opening, null, wikidata("Q2"));

    expect(
      pickExternalId(first.externalIds, first.added, osm("node/1")),
    ).toEqual({ externalIds: opening, added: null });
  });

  it("leaves the list alone when the earlier pick's entry was already removed", () => {
    const first = pickExternalId([], null, osm("node/1"));

    expect(pickExternalId([], first.added, osm("node/2")).externalIds).toEqual([
      osm("node/2"),
    ]);
  });
});

describe("sameExternalId", () => {
  it("compares the registry and the identifier exactly", () => {
    expect(sameExternalId(osm("node/1"), osm("node/1"))).toBe(true);
    expect(sameExternalId(osm("node/1"), osm("way/1"))).toBe(false);
    expect(
      sameExternalId(osm("node/1"), {
        registry: "OpenStreetMap",
        identifier: "node/1",
      }),
    ).toBe(false);
  });
});

describe("externalIdHref", () => {
  it("links an OpenStreetMap element to its page", () => {
    expect(externalIdHref(osm("way/42"))).toBe(
      "https://www.openstreetmap.org/way/42",
    );
  });

  it("links a Wikidata item to its page", () => {
    expect(externalIdHref(wikidata("Q193213"))).toBe(
      "https://www.wikidata.org/wiki/Q193213",
    );
  });

  it("links nothing the format names no form for", () => {
    expect(
      externalIdHref({ registry: "wrecksite", identifier: "10021" }),
    ).toBeNull();
  });

  // A producer key the API accepts, and a property every object inherits.
  it("reads a registry named like an inherited property as any other", () => {
    const entry = { registry: "constructor", identifier: "1" };

    expect(externalIdHref(entry)).toBeNull();
    expect(registryLabel("constructor")).toBe("constructor");
  });

  // Built from a malformed identifier, a link would lead nowhere a reader could
  // trust.
  it("links nothing whose identifier is not its registry's form", () => {
    expect(externalIdHref(osm("255316037"))).toBeNull();
    expect(externalIdHref(wikidata("Q0"))).toBeNull();
  });
});

describe("registryLabel", () => {
  it("names the two registries the format names, and writes any other as stored", () => {
    expect(registryLabel("openstreetmap")).toBe("OpenStreetMap");
    expect(registryLabel("wikidata")).toBe("Wikidata");
    expect(registryLabel("wrecksite")).toBe("wrecksite");
  });
});
