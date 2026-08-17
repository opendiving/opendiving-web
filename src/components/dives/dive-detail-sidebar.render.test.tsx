import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveDetailSidebar } from "./dive-detail-sidebar";
import type { LocationsMapProps } from "@/components/map/locations-map";
import type { Dive, DiveSiteSummary } from "@/lib/api/dives";

// The card these cover has to hold four positions that arrive in any
// combination - a site's pin, an entry fix, an exit fix, none of them - and the
// combinations are the whole point: exit-only is the ordinary recording, and a
// dive with fixes but no trip and no site still has somewhere to show them. The
// projection and the fit belong to `locations-map.render.test.tsx`, so the map
// is a stub that records what it was handed.
vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: ({ locations, subject }: LocationsMapProps) => (
    <div
      data-testid="locations-map"
      data-subject={subject}
      data-locations={JSON.stringify(locations)}
    />
  ),
}));

// Dahab: the exit fix from the corpus file this feature was built against, and
// a second pair a short surface swim away from it.
const EXIT = { exit_latitude: 28.4375, exit_longitude: 34.4584 };
const ENTRY = { entry_latitude: 28.4392, entry_longitude: 34.4571 };

// Every required field spelled out rather than `as Dive`: a field added to the
// interface should break this fixture, since the card reads straight off it.
function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    created_at: "2021-04-05T08:00:00+02:00",
    user_uuid: "user",
    notes: "",
    dive_sites: [],
    gear_items: [],
    mixtures: [],
    ...overrides,
  };
}

function site(overrides: Partial<DiveSiteSummary> = {}): DiveSiteSummary {
  return {
    uuid: "site-uuid",
    name: "Blue Hole",
    latitude: 28.5721,
    longitude: 34.5372,
    ...overrides,
  };
}

function renderSidebar(subject: Dive) {
  return render(
    <DiveDetailSidebar
      dive={subject}
      trip={null}
      onSourceFileChanged={vi.fn()}
    />,
  );
}

const mapLocations = (): LocationsMapProps["locations"] =>
  JSON.parse(
    screen.getByTestId("locations-map").getAttribute("data-locations")!,
  );

describe("DiveDetailSidebar locations", () => {
  it("shows an exit-only dive as a complete recording", () => {
    // Every GPS-carrying file in the API's corpus takes its first fix after
    // surfacing, so this - not the pair - is the case the card is built around.
    // An empty "Entry" row beside it would read as a failed reading.
    renderSidebar(dive(EXIT));

    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Exit")).toBeInTheDocument();
    expect(screen.getByText("28.4375, 34.4584")).toBeInTheDocument();
    expect(screen.queryByText("Entry")).not.toBeInTheDocument();
    expect(screen.queryByText(/entry → exit/i)).not.toBeInTheDocument();

    expect(mapLocations()).toEqual([
      { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
    ]);
    expect(
      screen.getByTestId("locations-map").getAttribute("data-subject"),
    ).toBe("the dive's location");
  });

  it("carries the card on GPS alone, with no trip and no site", () => {
    // The widened gate. Before it, a dive imported from a file with fixes but
    // never attached to a site had nowhere to show them at all.
    renderSidebar(dive(EXIT));

    expect(screen.queryByText("Trip")).not.toBeInTheDocument();
    expect(screen.queryByText("Dive Site")).not.toBeInTheDocument();
    expect(screen.getByTestId("locations-map")).toBeInTheDocument();
  });

  it("measures the drift when both fixes were recorded", () => {
    renderSidebar(dive({ ...ENTRY, ...EXIT }));

    expect(screen.getByText("28.4392, 34.4571")).toBeInTheDocument();
    expect(screen.getByText("28.4375, 34.4584")).toBeInTheDocument();
    // Text rather than a drawn line: at the map's zoom-10 cap the two fixes are
    // the same pixel. See `lib/geo-distance.ts`.
    expect(screen.getByText("Entry → exit")).toBeInTheDocument();
    expect(screen.getByText("228 m")).toBeInTheDocument();
  });

  it("shows an entry fix on its own without a distance to nowhere", () => {
    // The mirror of the exit-only case. Nothing in the corpus records this way,
    // but the `drift` expression is the one output that reads asymmetrically -
    // it needs *both* pairs, not either - so it is worth pinning.
    renderSidebar(dive(ENTRY));

    expect(screen.getByText("Entry")).toBeInTheDocument();
    expect(screen.getByText("28.4392, 34.4571")).toBeInTheDocument();
    expect(screen.queryByText("Exit")).not.toBeInTheDocument();
    expect(screen.queryByText(/entry → exit/i)).not.toBeInTheDocument();
  });

  it("tells a recorded fix apart from a placed pin on the map", () => {
    renderSidebar(dive({ dive_sites: [site()], ...EXIT }));

    expect(mapLocations()).toEqual([
      { name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 },
      { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
    ]);
  });

  it("keeps an equator coordinate, which is a position rather than an absence", () => {
    // The zero-versus-absent trap, on the one row where a 0 is real: a dive off
    // West Africa exits at longitude 0.
    renderSidebar(dive({ exit_latitude: 0, exit_longitude: 0 }));

    expect(screen.getByText("Exit")).toBeInTheDocument();
    expect(screen.getByText("0, 0")).toBeInTheDocument();
    expect(mapLocations()).toEqual([
      { name: "Exit", latitude: 0, longitude: 0, variant: "fix" },
    ]);
  });

  it("skips the map for a site with no pin and no fixes", () => {
    // The card still has the site's name to show; the map would draw nothing,
    // and gating here is what keeps its chunk unfetched.
    renderSidebar(
      dive({ dive_sites: [site({ latitude: null, longitude: null })] }),
    );

    expect(screen.getByText("Dive Site")).toBeInTheDocument();
    expect(screen.queryByTestId("locations-map")).not.toBeInTheDocument();
  });

  it("renders no card at all for a dive with nothing to place", () => {
    renderSidebar(dive());

    expect(screen.queryByText("Location")).not.toBeInTheDocument();
    expect(screen.queryByTestId("locations-map")).not.toBeInTheDocument();
  });
});
