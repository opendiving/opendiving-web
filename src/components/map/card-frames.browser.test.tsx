import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";
import type { ComponentProps, ReactNode } from "react";

import { DEFAULT_BASEMAP_ATTRIBUTION, resolveBasemap } from "@/lib/basemap";
import {
  bandIn,
  DIVE_CARD_FRAME,
  TRIP_CARD_FRAME,
  type CardFrame,
} from "@/lib/map-picture";
import { ConfigProvider } from "@/contexts/ConfigContext";
import type { Dive } from "@/lib/api/dives";
import type { DiveSite } from "@/lib/api/dive-sites";
import type { Trip } from "@/lib/api/trips";
import { DiveCard } from "@/components/dives/dive-card";
import { TripCard } from "@/components/trips/trip-card";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import { TripsPageFrame } from "@/components/trips/trips-page-frame";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { DiveSiteDetailPageContent } from "@/components/sites/dive-site-detail-page-content";
import type { LocationsMap as RealLocationsMap } from "./locations-map";

// **Load-bearing**: every figure below is a measured box, and without the
// app's Tailwind none of them is the size it is in the app - see "jsdom answers
// no layout question, and the browser lane only answers one with the stylesheet
// loaded" in DECISIONS.md.
import "@/app/globals.css";

// The map renderer draws one picture per record and theme, fitted for a frame
// and band of its own (`DIVE_CARD_FRAME`, `TRIP_CARD_FRAME`), and every card
// shows that picture with its middle on its own band's middle. So no card may
// be narrower, or have a shorter band, than the frame the picture was fitted
// for - or its outermost pins are cropped, silently. This renders each card
// where every list puts it, at the narrowest viewport the app supports, and
// measures it.
//
// The band is measured as the card's map measures it: the frame, the credit
// over its top edge - the default one, which is what the constants are
// measured with - and the foot the card says it covers, passed through
// `bandIn`. The map is the real one, drawing an empty style so nothing reaches
// the network.

const NARROWEST = 320;

const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

const DIVE: Dive = {
  uuid: "dive-1",
  dive_number: 128,
  start_time: "2026-04-18T09:30:00+02:00",
  duration: 3120,
  max_depth: 31.4,
  avg_depth: 17.2,
  mixtures: [],
  dive_sites: [
    {
      uuid: "site-1",
      name: "The Canyon",
      location: { name: "Dahab, South Sinai, Egypt" },
      latitude: 28.5721,
      longitude: 34.5372,
    },
  ],
  exit_latitude: 28.5689,
  exit_longitude: 34.5355,
  // The outline is what leaves a dive card the least room.
  depth_outline: {
    span: 3_120_000,
    values: [0, 800, 1800, 3140, 2600, 1500, 900, 500, 500, 0],
  },
} as unknown as Dive;

const TRIP: Trip = {
  uuid: "trip-1",
  name: "Red Sea, spring",
  parts: [
    {
      start_date: "2026-04-15",
      end_date: "2026-04-22",
      location: {
        name: "Dahab, South Sinai, Egypt",
        latitude: 28.5,
        longitude: 34.51,
      },
    },
  ],
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
  dive_count: 12,
  dive_site_count: 7,
  species_count: 48,
  max_depth: 31.4,
};

const SITE: DiveSite = {
  uuid: "site-1",
  name: "The Canyon",
  location: { name: "Dahab, South Sinai, Egypt" },
  latitude: 28.5721,
  longitude: 34.5372,
  user_uuid: "user-1",
  created_at: "2026-04-01T00:00:00Z",
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
    divesAPI: { ...actual.divesAPI, getDives: async () => page1([DIVE]) },
  };
});
vi.mock("@/lib/api/trips", async (original) => {
  const actual = await original<typeof import("@/lib/api/trips")>();
  return {
    ...actual,
    tripsAPI: { ...actual.tripsAPI, getTrips: async () => page1([TRIP]) },
  };
});
vi.mock("@/lib/api/dive-sites", async (original) => {
  const actual = await original<typeof import("@/lib/api/dive-sites")>();
  return {
    ...actual,
    diveSitesAPI: { ...actual.diveSitesAPI, getDiveSite: async () => SITE },
  };
});
// The real map, eagerly rather than through `next/dynamic`, under a box-less
// element that says what foot the card told it it covers.
vi.mock("@/components/map/locations-map-lazy", async () => {
  const { LocationsMap } = await import("./locations-map");
  return {
    LocationsMap: (props: ComponentProps<typeof RealLocationsMap>) => (
      <div
        style={{ display: "contents" }}
        data-covered-bottom={props.coveredBottom ?? 0}
      >
        <LocationsMap {...props} />
      </div>
    ),
  };
});

