import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type {
  DiveSiteSearchItem,
  DiveSiteSearchPage,
  PlaceSearchItem,
} from "@/lib/api/dive-sites";
import type { FinderTarget } from "@/lib/site-finder-camera";
import type { SiteFinderMapProps } from "./site-finder-map";

// The finder against a map that is a stand-in: the props it is handed are what
// the finder asks of the map, and calling its callbacks is a diver moving it.
// What is asserted is what each request carries, which is what the server and
// its logs see.

const map = vi.hoisted(() => ({ props: null as SiteFinderMapProps | null }));
vi.mock("./site-finder-map-lazy", () => ({
  SiteFinderMap: (props: SiteFinderMapProps) => {
    map.props = props;
    return <div data-testid="map" />;
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({
    basemap: {
      attribution: "[© OpenStreetMap](https://www.openstreetmap.org/copyright)",
    },
  }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dive-sites")>();
  return {
    ...actual,
    diveSitesAPI: {
      ...actual.diveSitesAPI,
      searchDiveSites: vi.fn(),
      getDiveSitePoints: vi.fn(async () => []),
      getCommonsDiveSitePoints: vi.fn(async () => ({
        etag: null,
        body: { version: "v1", sources: {}, points: [] },
      })),
    },
  };
});

const { diveSitesAPI } = await import("@/lib/api/dive-sites");
const search = vi.mocked(diveSitesAPI.searchDiveSites);
const { NO_FINDER_FILTERS, SiteFinder } = await import("./site-finder");

const CREDIT =
  "[OpenStreetMap contributors](https://www.openstreetmap.org/copyright)";
const site = (
  name: string,
  extra: Partial<DiveSiteSearchItem> = {},
): DiveSiteSearchItem => ({
  kind: "site",
  uuid: name.toLowerCase().replace(/\W+/g, "-"),
  name,
  owner: "account",
  saved: true,
  attribution: null,
  latitude: 28.5,
  longitude: 34.5,
  distance_m: 4000,
  match: null,
  dives: {
    dive_count: 3,
    last_dived_on: "2026-01-01",
    max_dive_depth: 30,
    species_count: 0,
    average_rating: null,
  },
  proposal: null,
  ...extra,
});
const DAHAB: PlaceSearchItem = {
  kind: "place",
  latitude: 28.49,
  longitude: 34.51,
  location: "Dahab, South Sinai, Egypt",
  name: "Dahab",
  source: "osm",
  source_id: "node/1",
  attribution: CREDIT,
  bbox_south: 28.4,
  bbox_north: 28.6,
  bbox_west: 34.4,
  bbox_east: 34.6,
  distance_m: 432_000,
  sites_nearby: 15,
};

const answer = (
  rows: DiveSiteSearchPage["rows"],
  extra: Partial<DiveSiteSearchPage> = {},
) =>
  search.mockResolvedValue({
    rows,
    has_more: false,
    total_count: null,
    page: 1,
    items_per_page: 20,
    ...extra,
  });

const lastQuery = () => search.mock.calls[search.mock.calls.length - 1]?.[2];

// `opening` is required: a defaulted prop could not be passed as `undefined`,
// the finder's "not known yet".
function Finder({ opening }: { opening: FinderTarget | null | undefined }) {
  const [filters, setFilters] = useState(NO_FINDER_FILTERS);
  return (
    <SiteFinder
      enabled
      opening={opening}
      filters={filters}
      onFiltersChange={setFilters}
      siteHref={(uuid) => `/sites/${uuid}`}
      siteMenu={(row) => <button type="button">Actions for {row.name}</button>}
      onAddSite={addSite}
    />
  );
}

const moveMap = (
  center: { latitude: number; longitude: number },
  bounds: { south: number; north: number; west: number; east: number },
  byDiver = true,
) => act(() => map.props!.onViewChange({ center, bounds }, byDiver));

let getCurrentPosition: ReturnType<typeof vi.fn>;
const addSite = vi.fn();

beforeEach(() => {
  search.mockReset();
  answer([site("The Canyon"), site("Lighthouse")]);
  toast.mockReset();
  addSite.mockReset();
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });
});

afterEach(() => {
  map.props = null;
});

describe("SiteFinder", () => {
  it("asks nothing until it knows where it opens, then asks with that camera", async () => {
    const { rerender } = render(<Finder opening={undefined} />);
    expect(search).not.toHaveBeenCalled();
    expect(map.props?.target).toBeNull();

    rerender(
      <Finder
        opening={{ kind: "point", latitude: 28.49372, longitude: 34.51687 }}
      />,
    );

    await screen.findByRole("link", { name: "The Canyon" });
    expect(search).toHaveBeenCalledTimes(1);
    expect(lastQuery()).toMatchObject({
      camera: { latitude: 28.49372, longitude: 34.51687 },
      view: null,
    });
    expect(map.props?.target?.target).toEqual({
      kind: "point",
      latitude: 28.49372,
      longitude: 34.51687,
    });
  });

  it("opens on the world with no camera and no box, listing what comes in order", async () => {
    render(<Finder opening={null} />);

    await screen.findByRole("link", { name: "The Canyon" });
    expect(lastQuery()?.camera).toBeNull();
    expect(lastQuery()?.view).toBeNull();
    expect(
      screen
        .getAllByRole("listitem")
        .map((row) => within(row).getByRole("link").textContent),
    ).toEqual(["The Canyon", "Lighthouse"]);
    expect(screen.getByRole("link", { name: "The Canyon" })).toHaveAttribute(
      "href",
      "/sites/the-canyon",
    );
  });

  it("asks nothing as the diver pans, and asks once for the area when told", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    expect(
      screen.queryByRole("button", { name: "Search this area" }),
    ).toBeNull();

    moveMap(
      { latitude: -17.7, longitude: 179.5 },
      { south: -19, north: -16, west: 176.5, east: 182.3 },
    );
    moveMap(
      { latitude: -17.7, longitude: 179.6 },
      { south: -19, north: -16, west: 176.6, east: 182.4 },
    );
    expect(search).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Search this area" }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(lastQuery()).toMatchObject({
      camera: { latitude: -17.7, longitude: 179.6 },
      view: { south: -19, north: -16, west: 176.6, east: 182.4 },
    });
    expect(
      screen.queryByRole("button", { name: "Search this area" }),
    ).toBeNull();
  });

  it("does not take a move of its own for the diver's", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });

    moveMap(
      { latitude: 1, longitude: 2 },
      { south: 0, north: 2, west: 1, east: 3 },
      false,
    );

    expect(
      screen.queryByRole("button", { name: "Search this area" }),
    ).toBeNull();
  });

  it("asks once for a term typed, from where the map is", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    moveMap(
      { latitude: 28.5, longitude: 34.5 },
      { south: 28, north: 29, west: 34, east: 35 },
    );

    await userEvent.type(
      screen.getByRole("searchbox", {
        name: "Search dive sites and places by name",
      }),
      "canyon",
    );

    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(lastQuery()).toMatchObject({
      search: "canyon",
      camera: { latitude: 28.5, longitude: 34.5 },
      view: null,
    });
  });

  it("moves to a picked place, clears the search and lists what is nearest it", async () => {
    answer([site("Canyon"), DAHAB]);
    render(<Finder opening={null} />);

    await userEvent.click(await screen.findByRole("button", { name: "Dahab" }));

    expect(screen.getByText("15 sites nearby")).toBeInTheDocument();
    expect(map.props?.target?.target).toEqual({
      kind: "bounds",
      south: 28.4,
      north: 28.6,
      west: 34.4,
      east: 34.6,
    });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(lastQuery()?.search).toBe("");
    expect(lastQuery()?.camera?.latitude).toBeCloseTo(28.5);
    expect(lastQuery()?.view).toBeNull();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("says a place has no sites near it", async () => {
    answer([{ ...DAHAB, sites_nearby: 0 }]);
    render(<Finder opening={null} />);

    expect(await screen.findByText("No sites nearby")).toBeInTheDocument();
  });

  it("shows a Commons row's badge and credit, and no menu off Your sites", async () => {
    answer([
      site("The Canyon", {
        owner: "opendivingcommons",
        saved: false,
        attribution: CREDIT,
        dives: null,
      }),
    ]);
    render(<Finder opening={null} />);

    const row = (
      await screen.findByRole("link", { name: "The Canyon" })
    ).closest("li")!;
    expect(within(row).getByText("Commons")).toBeInTheDocument();
    expect(
      within(row).getByRole("link", { name: "OpenStreetMap contributors" }),
    ).toBeInTheDocument();
    expect(within(row).getByText("4.0 km away")).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: /Actions for/ }),
    ).toBeNull();
  });

  it("is the diver's whole list under Your sites, with its count, filters and menus", async () => {
    answer([site("The Canyon")], { total_count: 1 });
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    moveMap(
      { latitude: 1, longitude: 2 },
      { south: 0, north: 2, west: 1, east: 3 },
    );
    expect(
      screen.getByRole("button", { name: "Search this area" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Your sites" }));

    await waitFor(() => expect(lastQuery()?.yours).toBe(true));
    expect(lastQuery()?.view).toBeNull();
    expect(lastQuery()?.sort).toBe("last_dived_on");
    expect(await screen.findByText("1 total dive site")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Actions for The Canyon" }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 dives · deepest 30 m")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Search this area" }),
    ).toBeNull();
    expect(map.props?.yoursOnly).toBe(true);
    expect(
      screen.getByRole("button", { name: "Filter and sort your dive sites" }),
    ).toBeInTheDocument();
  });

  it("asks the browser where the diver is on the tap alone, and moves the camera there", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    expect(getCurrentPosition).not.toHaveBeenCalled();

    getCurrentPosition.mockImplementation((success: PositionCallback) =>
      success({
        coords: { latitude: 28.511, longitude: 34.522 },
      } as GeolocationPosition),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use my location" }),
    );

    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(map.props?.target?.target).toEqual({
      kind: "point",
      latitude: 28.511,
      longitude: 34.522,
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Search this area" }),
    ).toBeInTheDocument();
  });

  it("says once that the browser refused, and leaves the camera where it was", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    getCurrentPosition.mockImplementation(
      (_: PositionCallback, failure: PositionErrorCallback) =>
        failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Use my location" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Use my location" }),
    );

    expect(toast).toHaveBeenCalledOnce();
    expect(toast.mock.calls[0][0].title).toBe("Location is blocked");
    expect(map.props?.target).toBeNull();
  });

  it("shows a touched point with its badge and credit, and marks its row", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });

    act(() =>
      map.props!.onPointPick({
        uuid: "the-canyon",
        name: "The Canyon",
        latitude: 28.5,
        longitude: 34.5,
        owner: "opendivingcommons",
        credit: CREDIT,
      }),
    );

    const card = screen.getByText("On the map").parentElement!;
    expect(
      within(card).getByRole("link", { name: "The Canyon" }),
    ).toHaveAttribute("href", "/sites/the-canyon");
    expect(within(card).getByText("Commons")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "OpenStreetMap contributors" }),
    ).toBeInTheDocument();
    expect(map.props?.highlight).toMatchObject({
      latitude: 28.5,
      longitude: 34.5,
    });
    expect(
      screen
        .getAllByRole("listitem")
        .find((row) => row.getAttribute("aria-current")),
    ).toHaveTextContent("The Canyon");
  });

  it("keeps the map's credit on screen", async () => {
    render(<Finder opening={null} />);
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap" }),
    ).toBeInTheDocument();
  });

  it("adds a site with no pin while the map rests on the world, and at its centre once moved", async () => {
    render(<Finder opening={null} />);
    await screen.findByRole("link", { name: "The Canyon" });
    moveMap(
      { latitude: 20, longitude: 0 },
      { south: -60, north: 80, west: -180, east: 180 },
      false,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /Add a (dive )?site/ }),
    );
    expect(addSite).toHaveBeenLastCalledWith(null);

    moveMap(
      { latitude: 28.4937123, longitude: 34.5168789 },
      { south: 28, north: 29, west: 34, east: 35 },
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Add a (dive )?site/ }),
    );
    expect(addSite).toHaveBeenLastCalledWith({
      latitude: 28.49371,
      longitude: 34.51688,
    });
  });

  it("searches for what was typed before it knew where it opens", async () => {
    const { rerender } = render(<Finder opening={undefined} />);
    await userEvent.type(screen.getByRole("searchbox"), "canyon");
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(search).not.toHaveBeenCalled();

    rerender(<Finder opening={null} />);

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(lastQuery()?.search).toBe("canyon");
  });
});
