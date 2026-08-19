import { describe, expect, it } from "vitest";
import {
  mapSpeciesResults,
  parsePendingSpeciesId,
  pendingSpeciesId,
} from "./species-multi-select";
import type {
  SpeciesSearchResponse,
  SpeciesSearchResult,
} from "@/lib/api/species";

const WORMS = "World Register of Marine Species (marinespecies.org)";
const WIKIDATA = "Wikidata (CC0)";

function result(overrides: Partial<SpeciesSearchResult> = {}) {
  return {
    aphia_id: 278400,
    uuid: null,
    scientific_name: "Amphiprion ocellaris",
    common_name: "Ocellaris clownfish",
    rank: "Species",
    status: "accepted",
    matched_name: null,
    source: "wikidata",
    attribution: WIKIDATA,
    ...overrides,
  } as SpeciesSearchResult;
}

function response(
  results: SpeciesSearchResult[],
  has_more = false,
): SpeciesSearchResponse {
  return { results, has_more };
}

describe("pendingSpeciesId / parsePendingSpeciesId", () => {
  it("round-trips an AphiaID", () => {
    expect(parsePendingSpeciesId(pendingSpeciesId(278400))).toBe(278400);
  });

  it("reads a uuid as not pending, which is the branch that appends directly", () => {
    expect(
      parsePendingSpeciesId("0198c0de-1234-7000-8000-000000000001"),
    ).toBeNull();
  });

  it("refuses a prefixed id that isn't a positive integer", () => {
    // Nothing produces these, but the parse decides whether a value goes into
    // form state or into a resolve, and "NaN" must not become either.
    expect(parsePendingSpeciesId("aphia:")).toBeNull();
    expect(parsePendingSpeciesId("aphia:nope")).toBeNull();
    expect(parsePendingSpeciesId("aphia:0")).toBeNull();
    expect(parsePendingSpeciesId("aphia:1.5")).toBeNull();
  });
});

describe("mapSpeciesResults", () => {
  it("keys a catalog row by its uuid and an upstream one by its AphiaID", () => {
    const mapped = mapSpeciesResults(
      response([
        result({ uuid: "species-1", aphia_id: 105792, source: "catalog" }),
        result({ aphia_id: 278400 }),
      ]),
    );

    expect(mapped.items.map((item) => item.id)).toEqual([
      "species-1",
      "aphia:278400",
    ]);
  });

  it("shows the common name and hints with the binomial", () => {
    const [item] = mapSpeciesResults(response([result()])).items;

    expect(item.name).toBe("Ocellaris clownfish");
    expect(item.hint).toBe("Amphiprion ocellaris");
  });

  it("hints with the rank when the binomial is already the name", () => {
    // A row shown by its scientific name is disambiguated by nothing the name
    // doesn't say - but "Genus" tells the diver they are about to log a genus.
    const [item] = mapSpeciesResults(
      response([
        result({
          scientific_name: "Amphiprion",
          common_name: null,
          rank: "Genus",
        }),
      ]),
    ).items;

    expect(item.name).toBe("Amphiprion");
    expect(item.hint).toBe("Genus");
  });

  it("leaves the hint off entirely when there is no usable rank", () => {
    // "unknown" is the API's placeholder for "no rank to report" - a
    // Wikidata-only hit, or a WoRMS record that arrived without the field.
    // "Manta americana, unknown" reads as a claim about the animal rather than
    // about how much is known.
    const [item] = mapSpeciesResults(
      response([
        result({
          scientific_name: "Manta americana",
          common_name: null,
          rank: "unknown",
        }),
      ]),
    ).items;

    expect(item.name).toBe("Manta americana");
    expect(item.hint).toBeUndefined();
  });

  it("still says what matched on a row with no usable rank", () => {
    const [item] = mapSpeciesResults(
      response([
        result({
          scientific_name: "Manta americana",
          common_name: null,
          rank: "unknown",
          matched_name: "Cephalopterus manta",
        }),
      ]),
    ).items;

    expect(item.hint).toBe('matched "Cephalopterus manta"');
  });

  it("says which name matched when it isn't one on the row", () => {
    // The accepted-taxon rule is invisible from the outside: searching "Manta
    // birostris" returns a row reading *Mobula birostris*, and without this the
    // diver has no way to tell it is the animal they typed.
    const [item] = mapSpeciesResults(
      response([
        result({
          aphia_id: 105857,
          scientific_name: "Mobula birostris",
          common_name: "Giant manta ray",
          matched_name: "Manta birostris",
          source: "worms",
          attribution: WORMS,
        }),
      ]),
    ).items;

    expect(item.hint).toBe('Mobula birostris · matched "Manta birostris"');
  });

  it("stays quiet when the matched name is already on the row", () => {
    expect(
      mapSpeciesResults(
        response([result({ matched_name: "ocellaris CLOWNFISH" })]),
      ).items[0].hint,
    ).toBe("Amphiprion ocellaris");
    expect(
      mapSpeciesResults(
        response([result({ matched_name: "Amphiprion ocellaris" })]),
      ).items[0].hint,
    ).toBe("Amphiprion ocellaris");
  });

  it("returns summaries only for rows that are already catalog rows", () => {
    // An upstream row has no uuid, so there is nothing a label map could key it
    // on until a resolve gives it one.
    const mapped = mapSpeciesResults(
      response([result({ uuid: "species-1" }), result({ aphia_id: 105857 })]),
    );

    expect(mapped.summaries).toEqual([
      {
        uuid: "species-1",
        scientific_name: "Amphiprion ocellaris",
        common_name: "Ocellaris clownfish",
        rank: "Species",
      },
    ]);
  });

  it("dedupes the licence credits and carries has_more through", () => {
    const mapped = mapSpeciesResults(
      response(
        [
          result({ aphia_id: 1, attribution: WORMS, source: "worms" }),
          result({ aphia_id: 2, attribution: WORMS, source: "worms" }),
          result({ aphia_id: 3, attribution: WIKIDATA }),
        ],
        true,
      ),
    );

    expect(mapped.attributions).toEqual([WORMS, WIKIDATA]);
    expect(mapped.hasMore).toBe(true);
  });

  it("collapses results that would share a row id", () => {
    // Two menu rows with the same React key are both a warning and a row that
    // can't be excluded from the menu once it has been picked.
    const mapped = mapSpeciesResults(
      response([result(), result({ common_name: "Common clownfish" })]),
    );

    expect(mapped.items).toHaveLength(1);
    expect(mapped.items[0].name).toBe("Ocellaris clownfish");
    expect(mapped.results.get("aphia:278400")?.common_name).toBe(
      "Ocellaris clownfish",
    );
  });
});
