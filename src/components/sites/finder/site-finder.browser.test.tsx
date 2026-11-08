import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { page } from "vitest/browser";

import { resolveBasemap } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";

// The geometry is the stylesheet's, so it is loaded - see "jsdom answers no
// layout question, and the browser lane only answers one with the stylesheet
// loaded" in DECISIONS.md.
import "@/app/globals.css";

// Where the map and the list sit, which no jsdom test can see: side by side
// from the width the header shows its whole navigation, the map above the list
// below it. The map itself is a stand-in; its frame is the finder's.

vi.mock("./site-finder-map-lazy", () => ({
  SiteFinderMap: () => <div data-testid="map" />,
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: "metric" } }),
}));
vi.mock("@/lib/api/dive-sites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dive-sites")>();
  const row = (name: string) => ({
    kind: "site" as const,
    uuid: name,
    name,
    owner: "account" as const,
    saved: true,
    attribution: null,
    distance_m: 1200,
    match: null,
    dives: null,
    proposal: null,
  });
  return {
    ...actual,
    diveSitesAPI: {
      ...actual.diveSitesAPI,
      searchDiveSites: async () => ({
        rows: Array.from({ length: 20 }, (_, i) => row(`Site ${i}`)),
        has_more: false,
        total_count: null,
        page: 1,
        items_per_page: 20,
      }),
      getDiveSitePoints: async () => [],
      getCommonsDiveSitePoints: async () => ({
        etag: null,
        body: { version: "v1", sources: {}, points: [] },
      }),
    },
  };
});

const { NO_FINDER_FILTERS, SiteFinder } = await import("./site-finder");

const renderFinder = () =>
  render(
    <ConfigProvider
      config={{ basemap: resolveBasemap({ attribution: "Test" }) }}
    >
      <SiteFinder
        enabled
        opening={null}
        filters={NO_FINDER_FILTERS}
        onFiltersChange={() => {}}
        siteHref={(uuid) => `/sites/${uuid}`}
      />
    </ConfigProvider>,
  );

const boxes = async () => {
  await screen.findByText("Site 19");
  const map = document
    .querySelector("[data-finder-map]")!
    .getBoundingClientRect();
  const list = screen
    .getByRole("region", { name: "Dive sites and places" })
    .getBoundingClientRect();
  return { map, list };
};

beforeEach(() => {
  window.scrollTo(0, 0);
});

describe("SiteFinder's layout", () => {
  it("puts the map and the list side by side, both on screen, from `lg`", async () => {
    await page.viewport(1280, 800);
    renderFinder();
    const { map, list } = await boxes();

    expect(map.width).toBeGreaterThan(400);
    expect(map.height).toBeGreaterThan(400);
    expect(map.right).toBeLessThanOrEqual(list.left);
    expect(map.top).toBeLessThan(window.innerHeight);
    expect(list.top).toBeLessThan(window.innerHeight);
    expect(map.bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it("puts the map above the list at a phone's width", async () => {
    await page.viewport(375, 800);
    renderFinder();
    const { map, list } = await boxes();

    expect(map.height).toBeGreaterThan(200);
    expect(map.bottom).toBeLessThanOrEqual(list.top);
    expect(map.width).toBeCloseTo(list.width, 0);
    expect(map.right).toBeLessThanOrEqual(375);
  });
});
