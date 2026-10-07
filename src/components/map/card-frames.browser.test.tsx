import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";
import type { ComponentProps, ReactNode } from "react";

import { resolveBasemap } from "@/lib/basemap";
import { bandIn, FIT_PADDING } from "@/lib/map-frame";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { Dive } from "@/lib/api/dives";
import type { DiveSite } from "@/lib/api/dive-sites";
import type { Trip } from "@/lib/api/trips";
import { DiveCard } from "@/components/dives/dive-card";
import { TripCard } from "@/components/trips/trip-card";
import { DiveSiteCard } from "@/components/sites/dive-site-card";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { DiveSiteDetailPageContent } from "@/components/sites/dive-site-detail-page-content";

// **Load-bearing**: every figure below is a measured box, and without the
// app's Tailwind none of them is the size it is in the app - see "jsdom answers
// no layout question, and the browser lane only answers one with the stylesheet
// loaded" in DECISIONS.md.
import "@/app/globals.css";

// A card fits its map for its own frame and floors the zoom to the tiles', so
// what has to hold is the same at every size: wherever a list puts a card -
// at the narrowest viewport the app supports, in a list's one column just below
// `lg` where it is widest, and in two columns above it - every pin's marker
// lies inside the band between the credit and the topmost thing over the
// card's foot, and the tiles cover the frame with no gap. Measured off the
// page, from the credit, the details and a dive's depth outline, rather than
// read off what the card told its map.

const NARROWEST = 320;
const ONE_COLUMN = 1023;
const TWO_COLUMNS = 1280;

const SITE_PIN = { latitude: 28.5721, longitude: 34.5372 };

const dive = (
  sites: { latitude: number; longitude: number }[],
  fixes: Partial<Dive> = {},
): Dive =>
  ({
    uuid: "dive-1",
    dive_number: 128,
    start_time: "2026-04-18T09:30:00+02:00",
    duration: 3120,
    max_depth: 31.4,
    avg_depth: 17.2,
    mixtures: [],
    dive_sites: sites.map((site, index) => ({
      uuid: `site-${index}`,
      name: `Site ${index}`,
      location: { name: "Dahab, South Sinai, Egypt" },
      ...site,
    })),
    // The outline is what leaves a dive card the least room.
    depth_outline: {
      span: 3_120_000,
      values: [0, 800, 1800, 3140, 2600, 1500, 900, 500, 500, 0],
    },
    ...fixes,
  }) as unknown as Dive;

const DIVES: [string, Dive][] = [
  ["a lone site", dive([SITE_PIN])],
  [
    "a site and its entry and exit fixes",
    dive([SITE_PIN], {
      entry_latitude: 28.5702,
      entry_longitude: 34.5391,
      exit_latitude: 28.5689,
      exit_longitude: 34.5355,
    }),
  ],
  [
    "two sites a coast apart",
    dive([SITE_PIN, { latitude: 27.2579, longitude: 33.8116 }]),
  ],
  [
    "chips and no outline, where the chips are the top of the foot",
    dive([SITE_PIN], {
      water_type: "fresh",
      type: "closed_circuit",
      depth_outline: null,
    }),
  ],
];

const trip = (parts: Trip["parts"]): Trip => ({
  uuid: "trip-1",
  name: "Red Sea, spring",
  parts,
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
  dive_count: 12,
  dive_site_count: 7,
  species_count: 48,
  max_depth: 31.4,
  candidate_count: 0,
  contact_uuids: [],
});

const TRIPS: [string, Trip][] = [
  [
    "one place",
    trip([
      {
        start_date: "2026-04-15",
        end_date: "2026-04-22",
        location: { name: "Dahab", latitude: 28.5, longitude: 34.51 },
      },
    ]),
  ],
  [
    "a country-sized part",
    trip([
      {
        location: {
          name: "Egypt",
          latitude: 26.82,
          longitude: 30.8,
          bbox_south: 22,
          bbox_north: 31.67,
          bbox_west: 24.7,
          bbox_east: 36.9,
        },
      },
    ]),
  ],
  [
    "two places across the antimeridian",
    trip([
      { location: { name: "Fiji", latitude: -18.1416, longitude: 178.4419 } },
      { location: { name: "Samoa", latitude: -13.8333, longitude: -171.7667 } },
    ]),
  ],
  ["no place, which is the whole world", trip([])],
];

