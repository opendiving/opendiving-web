import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceSearch } from "./place-search";
import type { GeocodeResult } from "@/lib/api/geocoding";
import type { DiveSiteLookupItem } from "@/lib/api/dive-sites";
import type { UnitSystem } from "@/lib/units";

// The real constants - the debounce and the query bounds the field hands the
// combobox - with only the transport replaced.
vi.mock("@/lib/api/geocoding", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/geocoding")>()),
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/lib/api/dive-sites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/dive-sites")>()),
  diveSitesAPI: { searchCommonsSites: vi.fn() },
}));

const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const searchPlaces = vi.mocked(geocodingAPI.searchPlaces);
const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const searchCommonsSites = vi.mocked(diveSitesAPI.searchCommonsSites);

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

const THISTLEGORM: DiveSiteLookupItem = {
  uuid: "commons-thistlegorm",
  name: "SS Thistlegorm",
  latitude: 27.814092,
  longitude: 33.920048,
  location: { name: "South Sinai, Egypt" },
  external_ids: [{ registry: "openstreetmap", identifier: "node/255316037" }],
  owner: "opendivingcommons",
  saved: false,
  attribution: OSM_CREDIT,
};

const suggest = (data: DiveSiteLookupItem[], has_more = false) =>
  searchCommonsSites.mockResolvedValue({ data, has_more });

beforeEach(() => {
  searchPlaces.mockClear();
  searchPlaces.mockResolvedValue([]);
  searchCommonsSites.mockClear();
  suggest([]);
});

afterEach(() => {
  auth.units = "metric";
});

// Typing, then waiting out the 450 ms this field deliberately types more slowly
// with than the rest of the app. Waits on the lookup rather than the geocoder
// because it is the half every test here has an opinion about.
const searchFor = async (query: string) => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.paste(query);
  await waitFor(
    () => expect(searchCommonsSites).toHaveBeenCalledWith(query, null),
    { timeout: 2000 },
  );
};