const withConfig = (children: ReactNode) => (
  <ConfigProvider
    config={{
      basemap: resolveBasemap({
        styleUrl: EMPTY_STYLE,
        attribution: DEFAULT_BASEMAP_ATTRIBUTION,
      }),
    }}
  >
    {children}
  </ConfigProvider>
);

interface Measured {
  width: number;
  height: number;
  bandHeight: number;
}

// Each card's map frame and its band, as the map itself works them out.
function measureNow(): Measured[] {
  const probes = [
    ...document.querySelectorAll<HTMLElement>("li [data-covered-bottom]"),
  ];
  expect(probes.length).toBeGreaterThan(0);
  return probes.map((probe) => {
    const frame = probe.firstElementChild as HTMLElement;
    // The credit, which the band starts under.
    const credit = [...frame.children].find((child) =>
      child.textContent?.includes("OpenFreeMap"),
    ) as HTMLElement | undefined;
    expect(credit).toBeDefined();
    const band = bandIn(
      frame.clientHeight,
      credit!.offsetTop + credit!.offsetHeight,
      Number(probe.dataset.coveredBottom),
    );
    return {
      width: frame.clientWidth,
      height: frame.clientHeight,
      bandHeight: frame.clientHeight - band.top - band.bottom,
    };
  });
}

const frames = (count: number) =>
  new Promise<void>((done) => {
    const next = (left: number) =>
      left === 0 ? done() : requestAnimationFrame(() => next(left - 1));
    next(count);
  });

// Once the cards have settled: a card hears of its details' height from a
// `ResizeObserver` and passes it down on its next render, so a reading taken
// in between pairs a new frame with an old foot. Read until two readings a few
// frames apart agree.
function measureCards(): Promise<Measured[]> {
  return waitFor(async () => {
    const before = measureNow();
    await frames(3);
    const after = measureNow();
    expect(after).toEqual(before);
    return after;
  });
}

const bandHeight = (frame: CardFrame) =>
  frame.height - frame.band.top - frame.band.bottom;

function expectRoomFor(measured: Measured[], frame: CardFrame) {
  for (const card of measured) {
    expect(card.width).toBeGreaterThanOrEqual(frame.width);
    expect(card.bandHeight).toBeGreaterThanOrEqual(bandHeight(frame));
    // Taller here than in the app, whose web fonts this lane does not load -
    // which is why the constants' height is the app's and only held as a floor.
    expect(card.height).toBeGreaterThanOrEqual(frame.height);
  }
}

beforeEach(async () => {
  // Tall, so every card is near enough the screen to draw its backdrop.
  await page.viewport(NARROWEST, 3000);
});

describe("the smallest frame a card gives its map", () => {
  it("holds for a dive card on /dives", async () => {
    render(
      withConfig(
        <DivesPageFrame
          isLoading={false}
          totalCount={1}
          itemsPerPage={10}
          cards={[<DiveCard key={DIVE.uuid} dive={DIVE} />]}
        />,
      ),
    );
    expectRoomFor(await measureCards(), DIVE_CARD_FRAME);
  });

  it("holds for a trip card on /trips", async () => {
    render(
      withConfig(
        <TripsPageFrame
          isLoading={false}
          totalCount={1}
          itemsPerPage={10}
          cards={[
            <TripCard
              key={TRIP.uuid}
              trip={TRIP}
              onEdit={() => {}}
              onDelete={() => {}}
              isDeleting={false}
            />,
          ]}
        />,
      ),
    );
    expectRoomFor(await measureCards(), TRIP_CARD_FRAME);
  });

  it("holds for the dashboard's recent dive and trip", async () => {
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
    const [dive, trip] = await measureCards();
    expectRoomFor([dive], DIVE_CARD_FRAME);
    expectRoomFor([trip], TRIP_CARD_FRAME);
  });

  it("holds for a detail page's recent dives", async () => {
    render(withConfig(<DiveSiteDetailPageContent />));
    await screen.findByText("Dives at This Site");
    expectRoomFor(await measureCards(), DIVE_CARD_FRAME);
  });

  // The constants are the smallest of these, not merely smaller: a picture
  // fitted for a frame narrower than any card shows less than it could.
  it("is the narrowest card's, to the pixel", async () => {
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
    const [dive, trip] = await measureCards();
    expect([dive.width, dive.bandHeight]).toEqual([
      DIVE_CARD_FRAME.width,
      bandHeight(DIVE_CARD_FRAME),
    ]);
    expect([trip.width, trip.bandHeight]).toEqual([
      TRIP_CARD_FRAME.width,
      bandHeight(TRIP_CARD_FRAME),
    ]);
  });
});
