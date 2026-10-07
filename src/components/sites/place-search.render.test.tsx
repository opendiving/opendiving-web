import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceSearch } from "./place-search";
import type { GeocodeResult } from "@/lib/api/geocoding";
import type { DiveSiteSuggestion } from "@/lib/api/dive-site-catalog";
import type { UnitSystem } from "@/lib/units";

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  // The real values, since the field hands them to the combobox as the bounds
  // outside which "nothing found" would be a claim about a search that never
  // ran.
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

// Only the call is stubbed: `diveSitePlaceContext` is the rule for what a row
// says about where it is, and a hand-written stand-in for it here would be
// testing the stand-in.
vi.mock("@/lib/api/dive-site-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-site-catalog")>()),
  diveSiteCatalogAPI: { suggestDiveSites: vi.fn() },
}));

const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const searchPlaces = vi.mocked(geocodingAPI.searchPlaces);
const { diveSiteCatalogAPI } = await import("@/lib/api/dive-site-catalog");
const suggestDiveSites = vi.mocked(diveSiteCatalogAPI.suggestDiveSites);

const OSM_CREDIT =
  "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)";
const WIKIDATA_CREDIT =
  "[Data from Wikidata, CC0 1.0.](https://www.wikidata.org/wiki/Wikidata:Licensing)";

const DAHAB: GeocodeResult = {
  latitude: 28.4954,
  longitude: 34.5197,
  location: "Dahab, South Sinai Governorate, Egypt",
  name: "Dahab",
  country: "Egypt",
  region: "South Sinai Governorate",
  source: "osm",
  source_id: "node/27043265",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

const THISTLEGORM: DiveSiteSuggestion = {
  name: "SS Thistlegorm",
  name_en: null,
  latitude: 27.814092,
  longitude: 33.920048,
  country: "Egypt",
  region: "South Sinai",
  source: "osm",
  source_id: "node/255316037",
  external_id: { registry: "openstreetmap", identifier: "node/255316037" },
  held_site: null,
  attribution: OSM_CREDIT,
};

const suggest = (results: DiveSiteSuggestion[], has_more = false) =>
  suggestDiveSites.mockResolvedValue({ results, has_more });

beforeEach(() => {
  searchPlaces.mockClear();
  searchPlaces.mockResolvedValue([]);
  suggestDiveSites.mockClear();
  suggest([]);
});

afterEach(() => {
  auth.units = "metric";
});

// Typing, then waiting out the 450 ms this field deliberately types more slowly
// with than the rest of the app. Waits on the catalog rather than the geocoder
// because it is the half every test here has an opinion about.
const searchFor = async (query: string) => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.paste(query);
  await waitFor(
    () => expect(suggestDiveSites).toHaveBeenCalledWith(query, null),
    { timeout: 2000 },
  );
};

