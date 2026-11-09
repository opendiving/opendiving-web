import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { DiveSiteSearchItem } from "@/lib/api/dive-sites";
import type { FinderTarget } from "@/lib/site-finder-camera";

// The dialog against the real finder and a stand-in map: what each request
// carries, and that a row in a form's picker only ever adds.

vi.mock("./site-finder-map-lazy", () => ({
  SiteFinderMap: () => <div data-testid="map" />,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ basemap: { attribution: "© OpenStreetMap" } }),
}));
vi.mock("@/hooks/useTags", () => ({ useTags: () => ({ tags: [] }) }));
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
const { SiteFinderDialog } = await import("./site-finder-dialog");

const site = (name: string): DiveSiteSearchItem => ({
  kind: "site",
  uuid: name.toLowerCase(),
  name,
  owner: "account",
  saved: true,
  attribution: null,
  latitude: 28.5,
  longitude: 34.5,
  distance_m: null,
  match: null,
  dives: {
    dive_count: 3,
    last_dived_on: "2026-01-01",
    max_dive_depth: 30,
    species_count: 0,
    average_rating: null,
  },
  proposal: null,
});

beforeEach(() => {
  search.mockReset();
  search.mockResolvedValue({
    rows: [site("Canyon"), site("Lighthouse")],
    has_more: false,
    total_count: 2,
    page: 1,
    items_per_page: 20,
  });
});

const onPick = vi.fn();
const renderDialog = (opening: FinderTarget | null) =>
  render(
    <SiteFinderDialog
      open
      onOpenChange={() => {}}
      opening={opening}
      until="2026-03-04T09:00:00"
      chosen={["lighthouse"]}
      onPick={onPick}
      onCreated={() => {}}
    />,
  );

const lastQuery = () => search.mock.calls[search.mock.calls.length - 1]?.[2];

describe("SiteFinderDialog", () => {
  it("on the world, lists the diver's sites by last use at the dive's date", async () => {
    renderDialog(null);

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(lastQuery()).toMatchObject({
      camera: null,
      until: "2026-03-04T09:00:00",
    });
    expect(lastQuery()?.view).toBeFalsy();
  });

  it("asks first with the camera it opened on", async () => {
    renderDialog({ kind: "point", latitude: 28.5712, longitude: 34.5438 });

    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    // Rounded by the client on its way out, as every camera is.
    expect(lastQuery()?.camera).toEqual({
      latitude: 28.5712,
      longitude: 34.5438,
    });
  });

  it("offers no row menu under Your sites, drops the dive's sites, and adds a pick", async () => {
    renderDialog(null);
    const dialog = await screen.findByRole("dialog", {
      name: "Find a dive site",
    });

    await userEvent.click(within(dialog).getByRole("switch"));
    await waitFor(() => expect(lastQuery()).toMatchObject({ my: true }));
    await within(dialog).findByRole("button", { name: "Canyon" });

    expect(
      within(dialog).queryByRole("button", { name: /Actions for/ }),
    ).toBeNull();
    expect(within(dialog).queryByText("Lighthouse")).toBeNull();
    // Your sites keeps the tag filter and the sort.
    expect(
      within(dialog).getByRole("button", {
        name: /Filter and sort your dive sites/,
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Canyon" }),
    );
    expect(onPick).toHaveBeenCalledWith(
      "canyon",
      expect.objectContaining({ name: "Canyon" }),
    );
  });
});
