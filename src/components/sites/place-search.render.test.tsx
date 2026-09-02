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
  location: "Dahab, Egypt",
  display_name: "Dahab, South Sinai, 45214, Egypt",
  name: "Dahab",
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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={onPick} />);

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
    render(<PlaceSearch onPick={onPick} />);

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
    render(<PlaceSearch onPick={onPick} />);

    await searchFor("Dahab");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getAllByRole("option")[1]);

    expect(onPick).toHaveBeenCalledWith({ kind: "geocode", result: DAHAB });
  });

  it("says the list was cut when the catalog held matches back", async () => {
    // Without the pass-through this footer can never render: `hasMore` is the
    // primitive's, and the catalog response is the only thing that knows.
    suggest([THISTLEGORM], true);
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");
    await screen.findByRole("option", { name: /Dahab/ });

    expect(screen.queryByText(/keep typing to narrow/)).not.toBeInTheDocument();
  });

  it("collapses a place the geocoder returned twice", async () => {
    // Nominatim occasionally does. Two menu rows sharing a React key is both a
    // warning and a row that can't be picked.
    searchPlaces.mockResolvedValue([DAHAB, DAHAB]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("names a place the short way, and only once", async () => {
    // Two things at once, because one row shows both. The label the row carries
    // is the API's composed "Dahab, Egypt" rather than the provider's "Dahab,
    // South Sinai, 45214, Egypt" - which is also what picking the row writes
    // into the Location field. And that label opens with the name the row is
    // already showing, so a row printing both would read "Dahab, Dahab, Egypt".
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", { name: "Dahab, Egypt" }),
    ).toBeInTheDocument();
  });

  it("names an address-only result by its composed location", async () => {
    // A result that matched an address rather than a named place has no name of
    // its own, and a row has to say something.
    searchPlaces.mockResolvedValue([
      { ...DAHAB, name: null, location: "Dahab, Egypt" },
    ]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", { name: /^Dahab, Egypt/ }),
    ).toBeInTheDocument();
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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByText(
        "Couldn't reach the search - place the site on the map instead.",
      ),
    ).toBeInTheDocument();
  });

  it("points a diver at the map when neither source has an answer", async () => {
    // All three empty menus end the same way, because the map below is the
    // answer to every one of them - including the geocoder's throttled proxy,
    // which the API also reports as an empty list.
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Atlantis");

    expect(
      await screen.findByText(
        "Nothing found - place the site on the map instead.",
      ),
    ).toBeInTheDocument();
  });
});

describe("PlaceSearch hints", () => {
  it("carries the finest place context the record has", async () => {
    suggest([THISTLEGORM]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: "SS Thistlegorm, South Sinai, Egypt",
      }),
    ).toBeInTheDocument();
  });

  it("falls back to the country where the record has no region", async () => {
    suggest([{ ...THISTLEGORM, region: null }]);
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Sunabe");

    expect(
      await screen.findByRole("option", { name: "砂辺, Sunabe · Egypt" }),
    ).toBeInTheDocument();
  });

  it("does not repeat a name the row already shows", async () => {
    suggest([{ ...THISTLEGORM, name_en: "SS Thistlegorm", region: null }]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: "SS Thistlegorm, Egypt" }),
    ).toBeInTheDocument();
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
    render(<PlaceSearch onPick={vi.fn()} position={NEARBY} />);

    await searchWithPosition("thistlegorm");
  });

  it("puts the distance on each row", async () => {
    suggest([THISTLEGORM]);
    render(<PlaceSearch onPick={vi.fn()} position={NEARBY} />);

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
    render(<PlaceSearch onPick={vi.fn()} position={NEARBY} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    render(<PlaceSearch onPick={vi.fn()} />);

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
    const { container } = render(<PlaceSearch onPick={vi.fn()} />);
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
    render(<PlaceSearch onPick={onPick} />);

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
        <PlaceSearch onPick={onPick} />
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