describe("PlaceSearch results", () => {
  it("lists catalog dive sites above geocoded places", async () => {
    // The whole of the ordering decision: the primitive preserves what the
    // caller returns, so a named dive site beats a town by being listed first.
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const rows = screen.getAllByRole("option").map((row) => row.textContent);
    expect(rows[0]).toMatch(/^SS Thistlegorm/);
    expect(rows[1]).toMatch(/^Dahab/);
  });

  it("hands a picked dive site back tagged as one", async () => {
    // The caller fills a different set of fields for each kind, and reads the
    // tag rather than picking the menu-row id apart to find out which.
    suggest([THISTLEGORM]);
    const onPick = vi.fn();
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />);

    await searchFor("thistlegorm");
    await userEvent.click(
      await screen.findByRole("option", { name: /SS Thistlegorm/ }),
    );

    expect(onPick).toHaveBeenCalledWith({
      kind: "catalog",
      site: THISTLEGORM,
    });
  });

  it("hands a picked place back tagged as one, whole", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />);

    await searchFor("Dahab");
    await userEvent.click(await screen.findByRole("option", { name: /Dahab/ }));

    expect(onPick).toHaveBeenCalledWith({ kind: "geocode", result: DAHAB });
  });

  it("keeps the two sources' row ids apart", async () => {
    // A catalog row and a geocoded row for the same place must not collide in
    // the map that turns an id back into a pick - the second one in would
    // otherwise answer for the first.
    const sameSpot: DiveSiteSuggestion = {
      ...THISTLEGORM,
      name: "Dahab",
      latitude: DAHAB.latitude,
      longitude: DAHAB.longitude,
    };
    suggest([sameSpot]);
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />);

    await searchFor("Dahab");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getAllByRole("option")[1]);

    expect(onPick).toHaveBeenCalledWith({ kind: "geocode", result: DAHAB });
  });

  it("says the list was cut when the catalog held matches back", async () => {
    // Without the pass-through this footer can never render: `hasMore` is the
    // primitive's, and the catalog response is the only thing that knows.
    suggest([THISTLEGORM], true);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("point");

    expect(
      await screen.findByText(
        "More matches than shown - keep typing to narrow.",
      ),
    ).toBeInTheDocument();
  });

  it("claims nothing was held back when only the geocoder answered", async () => {
    // The geocoder returns a bare list and says nothing about its own cap.
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");
    await screen.findByRole("option", { name: /Dahab/ });

    expect(screen.queryByText(/keep typing to narrow/)).not.toBeInTheDocument();
  });

  it("collapses a place the geocoder returned twice", async () => {
    // Rows are keyed by content, and two menu rows sharing a React key is both
    // a warning and a row that can't be picked.
    searchPlaces.mockResolvedValue([DAHAB, DAHAB]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("names a place, then its region, then its country", async () => {
    // Read as one line, the row says what picking it saves: the API's
    // `location`, which the Location field takes unchanged.
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", { name: DAHAB.location }),
    ).toBeInTheDocument();
  });

  it("names an address-only result by its composed location", async () => {
    // A result that matched an address rather than a named place has no name of
    // its own, and its `location` already holds the region and country a hint
    // would add - so it reads as that alone, saying nothing twice.
    const address = {
      ...DAHAB,
      name: null,
      location: "Assalah Street, South Sinai Governorate, Egypt",
    };
    searchPlaces.mockResolvedValue([address]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");

    const row = await screen.findByRole("option", { name: address.location });
    expect(row.textContent).toBe(address.location);
  });
});

// One source down is a shorter menu, not an error. The combobox reads any throw
// from `onSearch` as total failure - it empties the list and shows
// `searchErrorLabel` - so awaiting the two together would let the geocoder's
// per-user rate limit delete catalog rows that arrived perfectly well, and let a
// catalog failure regress the box that works today.
describe("PlaceSearch with one source down", () => {
  it("still shows catalog rows when the geocoder throws", async () => {
    suggest([THISTLEGORM]);
    searchPlaces.mockRejectedValue(new Error("429 Too Many Requests"));
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: /SS Thistlegorm/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't reach the search/),
    ).not.toBeInTheDocument();
  });

  it("still shows geocoded rows when the catalog throws", async () => {
    suggestDiveSites.mockRejectedValue(new Error("500"));
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", { name: /Dahab/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't reach the search/),
    ).not.toBeInTheDocument();
  });

  it("reports the failure only when neither source could answer", async () => {
    suggestDiveSites.mockRejectedValue(new Error("500"));
    searchPlaces.mockRejectedValue(new Error("429"));
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByText(
        "Couldn't reach the search - press Enter to use it as typed, or place the site on the map.",
      ),
    ).toBeInTheDocument();
  });

  it("points a diver at the map when neither source has an answer", async () => {
    // All three empty menus end the same way, because the map below is the
    // answer to every one of them - including the geocoder's throttled proxy,
    // which the API also reports as an empty list.
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Atlantis");

    expect(
      await screen.findByText(
        "Nothing found - press Enter to use it as typed, or place the site on the map.",
      ),
    ).toBeInTheDocument();
  });
});

