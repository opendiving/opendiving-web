import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceSearch } from "./place-search";
import type { GeocodeResult } from "@/lib/api/geocoding";

vi.mock("@/lib/api/geocoding", () => ({
  geocodingAPI: { searchPlaces: vi.fn().mockResolvedValue([]) },
  // The real values, since the field hands them to the combobox as the bounds
  // outside which "no places found" would be a claim about a search that never
  // ran.
  MIN_PLACE_QUERY_LENGTH: 2,
  MAX_PLACE_QUERY_LENGTH: 200,
}));

const { geocodingAPI } = await import("@/lib/api/geocoding");
const searchPlaces = vi.mocked(geocodingAPI.searchPlaces);

const DAHAB: GeocodeResult = {
  latitude: 28.4954,
  longitude: 34.5197,
  location: "Dahab, Egypt",
  display_name: "Dahab, South Sinai, 45214, Egypt",
  name: "Dahab",
  attribution: "Data © OpenStreetMap contributors, ODbL 1.0.",
};

beforeEach(() => {
  searchPlaces.mockClear();
  searchPlaces.mockResolvedValue([]);
});

// Typing, then waiting out the 450 ms this field deliberately types more slowly
// with than the rest of the app.
const searchFor = async (query: string) => {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.paste(query);
  await waitFor(() => expect(searchPlaces).toHaveBeenCalledWith(query), {
    timeout: 2000,
  });
};

describe("PlaceSearch", () => {
  it("hands the picked place back whole", async () => {
    // Whole, not just its position: the caller needs the name as well, and the
    // short composed `location` is the one that belongs on a dive site.
    searchPlaces.mockResolvedValue([DAHAB]);
    const onPick = vi.fn();
    render(<PlaceSearch onPick={onPick} />);

    await searchFor("Dahab");
    await userEvent.click(await screen.findByRole("option", { name: /Dahab/ }));

    expect(onPick).toHaveBeenCalledWith(DAHAB);
  });

  it("does not name a place twice in one row", async () => {
    // The geocoder's label opens with the name it matched, so a row printing
    // both reads "Dahab, Dahab, South Sinai, 45214, Egypt".
    searchPlaces.mockResolvedValue([DAHAB]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    expect(
      await screen.findByRole("option", {
        name: "Dahab, South Sinai, 45214, Egypt",
      }),
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

  it("collapses a place the provider returned twice", async () => {
    // Nominatim occasionally does. Two menu rows sharing a React key is both a
    // warning and a row that can't be picked.
    searchPlaces.mockResolvedValue([DAHAB, DAHAB]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
  });

  it("renders the credit's licence link rather than its markdown", async () => {
    // The API folds the licence URL into the credit as a markdown link. Printed
    // rather than rendered, a diver reads "[Data © OpenStreetMap contributors,
    // ODbL 1.0.](https://osm.org/copyright)" under the field.
    searchPlaces.mockResolvedValue([
      {
        ...DAHAB,
        attribution:
          "[Data © OpenStreetMap contributors, ODbL 1.0.](https://osm.org/copyright)",
      },
    ]);
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Dahab");

    const link = await screen.findByRole("link", {
      name: "Data © OpenStreetMap contributors, ODbL 1.0.",
    });
    expect(link).toHaveAttribute("href", "https://osm.org/copyright");
    expect(screen.queryByText(/\[Data ©/)).not.toBeInTheDocument();
  });

  it("keeps the credit's line reserved before any search has run", async () => {
    // A credit that materialises with the first result grows the field and
    // shoves the map under it down the dialog mid-edit. Counted as elements
    // rather than measured, since jsdom lays nothing out: what must not happen
    // is a paragraph arriving.
    searchPlaces.mockResolvedValue([DAHAB]);
    const { container } = render(<PlaceSearch onPick={vi.fn()} />);
    const before = container.querySelectorAll("p").length;

    await searchFor("Dahab");
    await waitFor(() =>
      expect(
        screen.getByText(/OpenStreetMap contributors, ODbL/),
      ).toBeInTheDocument(),
    );

    expect(container.querySelectorAll("p").length).toBe(before);
  });

  // The two ways a place used to be placed without anyone choosing it. Both are
  // `CreatableCombobox`'s ordinary single-select behaviour, which is right where
  // the input *is* the value and wrong here, where a pick writes the two
  // coordinate fields and the Location beside them.
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

  it("points a diver at the map when the search has no answer", async () => {
    // All three empty menus end the same way, because the map below is the
    // answer to every one of them - including the throttled proxy, which the API
    // also reports as an empty list.
    render(<PlaceSearch onPick={vi.fn()} />);

    await searchFor("Atlantis");

    expect(
      await screen.findByText(
        "No places found - place the site on the map instead.",
      ),
    ).toBeInTheDocument();
  });
});
