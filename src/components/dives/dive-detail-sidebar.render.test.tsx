import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveDetailSidebar } from "./dive-detail-sidebar";
import type { LocationsMapProps } from "@/components/map/locations-map";
import type { Dive, DiveSiteSummary } from "@/lib/api/dives";
import type { Course } from "@/lib/api/courses";
import type { UnitSystem } from "@/lib/units";

// These renders read the diver's units, so they need an auth context. Held in a
// mutable box rather than a fixed literal so a test can switch systems - `vi.mock`'s
// factory is hoisted above the file, and `vi.hoisted` is what lets it close over
// something the tests can still reach.
const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

afterEach(() => {
  auth.units = "metric";
});

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

function renderSidebar(subject: Dive, course: Course | null = null) {
  return render(
    <DiveDetailSidebar
      dive={subject}
      trip={null}
      course={course}
      onSourceFileChanged={vi.fn()}
    />,
  );
}

function course(overrides: Partial<Course> = {}): Course {
  return {
    uuid: "course-uuid",
    name: "Advanced Nitrox + Decompression Procedures",
    agency: "tdi",
    status: "completed",
    user_uuid: "user-uuid",
    created_at: "2026-03-08T09:00:00Z",
    ...overrides,
  };
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

  it("measures the drift in feet for an imperial diver", () => {
    auth.units = "imperial";
    renderSidebar(dive({ ...ENTRY, ...EXIT }));

    expect(screen.getByText("747 ft")).toBeInTheDocument();
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

// The Environment card has the same shape of gate as the Location one above: it
// renders when *any* of its four rows has something to say, and each row is on
// its own `!= null` guard.
describe("DiveDetailSidebar environment", () => {
  it("names the water type rather than showing the wire value", () => {
    renderSidebar(dive({ water_type: "en13319" }));

    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.getByText("Water Type")).toBeInTheDocument();
    expect(screen.getByText("EN13319")).toBeInTheDocument();
  });

  it("shows the altitude in meters", () => {
    renderSidebar(dive({ altitude: 372 }));

    expect(screen.getByText("Altitude")).toBeInTheDocument();
    expect(screen.getByText("372 m")).toBeInTheDocument();
  });

  // Sea level is a recorded answer. A truthiness guard would hide exactly the
  // dives where "this was at sea level" is the interesting half of the pair.
  it("shows an altitude of zero, which is a reading and not an absence", () => {
    renderSidebar(dive({ altitude: 0 }));

    expect(screen.getByText("0 m")).toBeInTheDocument();
  });

  it("carries the card on the new rows alone", () => {
    // No temperature and no visibility: before these two fields the card would
    // not have rendered at all, so the gate is what makes them reachable.
    renderSidebar(dive({ water_type: "salt" }));

    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
  });

  it("hides both rows on a dive that records neither", () => {
    renderSidebar(dive({ bottom_temperature: 22.5 }));

    expect(screen.getByText("Environment")).toBeInTheDocument();
    expect(screen.queryByText("Water Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Altitude")).not.toBeInTheDocument();
  });

  it("renders no Environment card for a dive that records none of it", () => {
    renderSidebar(dive());

    expect(screen.queryByText("Environment")).not.toBeInTheDocument();
  });
});

describe("DiveDetailSidebar training", () => {
  it("links the course, outside the Location card", () => {
    // A course is not a place. The Location card renders on the strength of the
    // dive having one, and this dive has none - so a course row folded into it
    // would be invisible on exactly the training dives it is for.
    renderSidebar(dive(), course());

    const link = screen.getByRole("link", {
      name: "Advanced Nitrox + Decompression Procedures",
    });
    expect(link).toHaveAttribute("href", "/courses/course-uuid");
    expect(screen.getByText("Training")).toBeInTheDocument();
    expect(screen.queryByText("Location")).not.toBeInTheDocument();
  });

  it("shows nothing at all for a dive with no course", () => {
    // The sidebar without a course looks exactly as it did before courses
    // existed - no empty card, no placeholder row.
    renderSidebar(dive());

    expect(screen.queryByText("Training")).not.toBeInTheDocument();
    expect(screen.queryByText("Course")).not.toBeInTheDocument();
  });
});
