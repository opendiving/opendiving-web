import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveHero } from "./dive-hero";
import type { Dive } from "@/lib/api/dives";
import type { UnitSystem } from "@/lib/units";

// The dive page's heading: its title and line, the three numbers that describe
// the shape of the dive, and what its map is handed - the map itself is covered
// where it lives. The duration's arithmetic is `formatDurationHoursMinutes`'s,
// tested in `lib/date-time.test.ts`; what a render adds is which figures stand.

const auth = vi.hoisted(() => ({ units: "metric" as UnitSystem }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { uuid: "user-1", units: auth.units } }),
}));

vi.mock("@/components/map/locations-map-lazy", () => ({
  LocationsMap: vi.fn(() => null),
}));
const { LocationsMap } = await import("@/components/map/locations-map-lazy");

beforeEach(() => {
  vi.mocked(LocationsMap).mockClear();
});
afterEach(() => {
  auth.units = "metric";
});

function dive(overrides: Partial<Dive> = {}): Dive {
  return {
    uuid: "test",
    dive_number: 1,
    start_time: "2021-04-04T10:04:47+02:00",
    duration: 2700,
    dive_sites: [],
    mixtures: [],
    ...overrides,
  } as Dive;
}

// Dahab: an exit fix from the corpus, and a site's pin.
const EXIT = { exit_latitude: 28.4375, exit_longitude: 34.4584 };
const SITE = {
  uuid: "site-uuid",
  name: "Blue Hole",
  latitude: 28.5721,
  longitude: 34.5372,
} as Dive["dive_sites"][number];

const figure = (label: string) =>
  screen.queryByText(label, { selector: "dt" })?.nextElementSibling;

describe("DiveHero", () => {
  it("heads the page with the dive's title, its start and place, and its figures", () => {
    render(
      <DiveHero
        dive={dive({
          dive_number: 212,
          dive_sites: [
            {
              uuid: "site-1",
              name: "The Canyon",
              location: { name: "Dahab, Egypt" },
            },
          ] as Dive["dive_sites"],
          max_depth: 30.52,
          avg_depth: 18.2,
        })}
      />,
    );

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("#212 The Canyon");
    // Its card's line, in the dive's own timezone.
    expect(heading.nextElementSibling).toHaveTextContent(
      "Apr 4, 2021, 10:04 · Dahab, Egypt",
    );
    expect(figure("Duration")).toHaveTextContent("45min");
    expect(figure("Max depth")).toHaveTextContent("30.52 m");
    expect(figure("Avg depth")).toHaveTextContent("18.2 m");
    expect(screen.getByRole("link", { name: "Back to dives" })).toHaveAttribute(
      "href",
      "/dives",
    );
  });

  it("shows the depths in feet for an imperial diver", () => {
    // Whole feet, and the value behind them is still the 30.48 m the API sent.
    auth.units = "imperial";
    render(<DiveHero dive={dive({ max_depth: 30.48, avg_depth: 18.2 })} />);

    expect(figure("Max depth")).toHaveTextContent("100 ft");
    expect(figure("Avg depth")).toHaveTextContent("60 ft");
  });

  it("leaves the duration on its own for a dive with no depths", () => {
    // Every hand-logged dive that skipped them. An empty depth beside the
    // duration would read as something the diver failed to fill in.
    render(<DiveHero dive={dive()} />);

    expect(figure("Duration")).toHaveTextContent("45min");
    expect(figure("Max depth")).toBeUndefined();
    expect(figure("Avg depth")).toBeUndefined();
  });

  it("shows a recorded maximum without inventing an average", () => {
    render(<DiveHero dive={dive({ max_depth: 30.52 })} />);

    expect(figure("Max depth")).toHaveTextContent("30.52 m");
    expect(figure("Avg depth")).toBeUndefined();
  });

  it("shows the water's temperature and the visibility after the depths", () => {
    render(
      <DiveHero
        dive={dive({
          max_depth: 30.52,
          avg_depth: 18.2,
          bottom_temperature: 0,
          visibility: 15,
        })}
      />,
    );

    // 0 °C is a reading, not an absence.
    expect(figure("Water temp")).toHaveTextContent("0°C");
    expect(figure("Visibility")).toHaveTextContent("15 m");
    expect(
      Array.from(document.querySelectorAll("dt"), (dt) => dt.textContent),
    ).toEqual([
      "Duration",
      "Max depth",
      "Avg depth",
      "Water temp",
      "Visibility",
    ]);
  });

  it("reads the water's temperature and the visibility in the diver's units", () => {
    auth.units = "imperial";
    render(
      <DiveHero dive={dive({ bottom_temperature: 22, visibility: 15 })} />,
    );

    expect(figure("Water temp")).toHaveTextContent("°F");
    expect(figure("Visibility")).toHaveTextContent("ft");
  });

  it("leaves off a temperature and a visibility the dive does not record", () => {
    render(<DiveHero dive={dive()} />);

    expect(figure("Water temp")).toBeUndefined();
    expect(figure("Visibility")).toBeUndefined();
  });

  it("keeps a zero-metre average, which is a reading rather than an absence", () => {
    // `!= null`, not truthiness - the guard that has bitten `gas_number` and
    // the mixture pressures in this repo.
    render(<DiveHero dive={dive({ max_depth: 30.52, avg_depth: 0 })} />);

    expect(figure("Avg depth")).toHaveTextContent("0 m");
  });

  it("hands its map the dive's places, as the card's backdrop, and credits it itself", () => {
    render(<DiveHero dive={dive(EXIT)} />);

    expect(vi.mocked(LocationsMap).mock.lastCall![0]).toMatchObject({
      locations: [
        { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
      ],
      subject: "the location of dive #1",
      backdrop: true,
      snapshot: true,
      sideFade: true,
      creditElsewhere: true,
    });
    expect(
      screen.getByRole("link", { name: /OpenStreetMap/ }),
    ).toBeInTheDocument();
  });

  it("tells a recorded fix apart from a placed pin on the map", () => {
    render(<DiveHero dive={dive({ dive_sites: [SITE], ...EXIT })} />);

    expect(vi.mocked(LocationsMap).mock.lastCall![0].locations).toEqual([
      { name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 },
      { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
    ]);
  });

  it("keeps an equator fix, which is a position rather than an absence", () => {
    // A dive off West Africa exits at longitude 0.
    render(<DiveHero dive={dive({ exit_latitude: 0, exit_longitude: 0 })} />);

    expect(vi.mocked(LocationsMap).mock.lastCall![0].locations).toEqual([
      { name: "Exit", latitude: 0, longitude: 0, variant: "fix" },
    ]);
  });

  it("draws the map's water for a dive with no position, and credits no map", () => {
    // A site without a pin is no position either.
    render(
      <DiveHero
        dive={dive({
          dive_sites: [{ ...SITE, latitude: null, longitude: null }],
        })}
      />,
    );

    expect(LocationsMap).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /OpenStreetMap/ })).toBeNull();
  });
});
