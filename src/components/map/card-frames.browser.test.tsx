import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { page } from "vitest/browser";
import type { ComponentProps, ReactNode } from "react";

import { resolveBasemap } from "@/lib/basemap";
import {
  bandIn,
  DIVE_CARD_FRAME,
  SNAPSHOT_HEIGHT,
  SNAPSHOT_WIDTH,
  TRIP_CARD_FRAME,
  type CardFrame,
} from "@/lib/map-picture";
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
import type { CardMapPicture as RealCardMapPicture } from "./card-map-picture";

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
// The band is measured as the card's picture measures it: the frame, the
// credit over its top edge - the default one, which is what the constants are
// measured with - and the foot the card says it covers, passed through
// `bandIn`. The picture is the real component, shown a picture that never
// reached the network. A site card is drawn as a one-site dive, so it is held
// to a dive card's frame.

const NARROWEST = 320;

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
  map_picture: "digest-dive",
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
  map_picture: "digest-trip",
};

const SITE: DiveSite = {
  uuid: "site-1",
  name: "The Canyon",
  location: { name: "Dahab, South Sinai, Egypt" },
  latitude: 28.5721,
  longitude: 34.5372,
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
  map_picture: "digest-site",
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
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
vi.mock("@/lib/api/map-pictures", async (original) => {
  const actual = await original<typeof import("@/lib/api/map-pictures")>();
  return {
    ...actual,
    mapPicturesAPI: {
      getMapPicture: async () => new Blob([], { type: "image/webp" }),
    },
  };
});
// The real picture, under a box-less element that says what foot the card told
// it it covers.
vi.mock("./card-map-picture", async (original) => {
  const { CardMapPicture } =
    await original<typeof import("./card-map-picture")>();
  return {
    CardMapPicture: (props: ComponentProps<typeof RealCardMapPicture>) => (
      <div
        style={{ display: "contents" }}
        data-covered-bottom={props.coveredBottom}
      >
        <CardMapPicture {...props} />
      </div>
    ),
  };
});

const withConfig = (children: ReactNode) => (
  <ConfigProvider
    config={{
      // The default credit, which is what the constants are measured with.
      basemap: resolveBasemap(),
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
async function measureCards(): Promise<Measured[]> {
  const probes = await waitFor(() => {
    const found = [
      ...document.querySelectorAll<HTMLElement>("li [data-covered-bottom]"),
    ];
    expect(found.length).toBeGreaterThan(0);
    // The credit, which the band starts under.
    for (const probe of found) {
      expect(probe.textContent).toContain("OpenFreeMap");
    }
    return found;
  });
  return probes.map((probe) => {
    const frame = probe.firstElementChild as HTMLElement;
    const credit = [...frame.children].find((child) =>
      child.textContent?.includes("OpenFreeMap"),
    ) as HTMLElement;
    const band = bandIn(
      frame.clientHeight,
      credit.offsetTop + credit.offsetHeight,
      Number(probe.dataset.coveredBottom),
    );
    return {
      width: frame.clientWidth,
      height: frame.clientHeight,
      bandHeight: frame.clientHeight - band.top - band.bottom,
    };
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

  it("holds for a site card on /sites", async () => {
    render(
      withConfig(
        <SitesPageFrame
          isLoading={false}
          totalCount={1}
          itemsPerPage={10}
          cards={[
            <DiveSiteCard
              key={SITE.uuid}
              site={SITE}
              onEdit={() => {}}
              onDelete={() => {}}
              isDeleting={false}
            />,
          ]}
        />,
      ),
    );
    expectRoomFor(await measureCards(), DIVE_CARD_FRAME);
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

// Where each card's picture lands, measured off the page rather than read off
// what the card told it: its middle on the middle of the band between the
// credit and the topmost thing over the card's foot - the details, or a dive's
// depth outline above them - and the whole frame covered.
async function expectPicturesPlaced(count: number) {
  const pictures = await waitFor(() => {
    const found = [
      ...document.querySelectorAll<HTMLImageElement>(
        "li img[data-card-map-picture]",
      ),
    ];
    expect(found).toHaveLength(count);
    return found;
  });
  const widths: number[] = [];
  for (const picture of pictures) {
    const item = picture.closest("li")!;
    const frameElement = picture.closest("[data-covered-bottom]")!
      .firstElementChild as HTMLElement;
    const frame = frameElement.getBoundingClientRect();
    const credit = [...frameElement.children]
      .find((child) => child.textContent?.includes("OpenFreeMap"))!
      .getBoundingClientRect();
    const details = item.lastElementChild!.getBoundingClientRect();
    const outline = item.querySelector(".inset-x-3.h-14");
    const footTop = Math.min(
      details.top,
      outline?.getBoundingClientRect().top ?? Infinity,
    );
    const band = bandIn(
      frame.height,
      credit.bottom - frame.top,
      frame.bottom - footTop,
    );
    const shown = picture.getBoundingClientRect();

    expect([shown.width, shown.height]).toEqual([
      SNAPSHOT_WIDTH,
      SNAPSHOT_HEIGHT,
    ]);
    expect(shown.left + shown.width / 2).toBeCloseTo(
      frame.left + frame.width / 2,
      0,
    );
    expect(shown.top + shown.height / 2).toBeCloseTo(
      frame.top + (band.top + frame.height - band.bottom) / 2,
      0,
    );
    expect(shown.left).toBeLessThanOrEqual(frame.left);
    expect(shown.right).toBeGreaterThanOrEqual(frame.right);
    expect(shown.top).toBeLessThanOrEqual(frame.top);
    expect(shown.bottom).toBeGreaterThanOrEqual(frame.bottom);
    widths.push(frame.width);
  }
  return widths;
}

describe("where a card's picture lands", () => {
  it("on the smallest cards, the dashboard's at the narrowest viewport", async () => {
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

    const widths = await expectPicturesPlaced(2);
    expect(widths).toEqual([DIVE_CARD_FRAME.width, TRIP_CARD_FRAME.width]);
  });

  // A list's one column just below `lg`, where the next pixel makes it two.
  it.each([
    [
      "a dive card on /dives",
      <DivesPageFrame
        key="dives"
        isLoading={false}
        totalCount={1}
        itemsPerPage={10}
        cards={[<DiveCard key={DIVE.uuid} dive={DIVE} />]}
      />,
    ],
    [
      "a trip card on /trips",
      <TripsPageFrame
        key="trips"
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
    ],
    [
      "a site card on /sites",
      <SitesPageFrame
        key="sites"
        isLoading={false}
        totalCount={1}
        itemsPerPage={10}
        cards={[
          <DiveSiteCard
            key={SITE.uuid}
            site={SITE}
            onEdit={() => {}}
            onDelete={() => {}}
            isDeleting={false}
          />,
        ]}
      />,
    ],
  ])("on the widest, %s", async (_label, list) => {
    await page.viewport(1023, 3000);
    render(withConfig(list));

    const [width] = await expectPicturesPlaced(1);
    // Nearly the picture's own width: one column, not half of two.
    expect(width).toBeGreaterThan(SNAPSHOT_WIDTH - 100);
  });
});