const SITE: DiveSite = {
  uuid: "site-1",
  name: "The Canyon",
  location: { name: "Dahab, South Sinai, Egypt" },
  ...SITE_PIN,
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
  // The most a site card's line and figures carry, which is its least room.
  depth_from: 5,
  depth_to: 40,
  altitude: 0,
  entry_types: ["shore", "boat"],
  dive_count: 12,
  max_dive_depth: 38.2,
  species_count: 41,
};

const page1 = <T,>(data: T[]) => ({
  data,
  total_count: data.length,
  has_more: false,
  page: 1,
  items_per_page: 10,
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { uuid: "user-1", name: "Ada", units: "metric" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useAuthGuard", () => ({
  useAuthGuard: () => ({
    user: { uuid: "user-1", units: "metric" },
    isAuthenticated: true,
    isLoading: false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    back: () => {},
    prefetch: () => {},
    refresh: () => {},
  }),
  usePathname: () => "/",
  useParams: () => ({ id: "site-1" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout/quick-create", () => ({
  useQuickCreate: () => () => {},
}));
// The dashboard's setup checklist, which asks for two counts of its own.
vi.mock("@/lib/api/gear", async (original) => {
  const actual = await original<typeof import("@/lib/api/gear")>();
  return {
    ...actual,
    gearAPI: { ...actual.gearAPI, getGearItems: async () => page1([]) },
  };
});
vi.mock("@/lib/api/certifications", async (original) => {
  const actual = await original<typeof import("@/lib/api/certifications")>();
  return {
    ...actual,
    certificationsAPI: {
      ...actual.certificationsAPI,
      getCertifications: async () => page1([]),
    },
  };
});
vi.mock("@/lib/api/dives", async (original) => {
  const actual = await original<typeof import("@/lib/api/dives")>();
  return {
    ...actual,
    divesAPI: {
      ...actual.divesAPI,
      getDives: async () => page1([DIVES[1][1]]),
    },
  };
});
vi.mock("@/lib/api/trips", async (original) => {
  const actual = await original<typeof import("@/lib/api/trips")>();
  return {
    ...actual,
    tripsAPI: {
      ...actual.tripsAPI,
      getTrips: async () => page1([TRIPS[0][1]]),
    },
  };
});
vi.mock("@/lib/api/dive-sites", async (original) => {
  const actual = await original<typeof import("@/lib/api/dive-sites")>();
  return {
    ...actual,
    diveSitesAPI: { ...actual.diveSitesAPI, getDiveSite: async () => SITE },
  };
});
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("@/hooks/useInstanceConfig", () => ({
  useInstanceConfig: () => ({ config: { map_tiles: true }, isLoading: false }),
}));
// Every tile there at once: what is under test is where they go.
vi.mock("@/lib/api/map-tiles", async (original) => ({
  ...(await original<typeof import("@/lib/api/map-tiles")>()),
  mapTilesAPI: {
    getMapTile: async () => new Blob([], { type: "image/webp" }),
  },
}));

const withConfig = (children: ReactNode) => (
  <ConfigProvider
    config={{
      // The default credit, the longest the app ships.
      basemap: resolveBasemap(),
    }}
  >
    {children}
  </ConfigProvider>
);

const dives = (record: Dive) =>
  withConfig(
    <DivesPageFrame
      isLoading={false}
      totalCount={1}
      itemsPerPage={10}
      cards={[<DiveCard key={record.uuid} dive={record} />]}
    />,
  );
const trips = (record: Trip) =>
  withConfig(
    <TripsPageFrame
      isLoading={false}
      totalCount={1}
      itemsPerPage={10}
      cards={[
        <TripCard
          key={record.uuid}
          trip={record}
          onEdit={() => {}}
          onDelete={() => {}}
          isDeleting={false}
        />,
      ]}
    />,
  );
const sites = (record: DiveSite) =>
  withConfig(
    <SitesPageFrame
      isLoading={false}
      totalCount={1}
      itemsPerPage={10}
      cards={[
        <DiveSiteCard
          key={record.uuid}
          site={record}
          onEdit={() => {}}
          onDelete={() => {}}
          isDeleting={false}
        />,
      ]}
    />,
  );

const contains = (box: DOMRect, x: number, y: number) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

// Each card's map, once its tiles are on the page: its markers inside its
// band, and its frame under tiles to the last pixel. Returns the frames'
// widths, so a test can say which card it measured.
async function expectComposed(
  count: number,
  { placed = true } = {},
): Promise<number[]> {
  const canvases = await waitFor(() => {
    const found = [
      ...document.querySelectorAll<HTMLElement>("li [data-map-canvas]"),
    ];
    expect(found).toHaveLength(count);
    return found;
  });
  const widths: number[] = [];
  for (const canvas of canvases) {
    const item = canvas.closest("li")!;
    const frameElement = canvas.parentElement!;
    const frame = frameElement.getBoundingClientRect();
    const credit = [...frameElement.children]
      .find((child) => child.textContent?.includes("OpenFreeMap"))!
      .getBoundingClientRect();
    const details = item.lastElementChild!.getBoundingClientRect();
    const outline = item.querySelector(".inset-x-3.h-14");
    const chips = item.querySelector(".absolute.bottom-1.left-0");
    const footTop = Math.min(
      details.top,
      outline?.getBoundingClientRect().top ?? Infinity,
      chips?.getBoundingClientRect().top ?? Infinity,
    );
    const band = bandIn(
      frame.height,
      credit.bottom - frame.top,
      frame.bottom - footTop,
    );

    const markers = [...canvas.querySelectorAll("[data-marker]")];
    expect(markers.length > 0).toBe(placed);
    for (const marker of markers) {
      const box = marker.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      expect(x).toBeGreaterThanOrEqual(frame.left + FIT_PADDING - 1);
      expect(x).toBeLessThanOrEqual(frame.right - FIT_PADDING + 1);
      expect(y).toBeGreaterThanOrEqual(frame.top + band.top - 1);
      expect(y).toBeLessThanOrEqual(frame.bottom - band.bottom + 1);
    }

    const tiles = [
      ...canvas.querySelectorAll<HTMLElement>("img[data-map-tile]"),
    ].map((tile) => tile.getBoundingClientRect());
    for (let x = frame.left + 0.5; x < frame.right; x += 6) {
      for (let y = frame.top + 0.5; y < frame.bottom; y += 6) {
        expect(tiles.some((tile) => contains(tile, x, y))).toBe(true);
      }
    }
    widths.push(frame.width);
  }
  return widths;
}

beforeEach(async () => {
  // Tall, so every card is near enough the screen to draw its backdrop.
  await page.viewport(NARROWEST, 3000);
});

describe("a card's map", () => {
  describe.each([
    ["at the narrowest viewport", NARROWEST],
    ["in a list's one column just below `lg`", ONE_COLUMN],
    ["in two columns above it", TWO_COLUMNS],
  ])("%s", (_where, width) => {
    beforeEach(async () => {
      await page.viewport(width, 3000);
    });

    it.each(DIVES)(
      "keeps a dive card's pins in its band, over tiles, for %s",
      async (_label, record) => {
        render(dives(record));
        await expectComposed(1);
      },
    );

    it.each(TRIPS)(
      "keeps a trip card's pins in its band, over tiles, for %s",
      async (_label, record) => {
        render(trips(record));
        await expectComposed(1, { placed: record.parts.length > 0 });
      },
    );

    it("keeps a site card's pin in its band, over tiles", async () => {
      render(sites(SITE));
      await expectComposed(1);
    });
  });

  it("holds on the dashboard's recent dive and trip, the smallest cards", async () => {
    render(
      withConfig(
        <DashboardPageFrame
          stats={
            { total_dives: 0 } as ComponentProps<
              typeof DashboardPageFrame
            >["stats"]
          }
        />,
      ),
    );
    await screen.findByText("Red Sea, spring");
    const widths = await expectComposed(2);
    // Narrower than a list's own cards: a list inside a card.
    for (const width of widths) expect(width).toBeLessThan(NARROWEST - 48);
  });

  it("holds in a detail page's recent dives", async () => {
    render(withConfig(<DiveSiteDetailPageContent />));
    await screen.findByText("Dives at This Site");
    await expectComposed(1);
  });

  it.each([
    ["at the narrowest viewport", NARROWEST],
    ["in two columns", TWO_COLUMNS],
  ])(
    "keeps a dive card as tall with chips as without, %s",
    async (_where, width) => {
      await page.viewport(width, 3000);
      const height = (record: Dive) => {
        const { container, unmount } = render(dives(record));
        const value = container.querySelector("li")!.offsetHeight;
        unmount();
        return value;
      };
      const plain = DIVES[0][1];

      expect(
        height({
          ...plain,
          water_type: "fresh",
          type: "closed_circuit",
        } as Dive),
      ).toBe(height(plain));
    },
  );

  // The widest a card gets, and a frame wider than a tile: the case where a
  // card spans three tiles across.
  it("spans a card just below `lg` nearly as wide as the column", async () => {
    await page.viewport(ONE_COLUMN, 3000);
    render(trips(TRIPS[0][1]));
    const [width] = await expectComposed(1);
    expect(width).toBeGreaterThan(900);
  });
});