describe("PlaceSearch hints", () => {
  it("carries the finest place context the record has", async () => {
    suggest([THISTLEGORM]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: "SS Thistlegorm, South Sinai, Egypt",
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the country where the record has no region", async () => {
    suggest([{ ...THISTLEGORM, region: null }]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: "SS Thistlegorm, Egypt" }),
    ).toBeInTheDocument();
  });

  it("says nothing rather than inventing a difference it hasn't got", async () => {
    // The seven `Diving Spot` records sit within about four kilometres of each
    // other in one bay. Nothing in the record shape separates them, and neither
    // can a diver - so they are shown as what they are, and picking any of them
    // still brings its own coordinates for the pin to be dragged from.
    suggest([{ ...THISTLEGORM, region: null, country: null }]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: "SS Thistlegorm" }),
    ).toBeInTheDocument();
  });

  it("shows the English name where that is not what the row is called", async () => {
    // Otherwise a search for "Sunabe" returns a row reading 砂辺 and nothing on
    // screen explains why it matched.
    suggest([
      { ...THISTLEGORM, name: "砂辺", name_en: "Sunabe", region: null },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Sunabe");

    expect(
      await screen.findByRole("option", { name: "砂辺, Sunabe · Egypt" }),
    ).toBeInTheDocument();
  });

  // Before it is picked, so the diver knows a pick would make a second one.
  it("names the diver's own site that already carries the row's entry", async () => {
    suggest([
      {
        ...THISTLEGORM,
        held_site: { uuid: "site-1", name: "Thistlegorm wreck" },
      },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: "SS Thistlegorm, In your sites as Thistlegorm wreck · South Sinai, Egypt",
      }),
    ).toBeInTheDocument();
  });

  it("does not repeat a name the row already shows", async () => {
    suggest([{ ...THISTLEGORM, name_en: "SS Thistlegorm", region: null }]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: "SS Thistlegorm, Egypt" }),
    ).toBeInTheDocument();
  });
});