describe("PlaceSearch results", () => {
  it("lists Commons sites above geocoded places", async () => {
    // The whole of the ordering decision: the primitive preserves what the
    // caller returns, so a named dive site beats a town by being listed first.
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={onPick}
      />,
    );

    await searchFor("thistlegorm");
    await userEvent.click(
      await screen.findByRole("option", { name: /SS Thistlegorm/ }),
    );

    expect(onPick).toHaveBeenCalledWith({
      kind: "commons",
      site: THISTLEGORM,
    });
  });

  it("hands a picked place back tagged as one, whole", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={onPick}
      />,
    );

    await searchFor("Dahab");
    await userEvent.click(await screen.findByRole("option", { name: /Dahab/ }));

    expect(onPick).toHaveBeenCalledWith({ kind: "geocode", result: DAHAB });
  });

  it("keeps the two sources' row ids apart", async () => {
    // A Commons row and a geocoded row for the same place must not collide in
    // the map that turns an id back into a pick - the second one in would
    // otherwise answer for the first.
    const sameSpot: DiveSiteLookupItem = {
      ...THISTLEGORM,
      name: "Dahab",
      latitude: DAHAB.latitude,
      longitude: DAHAB.longitude,
    };
    suggest([sameSpot]);
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={onPick}
      />,
    );

    await searchFor("Dahab");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getAllByRole("option")[1]);

    expect(onPick).toHaveBeenCalledWith({ kind: "geocode", result: DAHAB });
  });

  it("says the list was cut when the lookup held matches back", async () => {
    // Without the pass-through this footer can never render: `hasMore` is the
    // primitive's, and the lookup's answer is the only thing that knows.
    suggest([THISTLEGORM], true);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Dahab");
    await screen.findByRole("option", { name: /Dahab/ });

    expect(screen.queryByText(/keep typing to narrow/)).not.toBeInTheDocument();
  });

  it("collapses a place the geocoder returned twice", async () => {
    // Rows are keyed by content, and two menu rows sharing a React key is both
    // a warning and a row that can't be picked.
    searchPlaces.mockResolvedValue([DAHAB, DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Dahab");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("names a place, then its region, then its country", async () => {
    // Read as one line, the row says what picking it saves: the API's
    // `location`, which the Location field takes unchanged.
    searchPlaces.mockResolvedValue([DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Dahab");

    const row = await screen.findByRole("option", { name: address.location });
    expect(row.textContent).toBe(address.location);
  });
});

// One source down is a shorter menu, not an error. The combobox reads any throw
// from `onSearch` as total failure - it empties the list and shows
// `searchErrorLabel` - so awaiting the two together would let the geocoder's
// per-user rate limit delete Commons rows that arrived perfectly well, and let a
// lookup failure regress the geocoder's box.
describe("PlaceSearch with one source down", () => {
  it("still shows Commons rows when the geocoder throws", async () => {
    suggest([THISTLEGORM]);
    searchPlaces.mockRejectedValue(new Error("429 Too Many Requests"));
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: /SS Thistlegorm/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't reach the search/),
    ).not.toBeInTheDocument();
  });

  it("still shows geocoded rows when the lookup throws", async () => {
    searchCommonsSites.mockRejectedValue(new Error("500"));
    searchPlaces.mockResolvedValue([DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", { name: /Dahab/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Couldn't reach the search/),
    ).not.toBeInTheDocument();
  });

  it("reports the failure only when neither source could answer", async () => {
    searchCommonsSites.mockRejectedValue(new Error("500"));
    searchPlaces.mockRejectedValue(new Error("429"));
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Atlantis");

    expect(
      await screen.findByText(
        "Nothing found - press Enter to use it as typed, or place the site on the map.",
      ),
    ).toBeInTheDocument();
  });
});

describe("PlaceSearch hints", () => {
  it("carries the record's locality", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: /^SS Thistlegorm, South Sinai, Egypt/,
      }),
    ).toBeInTheDocument();
  });

  it("marks a Commons row, and only a Commons row", async () => {
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    expect(
      await screen.findByRole("option", { name: /SS Thistlegorm.*Commons$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Dahab/ })).not.toHaveTextContent(
      "Commons",
    );
  });

  it("says nothing rather than inventing a difference it hasn't got", async () => {
    // The seven `Diving Spot` records sit within about four kilometres of each
    // other in one bay. Nothing in the record separates them, and neither can a
    // diver - so they are shown as what they are.
    suggest([{ ...THISTLEGORM, location: null }]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    const row = await screen.findByRole("option");
    expect(row).not.toHaveTextContent(",");
  });

  it("shows the other name the diver typed", async () => {
    // Otherwise a search for "Sunabe" returns a row reading 砂辺 and nothing on
    // screen explains why it matched.
    suggest([
      {
        ...THISTLEGORM,
        name: "砂辺",
        other_names: ["Seawall", "Sunabe"],
        location: { name: "Okinawa, Japan" },
      },
    ]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Sunabe");

    expect(
      await screen.findByRole("option", {
        name: /^砂辺, Sunabe · Okinawa, Japan/,
      }),
    ).toBeInTheDocument();
  });

  it("shows the record's first other name when the name itself matched", async () => {
    suggest([{ ...THISTLEGORM, other_names: ["Thistlegorm wreck", "Ras"] }]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("SS Th");

    expect(
      await screen.findByRole("option", {
        name: /^SS Thistlegorm, Thistlegorm wreck · South Sinai, Egypt/,
      }),
    ).toBeInTheDocument();
  });
});

// A site being edited stays what it is, so no Commons record is offered for it.
describe("PlaceSearch without Commons sites", () => {
  it("asks the geocoder alone, and lists places alone", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    render(
      <PlaceSearch
        listCommonsSites={false}
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.paste("Dahab");

    expect(
      await screen.findByRole("option", { name: /Dahab/ }, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(searchCommonsSites).not.toHaveBeenCalled();
  });
});

// A geocoder row reads as one comma-separated line - the combobox joins a name
// and its hint with ", " - and never says the same part twice.
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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

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
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("moalboal");

    expect(
      await screen.findByRole("option", { name: "Moalboal" }),
    ).toBeInTheDocument();
  });

  describe("that repeat a Commons row", () => {
    const MONAD_SHOAL: DiveSiteLookupItem = {
      ...THISTLEGORM,
      name: "Monad Shoal",
      latitude: 11.3,
      longitude: 124.19,
      location: { name: "Cebu, Philippines" },
      external_ids: [
        { registry: "openstreetmap", identifier: "node/6215139685" },
      ],
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
      // The Commons row names the dive site, which is the better answer.
      suggest([MONAD_SHOAL]);
      searchPlaces.mockResolvedValue([MONAD_SHOAL_PLACE]);
      const onPick = vi.fn();
      render(
        <PlaceSearch
          listCommonsSites
          value={null}
          onTypeName={vi.fn()}
          onPick={onPick}
        />,
      );

      await searchFor("monad shoal");
      await waitFor(() => expect(searchPlaces).toHaveResolved());

      await waitFor(() =>
        expect(screen.getAllByRole("option")).toHaveLength(1),
      );
      await userEvent.click(screen.getByRole("option"));
      // The one row left is the Commons one, and the credit is still there.
      expect(onPick).toHaveBeenCalledWith({
        kind: "commons",
        site: MONAD_SHOAL,
      });
      expect(
        screen.getAllByRole("link", {
          name: "Data © OpenStreetMap contributors, ODbL 1.0.",
        })[0],
      ).toBeInTheDocument();
    });

    it("keeps both where the entry is another registry's", async () => {
      // A record whose id happens to spell the same in a different registry is
      // not the same object.
      suggest([
        {
          ...MONAD_SHOAL,
          external_ids: [
            { registry: "wikidata", identifier: "node/6215139685" },
          ],
          attribution: WIKIDATA_CREDIT,
        },
      ]);
      searchPlaces.mockResolvedValue([MONAD_SHOAL_PLACE]);
      render(
        <PlaceSearch
          listCommonsSites
          value={null}
          onTypeName={vi.fn()}
          onPick={vi.fn()}
        />,
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
        <PlaceSearch
          listCommonsSites
          value={null}
          onTypeName={vi.fn()}
          onPick={vi.fn()}
        />,
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
      () => expect(searchCommonsSites).toHaveBeenCalledWith(query, NEARBY),
      { timeout: 2000 },
    );
  };

  it("sends it with the search, so a same-name cluster comes back nearest first", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        listCommonsSites
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
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        position={NEARBY}
      />,
    );

    await searchWithPosition("thistlegorm");

    expect(
      await screen.findByRole("option", {
        name: /^SS Thistlegorm, South Sinai, Egypt · 1\.6 km/,
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
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        position={NEARBY}
      />,
    );

    await searchWithPosition("thistlegorm");

    expect(
      await screen.findByRole("option", { name: /· 5\d{3} ft/ }),
    ).toBeInTheDocument();
  });
});

describe("PlaceSearch credits", () => {
  // The line under the field sits behind the open menu, so a row's credit has to
  // be in the menu with it, and that line is what outlasts the menu.
  it("credits a Commons row in the open menu and under the field", async () => {
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    const name = "Data © OpenStreetMap contributors, ODbL 1.0.";
    expect(
      await within(await screen.findByRole("listbox")).findByRole("link", {
        name,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name })).toHaveLength(2);
  });

  it("renders the credit's licence link rather than its markdown", async () => {
    // The API folds the licence URL into the credit as a markdown link. Printed
    // rather than rendered, a diver reads "[Data © OpenStreetMap contributors,
    // ODbL 1.0.](https://osm.org/copyright)" under the field.
    suggest([THISTLEGORM]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    const link = await within(await screen.findByRole("listbox")).findByRole(
      "link",
      {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      },
    );
    expect(link).toHaveAttribute("href", "https://osm.org/copyright");
    expect(screen.queryByText(/\[Data ©/)).not.toBeInTheDocument();
  });

  it("shows one OpenStreetMap credit for two sources that share the string", async () => {
    // An OpenStreetMap record's credit is byte-identical to the geocoder's, which
    // is what makes the accumulator's collapse-by-string enough - there is no
    // deduplication of our own here and there should not be.
    suggest([THISTLEGORM]);
    searchPlaces.mockResolvedValue([{ ...DAHAB, attribution: OSM_CREDIT }]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("Dahab");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    expect(
      within(screen.getByRole("listbox")).getAllByRole("link", {
        name: "Data © OpenStreetMap contributors, ODbL 1.0.",
      }),
    ).toHaveLength(1);
  });

  it("credits a Wikidata row on its own terms", async () => {
    // The regional patch is CC0 rather than ODbL, so reusing OSM's string for it
    // would be a false statement about both.
    suggest([{ ...THISTLEGORM, attribution: WIKIDATA_CREDIT }]);
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );

    await searchFor("thistlegorm");

    expect(
      await within(await screen.findByRole("listbox")).findByRole("link", {
        name: "Data from Wikidata, CC0 1.0.",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the credit's line reserved before any search has run", async () => {
    // A credit that materialises with the first result grows the field and
    // shoves the map under it down the dialog mid-edit. Counted as elements
    // rather than measured, since jsdom lays nothing out: what must not happen
    // is a paragraph arriving.
    suggest([THISTLEGORM]);
    const { container } = render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
      />,
    );
    const before = container.querySelectorAll("p").length;

    await searchFor("thistlegorm");
    await waitFor(() =>
      expect(
        screen.getAllByText(/OpenStreetMap contributors, ODbL/)[0],
      ).toBeInTheDocument(),
    );

    expect(container.querySelectorAll("p").length).toBe(before);
  });
});

// Two ways a place would be placed without anyone choosing it. Both are
// `CreatableCombobox`'s ordinary single-select behaviour, which is right where
// the input *is* the value and wrong here, where a pick writes the two
// coordinate fields and the Location beside them.
describe("PlaceSearch commits nothing by itself", () => {
  it("places nothing when an exact name is merely typed", async () => {
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={vi.fn()}
        onPick={onPick}
      />,
    );

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
        <PlaceSearch
          listCommonsSites
          value={null}
          onTypeName={vi.fn()}
          onPick={onPick}
        />
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
        listCommonsSites
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
        listCommonsSites
        value={{ name: "Thistlegorm" }}
        onTypeName={vi.fn()}
        onPick={vi.fn()}
        initialQuery="Thistlegorm"
      />,
    );

    expect(
      await screen.findByRole("option", { name: /Thistlegorm/ }),
    ).toBeInTheDocument();
    expect(searchCommonsSites).toHaveBeenCalledWith("Thistlegorm", null);
  });

  it("takes a name nothing matched as typed, on Enter", async () => {
    const onTypeName = vi.fn();
    render(
      <PlaceSearch
        listCommonsSites
        value={null}
        onTypeName={onTypeName}
        onPick={vi.fn()}
      />,
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
        listCommonsSites
        value={{ name: "Dahab" }}
        onTypeName={onTypeName}
        onPick={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onTypeName).toHaveBeenCalledWith(null);
  });
});
