import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiveHero } from "./dive-hero";
import { DiveIcon } from "@/components/logo";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
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

const tiles = vi.hoisted(() => ({ drawn: true as boolean | undefined }));
vi.mock("@/components/map/map-backdrop", () => ({
  MapBackdrop: vi.fn(() => null),
  useMapTiles: () => tiles.drawn,
}));
const { MapBackdrop } = await import("@/components/map/map-backdrop");
const mapProps = () => vi.mocked(MapBackdrop).mock.lastCall![0];

beforeEach(() => {
  vi.mocked(MapBackdrop).mockClear();
});
afterEach(() => {
  auth.units = "metric";
  tiles.drawn = true;
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

const BACK = { href: "/dives", label: "Back to dives" };

const figure = (label: string) =>
  screen.queryByText(label, { selector: "dt" })?.nextElementSibling;

describe("DiveHero", () => {
  it("heads the page with the dive's title, its start and place, and its figures", () => {
    render(
      <DiveHero
        back={BACK}
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
    // Whole units, as the dive's card rounds them.
    expect(figure("Max depth")).toHaveTextContent("31 m");
    expect(figure("Avg depth")).toHaveTextContent("18 m");
    expect(screen.getByRole("link", { name: "Back to dives" })).toHaveAttribute(
      "href",
      "/dives",
    );
  });

  it("adds the water, the entry and the dive's type to its line", () => {
    render(
      <DiveHero
        back={BACK}
        dive={dive({
          water_type: "fresh",
          entry_type: "boat",
          type: "closed_circuit",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent(
      "Apr 4, 2021, 10:04 · Water type Fresh water · Entry type Boat · Dive type Closed circuit",
    );
  });

  // Each goes without saying.
  it("leaves salt water and open circuit off its line", () => {
    render(
      <DiveHero
        back={BACK}
        dive={dive({ water_type: "salt", type: "open_circuit" })}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1 }).nextElementSibling,
    ).toHaveTextContent(/^Apr 4, 2021, 10:04$/);
  });

  it("marks a training dive's title with the course's icon", () => {
    render(<DiveHero back={BACK} dive={dive({ course_uuid: "course-1" })} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dive #1 (training dive)",
    );
  });

  it("shows the depths in feet for an imperial diver", () => {
    // Whole feet, and the value behind them is still the 30.48 m the API sent.
    auth.units = "imperial";
    render(
      <DiveHero
        back={BACK}
        dive={dive({ max_depth: 30.48, avg_depth: 18.2 })}
      />,
    );

    expect(figure("Max depth")).toHaveTextContent("100 ft");
    expect(figure("Avg depth")).toHaveTextContent("60 ft");
  });

  it("leaves the duration on its own for a dive with no depths", () => {
    // Every hand-logged dive that skipped them. An empty depth beside the
    // duration would read as something the diver failed to fill in.
    render(<DiveHero back={BACK} dive={dive()} />);

    expect(figure("Duration")).toHaveTextContent("45min");
    expect(figure("Max depth")).toBeUndefined();
    expect(figure("Avg depth")).toBeUndefined();
  });

  it("shows a recorded maximum without inventing an average", () => {
    render(<DiveHero back={BACK} dive={dive({ max_depth: 30.52 })} />);

    expect(figure("Max depth")).toHaveTextContent("31 m");
    expect(figure("Avg depth")).toBeUndefined();
  });

  const labels = () =>
    Array.from(document.querySelectorAll("dt"), (dt) => dt.textContent);

  it("shows the water's temperature and the visibility after the depths, rounded", () => {
    render(
      <DiveHero
        back={BACK}
        dive={dive({
          max_depth: 30.52,
          bottom_temperature: 25.05,
          visibility: 15,
        })}
      />,
    );

    expect(figure("Water temp")).toHaveTextContent("25°C");
    expect(figure("Visibility")).toHaveTextContent("15 m");
    expect(labels()).toEqual([
      "Duration",
      "Max depth",
      "Water temp",
      "Visibility",
    ]);
  });

  // The average only while the rest leave fewer than four figures, and then
  // after the maximum.
  it.each([
    [
      "the duration and maximum",
      { max_depth: 30.52 },
      ["Duration", "Max depth", "Avg depth"],
    ],
    ["the duration alone", {}, ["Duration", "Avg depth"]],
    [
      "the duration, maximum and a temperature",
      { max_depth: 30.52, bottom_temperature: 0 },
      ["Duration", "Max depth", "Avg depth", "Water temp"],
    ],
  ] as const)("shows the average beside %s", (_, fields, shown) => {
    render(
      <DiveHero back={BACK} dive={dive({ avg_depth: 18.2, ...fields })} />,
    );

    expect(labels()).toEqual(shown);
  });

  it("leaves the average off beside four other figures", () => {
    render(
      <DiveHero
        back={BACK}
        dive={dive({
          max_depth: 30.52,
          avg_depth: 18.2,
          bottom_temperature: 0,
          visibility: 15,
        })}
      />,
    );

    expect(labels()).toEqual([
      "Duration",
      "Max depth",
      "Water temp",
      "Visibility",
    ]);
  });

  it("keeps a zero-degree temperature, which is a reading rather than an absence", () => {
    render(<DiveHero back={BACK} dive={dive({ bottom_temperature: 0 })} />);

    expect(figure("Water temp")).toHaveTextContent("0°C");
  });

  it("reads the water's temperature and the visibility in the diver's units", () => {
    auth.units = "imperial";
    render(
      <DiveHero
        back={BACK}
        dive={dive({ bottom_temperature: 22, visibility: 15 })}
      />,
    );

    expect(figure("Water temp")).toHaveTextContent("°F");
    expect(figure("Visibility")).toHaveTextContent("ft");
  });

  it("leaves off a temperature and a visibility the dive does not record", () => {
    render(<DiveHero back={BACK} dive={dive()} />);

    expect(figure("Water temp")).toBeUndefined();
    expect(figure("Visibility")).toBeUndefined();
  });

  it("keeps a zero-metre average, which is a reading rather than an absence", () => {
    // `!= null`, not truthiness - the guard that has bitten `gas_number` and
    // the mixture pressures in this repo.
    render(
      <DiveHero back={BACK} dive={dive({ max_depth: 30.52, avg_depth: 0 })} />,
    );

    expect(figure("Avg depth")).toHaveTextContent("0 m");
  });

  it("hands its map the dive's places, laid out as a hero's, and credits it itself", () => {
    render(<DiveHero back={BACK} dive={dive(EXIT)} />);

    expect(mapProps()).toMatchObject({
      locations: [
        { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
      ],
      subject: "the location of dive #1",
      hero: true,
    });
    expect(
      screen.getByRole("link", { name: /OpenStreetMap/ }),
    ).toBeInTheDocument();
  });

  // The water its unplaced sibling shows, icon and all.
  it("gives its map the card's water, and credits no map, where this instance draws none", () => {
    tiles.drawn = false;
    render(<DiveHero back={BACK} dive={dive(EXIT)} />);

    const { water } = mapProps() as { water: React.ReactElement };
    expect(water.type).toBe(UnplacedBackdrop);
    expect(water.props).toMatchObject({ icon: DiveIcon });
    expect(screen.queryByRole("link", { name: /OpenStreetMap/ })).toBeNull();
  });

  it("credits no map before the instance has said whether it draws one", () => {
    tiles.drawn = undefined;
    render(<DiveHero back={BACK} dive={dive(EXIT)} />);

    expect(screen.queryByRole("link", { name: /OpenStreetMap/ })).toBeNull();
  });

  it("tells a recorded fix apart from a placed pin on the map", () => {
    render(
      <DiveHero back={BACK} dive={dive({ dive_sites: [SITE], ...EXIT })} />,
    );

    expect(mapProps().locations).toEqual([
      { name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 },
      { name: "Exit", latitude: 28.4375, longitude: 34.4584, variant: "fix" },
    ]);
  });

  it("keeps an equator fix, which is a position rather than an absence", () => {
    // A dive off West Africa exits at longitude 0.
    render(
      <DiveHero
        back={BACK}
        dive={dive({ exit_latitude: 0, exit_longitude: 0 })}
      />,
    );

    expect(mapProps().locations).toEqual([
      { name: "Exit", latitude: 0, longitude: 0, variant: "fix" },
    ]);
  });

  it("draws the map's water for a dive with no position, and credits no map", () => {
    // A site without a pin is no position either.
    render(
      <DiveHero
        back={BACK}
        dive={dive({
          dive_sites: [{ ...SITE, latitude: null, longitude: null }],
        })}
      />,
    );

    expect((mapProps().water as React.ReactElement).type).toBe(
      UnplacedBackdrop,
    );
    expect(screen.queryByRole("link", { name: /OpenStreetMap/ })).toBeNull();
  });
});