// A geocoder row reads as one comma-separated line - the combobox joins a name
// and its hint with ", " - so it is composed the way a catalog row's place
// context is, and never says the same part twice.
describe("PlaceSearch geocoder rows", () => {
  const MOALBOAL_CEBU: GeocodeResult = {
    latitude: 9.9366,
    longitude: 123.3986,
    location: "Moalboal, Cebu, Philippines",
    name: "Moalboal",
    country: "Philippines",
    region: "Cebu",
    source: "osm",
    source_id: "relation/1",
    attribution: OSM_CREDIT,
  };
  const MOALBOAL_ZAMBOANGA: GeocodeResult = {
    ...MOALBOAL_CEBU,
    latitude: 7.62,
    longitude: 122.52,
    location: "Moalboal, Zamboanga Sibugay, Philippines",
    region: "Zamboanga Sibugay",
    source_id: "node/2",
  };

  it("tells two same-named places apart by their region", async () => {
    searchPlaces.mockResolvedValue([MOALBOAL_CEBU, MOALBOAL_ZAMBOANGA]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("moalboal");

    expect(
      await screen.findByRole("option", {
        name: "Moalboal, Cebu, Philippines",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Moalboal, Zamboanga Sibugay, Philippines",
      }),
    ).toBeInTheDocument();
  });

  it("does not repeat a part the name already says", async () => {
    // A country row is its own country, and "Philippines, Philippines" is a
    // stammer rather than a hint.
    searchPlaces.mockResolvedValue([
      {
        ...MOALBOAL_CEBU,
        name: "Philippines",
        location: "Philippines",
        region: null,
      },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("philippines");

    expect(
      await screen.findByRole("option", { name: "Philippines" }),
    ).toBeInTheDocument();
  });

  it("shows the name alone where nothing is known above it", async () => {
    // An older API sends neither field, and Photon holds nothing above some
    // places: never "undefined" and never a stray comma.
    searchPlaces.mockResolvedValue([
      {
        ...MOALBOAL_CEBU,
        location: "Moalboal",
        region: undefined,
        country: undefined,
      },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("moalboal");

    expect(
      await screen.findByRole("option", { name: "Moalboal" }),
    ).toBeInTheDocument();
  });

  it("reads a region and country in the same words as a catalog row", async () => {
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([
      {
        ...DAHAB,
        name: "Sharm El Sheikh",
        location: "Sharm El Sheikh, South Sinai, Egypt",
        region: "South Sinai",
        source_id: "node/3",
      },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("sharm");

    expect(
      await screen.findByRole("option", {
        name: "SS Thistlegorm, South Sinai, Egypt",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", {
        name: "Sharm El Sheikh, South Sinai, Egypt",
      }),
    ).toBeInTheDocument();
  });

  describe("that repeat a catalog row", () => {
    const MONAD_SHOAL: DiveSiteSuggestion = {
      ...THISTLEGORM,
      name: "Monad Shoal",
      latitude: 11.3,
      longitude: 124.19,
      country: "Philippines",
      region: "Cebu",
      source: "osm",
      source_id: "node/6215139685",
    };
    const MONAD_SHOAL_PLACE: GeocodeResult = {
      ...MOALBOAL_CEBU,
      latitude: 11.3,
      longitude: 124.19,
      name: "Monad Shoal",
      location: "Monad Shoal, Cebu, Philippines",
      source: "osm",
      source_id: "node/6215139685",
    };

    it("drops the geocoder's copy of the same OSM object", async () => {
      // The catalog row names the dive site, which is the better answer.
      suggest([MONAD_SHOAL]);
      searchPlaces.mockResolvedValue([MONAD_SHOAL_PLACE]);
      const onPick = vi.fn();
      render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />);

      await searchFor("monad shoal");
      await waitFor(() => expect(searchPlaces).toHaveResolved());

      await waitFor(() =>
        expect(screen.getAllByRole("option")).toHaveLength(1),
      );
      await userEvent.click(screen.getByRole("option"));
      // The one row left is the catalog's, and the credit is still there.
      expect(onPick).toHaveBeenCalledWith({
        kind: "catalog",
        site: MONAD_SHOAL,
      });
      expect(
        screen.getByRole("link", {
          name: "Data © OpenStreetMap contributors, ODbL 1.0.",
        }),
      ).toBeInTheDocument();
    });

    it("keeps both where the catalog row is Wikidata's", async () => {
      // A Wikidata record whose id happens to spell the same is a different
      // database's record, not the same object.
      suggest([
        { ...MONAD_SHOAL, source: "wikidata", attribution: WIKIDATA_CREDIT },
      ]);
      searchPlaces.mockResolvedValue([MONAD_SHOAL_PLACE]);
      render(
        <PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />,
      );

      await searchFor("monad shoal");

      await waitFor(() =>
        expect(screen.getAllByRole("option")).toHaveLength(2),
      );
    });

    it("keeps a geocoder row that carries no identity", async () => {
      // An older API sends neither field, and "absent" must not match "absent".
      suggest([MONAD_SHOAL]);
      searchPlaces.mockResolvedValue([
        { ...MONAD_SHOAL_PLACE, source: undefined, source_id: undefined },
      ]);
      render(
        <PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />,
      );

      await searchFor("monad shoal");

      await waitFor(() =>
        expect(screen.getAllByRole("option")).toHaveLength(2),
      );
    });
  });
});

describe("PlaceSearch with a position on the form", () => {
  const NEARBY = { latitude: 27.8, longitude: 33.92 };

  const searchWithPosition = async (query: string) => {
    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste(query);
    await waitFor(
      () => expect(suggestDiveSites).toHaveBeenCalledWith(query, NEARBY),
      { timeout: 2000 },
    );
  };

  it("sends it to the catalog, so a same-name cluster comes back nearest first", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        position={NEARBY}
      />,
    );

    await searchWithPosition("thistlegorm");
  });

  it("puts the distance on each row", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        position={NEARBY}
      />,
    );

    await searchWithPosition("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: "SS Thistlegorm, South Sinai, Egypt · 1.6 km",
      }),
    ).toBeInTheDocument();
  });

  it("measures it in the diver's own units", async () => {
    // The reason no distance rides on the wire: pre-formatted or metric-only, it
    // would silently ignore this preference. The same row reads "1.6 km" for a
    // diver on metric, in the test above.
    auth.units = "imperial";
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        position={NEARBY}
      />,
    );

    await searchWithPosition("thistlegorm");

    expect(
      await screen.findByRole("option", { name: /· 5\d{3} ft$/ }),
    ).toBeInTheDocument();
  });
});

