import { describe, expect, it } from "vitest";
import { externalIdHref, registryLabel, sameExternalId } from "./external-ids";

const osm = (identifier: string) => ({
  registry: "openstreetmap",
  identifier,
});
const wikidata = (identifier: string) => ({ registry: "wikidata", identifier });
const worms = (identifier: string) => ({ registry: "worms", identifier });

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

  it("links a WoRMS record to its page", () => {
    expect(externalIdHref(worms("127160"))).toBe(
      "https://www.marinespecies.org/aphia.php?p=taxdetails&id=127160",
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
    expect(
      externalIdHref(worms("urn:lsid:marinespecies.org:taxname:127160")),
    ).toBeNull();
    expect(externalIdHref(worms("0127160"))).toBeNull();
  });
});

describe("registryLabel", () => {
  it("names the registries the format names, and writes any other as stored", () => {
    expect(registryLabel("openstreetmap")).toBe("OpenStreetMap");
    expect(registryLabel("wikidata")).toBe("Wikidata");
    expect(registryLabel("worms")).toBe("WoRMS");
    expect(registryLabel("wrecksite")).toBe("wrecksite");
  });
});