describe("PlaceSearch credits", () => {
  it("renders the credit's licence link rather than its markdown", async () => {
    // The API folds the licence URL into the credit as a markdown link. Printed
    // rather than rendered, a diver reads "[Data © OpenStreetMap contributors,
    // ODbL 1.0.](https://osm.org/copyright)" under the field.
    suggest([THISTLEGORM]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    const link = await screen.findByRole("link", {
      name: "Data © OpenStreetMap contributors, ODbL 1.0.",
    });
    expect(link).toHaveAttribute("href", "https://osm.org/copyright");
    expect(screen.queryByText(/\[Data ©/)).not.toBeInTheDocument();
  });

  it("shows one OpenStreetMap credit for two sources that share the string", async () => {
    // The catalog's OSM credit is byte-identical to the geocoder's, which is
    // what makes the accumulator's existing collapse-by-string enough - there is
    // no deduplication of our own here and there should not be.
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([{ ...DAHAB, attribution: OSM_CREDIT }]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("Dahab");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    expect(
      screen.getAllByRole("link", {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      }),
    ).toHaveLength(1);
  });

  it("credits a Wikidata row on its own terms", async () => {
    // The regional patch is CC0 rather than ODbL, so reusing OSM's string for it
    // would be a false statement about both.
    suggest([
      { ...THISTLEGORM, source: "wikidata", attribution: WIKIDATA_CREDIT },
    ]);
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("link", { name: "Data from Wikidata, CC0 1.0." }),
    ).toBeInTheDocument();
  });

  it("keeps the credit's line reserved before any search has run", async () => {
    // A credit that materialises with the first result grows the field and
    // shoves the map under it down the dialog mid-edit. Counted as elements
    // rather than measured, since jsdom lays nothing out: what must not happen
    // is a paragraph arriving.
    suggest([THISTLEGORM]);
    const { container } = render(
      <PlaceSearch value={null} onTypeName={vi.fn()} onPick={vi.fn()} />,
    );
    const before = container.querySelectorAll("p").length;

    await searchFor("thistlegorm");
    await waitFor(() =>
      expect(
        screen.getByText(/OpenStreetMap contributors, ODbL/),
      ).toBeInTheDocument(),
    );

    expect(container.querySelectorAll("p").length).toBe(before);
  });
});

// The two ways a place used to be placed without anyone choosing it. Both are
// `CreatableCombobox`'s ordinary single-select behaviour, which is right where
// the input *is* the value and wrong here, where a pick writes the two
// coordinate fields, the Location beside them and - for a catalog row - the Name.
describe("PlaceSearch commits nothing by itself", () => {
  it("places nothing when an exact name is merely typed", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(<PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />);

    // "Dahab" is the name of the row now loaded, so the exact-match path is
    // live - the diver simply has not chosen it.
    await searchFor("Dahab");
    await screen.findByRole("option", { name: /Dahab/ });
    await userEvent.type(screen.getByRole("combobox"), " ");

    expect(onPick).not.toHaveBeenCalled();
  });

  it("places nothing when the field is left with an exact name in it", async () => {
    // What a diver does when they give up on the search and click Save, the map,
    // or simply tab onward. Reproduced in the browser before it was fixed: the
    // site ended up at the typed place's coordinates with no row ever clicked.
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(
      <>
        <PlaceSearch value={null} onTypeName={vi.fn()} onPick={onPick} />
        <button type="button">Create Dive Site</button>
      </>,
    );

    await searchFor("Dahab");
    await screen.findByRole("option", { name: /Dahab/ });
    await userEvent.click(
      screen.getByRole("button", { name: "Create Dive Site" }),
    );

    expect(onPick).not.toHaveBeenCalled();
  });
});

describe("PlaceSearch as the dialog's Location field", () => {
  it("shows the name of the place it holds", () => {
    render(
      <PlaceSearch
        value={{ name: "Dahab, South Sinai, Egypt" }}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox")).toHaveValue(
      "Dahab, South Sinai, Egypt",
    );
  });

  it("opens already searching for the name it was handed", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        value={{ name: "Thistlegorm" }}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        initialQuery="Thistlegorm"
      />,
    );

    expect(
      await screen.findByRole("option", { name: /Thistlegorm/ }),
    ).toBeInTheDocument();
    expect(suggestDiveSites).toHaveBeenCalledWith("Thistlegorm", null);
  });

  it("takes a name nothing matched as typed, on Enter", async () => {
    const onTypeName = vi.fn();
    render(
      <PlaceSearch value={null} onTypeName={onTypeName} onPick={vi.fn()} />,
    );

    await searchFor("Secret Reef");
    await screen.findByText(/Nothing found/);
    await userEvent.keyboard("{Enter}");

    expect(onTypeName).toHaveBeenCalledWith("Secret Reef");
  });

  it("clears the place when the field is cleared", async () => {
    const onTypeName = vi.fn();
    render(
      <PlaceSearch
        value={{ name: "Dahab" }}
        onTypeName={onTypeName}
        onPick={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onTypeName).toHaveBeenCalledWith(null);
  });
});
