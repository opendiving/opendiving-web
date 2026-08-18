import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { DiveProfileChart } from "./dive-profile-chart";
import { DIVE_PROFILE_SERIES_KEY } from "@/lib/chart-series-view";
import { memoryStorage, useStorage } from "@/test/memory-storage";
import type { DiveProfile, DiveProfileEvent } from "@/lib/api/dives";
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

// The chart's arithmetic is covered in `lib/dive-profile.test.ts`, where it belongs.
// What a render adds is the handful of things that are only true once the component
// has actually drawn something: that a payload from a newer API doesn't take the page
// down, and that the ceiling's shading and the legend agree with each other.

function profile(overrides: Partial<DiveProfile> = {}): DiveProfile {
  return {
    duration_seconds: 300,
    depth: { t: [0, 60, 120, 180, 240, 300], v: [0, 1800, 3000, 2400, 800, 0] },
    temperature: null,
    pressure: [],
    events: [],
    ...overrides,
  };
}

// A dive long enough for a marker and a curve to be far apart on the axis, with a
// depth series spanning all of it so the crosshair always has something to report.
function longProfile(overrides: Partial<DiveProfile> = {}): DiveProfile {
  return profile({
    duration_seconds: 3000,
    depth: {
      t: [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000],
      v: [0, 2000, 3000, 3000, 3000, 3000, 3000, 2000, 1000, 500, 0],
    },
    ...overrides,
  });
}

// jsdom gives every element a zero-sized rect, so the hover handler's
// `(clientX - left) / width` would be NaN. Stubbing the one measurement it makes is
// what turns the crosshair into something assertable - and the crosshair is where
// several component-level wirings are only observable.
const PLOT = { left: 0, width: 1000 };

// Every channel this chart can plot, all of them drawable, so a test can pick any
// subset of them and get exactly that subset back.
function everyChannel(overrides: Partial<DiveProfile> = {}): DiveProfile {
  const t = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];

  return {
    duration_seconds: 3000,
    depth: {
      t,
      v: [0, 2000, 3000, 3000, 3000, 3000, 3000, 2000, 1000, 500, 0],
    },
    // Four adjacent samples: an obligation short enough to be one run and long
    // enough to be drawn, which is what keeps the ceiling in `available`.
    ceiling: { t: [1200, 1210, 1220, 1230], v: [300, 300, 320, 300] },
    temperature: {
      t,
      v: [260, 250, 240, 235, 232, 230, 230, 232, 238, 245, 252],
    },
    pressure: [
      {
        gas_number: 1,
        t,
        v: [2000, 1850, 1700, 1560, 1420, 1280, 1140, 1000, 880, 800, 760],
      },
    ],
    events: [],
    ...overrides,
  };
}

// The toggles, addressed the way the legend names them.
const CHANNEL_BUTTONS = {
  depth: /^Depth/,
  ceiling: /^Deco ceiling/,
  temperature: /^Temperature/,
  pressure: /^Tank pressure/,
} as const;

type ChannelKey = keyof typeof CHANNEL_BUTTONS;
const CHANNEL_KEYS = Object.keys(CHANNEL_BUTTONS) as ChannelKey[];

// Every non-empty selection of the four, as [label, keys] rows for `it.each`. The
// empty one is the "all hidden" state and has a test of its own below.
const EVERY_SELECTION = Array.from(
  { length: 2 ** CHANNEL_KEYS.length },
  (_, mask) => CHANNEL_KEYS.filter((_, index) => mask & (1 << index)),
)
  .filter((keys) => keys.length > 0)
  .map((keys) => [keys.join(" + "), keys] as const);

// The numbers running down either edge of the plot. The elapsed-time ticks anchor
// `middle`, so these two selectors are exactly the vertical axes.
const leftAxisTicks = (root: HTMLElement) =>
  [...root.querySelectorAll("text[text-anchor='end']")].map(
    (tick) => tick.textContent,
  );
const rightAxisTicks = (root: HTMLElement) =>
  [...root.querySelectorAll("text[text-anchor='start']")].map(
    (tick) => tick.textContent,
  );

// The chart remembers which channels were last plotted, so the tests below that
// seed or toggle a selection need a store of their own - and `window.localStorage`
// doesn't work under this runner at all without it. See `test/memory-storage.ts`.
beforeEach(() => {
  useStorage(memoryStorage());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function hoverAt(fractionOfDive: number) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: PLOT.left,
    width: PLOT.width,
    top: 0,
    height: 200,
    right: PLOT.width,
    bottom: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  // The transparent hit target laid over the plot.
  const target = document.querySelector<SVGRectElement>(
    'rect[fill="transparent"]',
  );
  if (!target) throw new Error("no hit target - the chart drew nothing");

  fireEvent.mouseMove(target, {
    clientX: PLOT.left + PLOT.width * fractionOfDive,
    clientY: 100,
  });
}

// What the crosshair is currently saying, or "" when it is saying nothing at all -
// the tooltip is absent, not empty, when no channel and no marker is in reach.
function readoutText(): string {
  return screen.queryByRole("presentation")?.textContent ?? "";
}

describe("DiveProfileChart in imperial", () => {
  // The conversion happens once, where the wire scale is divided out, so what the
  // legend, the crosshair and the accessible summary all read is already in feet.
  const imperialDive = profile({
    // Sampled on depth's own clock, so the crosshair has a reading of each to
    // quote at the moment it is over.
    temperature: {
      t: [0, 60, 120, 180, 240, 300],
      v: [250, 245, 240, 238, 236, 235],
    },
    pressure: [
      {
        gas_number: 1,
        t: [0, 60, 120, 180, 240, 300],
        v: [2000, 1800, 1600, 1400, 1200, 1000],
      },
    ],
  });

  it("names each channel's imperial unit in the legend", () => {
    auth.units = "imperial";
    render(<DiveProfileChart profile={imperialDive} />);

    expect(screen.getByRole("button", { name: "Depth (ft)" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Temperature (°F)" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tank pressure (psi)" }),
    ).toBeTruthy();
  });

  it("quotes whole imperial readings in the crosshair", () => {
    auth.units = "imperial";
    render(<DiveProfileChart profile={imperialDive} />);
    hoverAt(120 / 300);

    // 30 m is 98 ft, 24 °C is 75 °F - and the degree is attached, as it is
    // everywhere else in the app.
    expect(readoutText()).toMatch(/98 ft Depth/);
    expect(readoutText()).toMatch(/75°F Temperature/);
  });

  it("spells the imperial units out in the accessible summary", () => {
    auth.units = "imperial";
    render(<DiveProfileChart profile={imperialDive} />);

    const summary = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(summary).toMatch(/maximum depth 98 feet/);
    expect(summary).toMatch(/degrees Fahrenheit/);
    expect(summary).toMatch(/psi/);
  });
});

describe("DiveProfileChart with an event type this build doesn't know", () => {
  // `ProfileEventType` is closed on the API side *today*, and the two repos deploy
  // independently - so an API that grows a sixth type reaches browsers still running
  // this bundle, where `event.type` is a string TypeScript merely believes is one of
  // five. Before `glyphFor`, indexing the glyph table with it returned `undefined` and
  // destructuring that threw inside render. With no `error.tsx` anywhere under
  // `src/app`, that took out the whole dive detail route rather than one tick.
  const rogue = (label?: string) =>
    ({ t: 120, type: "ndl_violation", label }) as unknown as DiveProfileEvent;

  it("renders the chart instead of throwing", () => {
    expect(() =>
      render(
        <DiveProfileChart
          profile={profile({ events: [rogue("NDL Violation")] })}
        />,
      ),
    ).not.toThrow();

    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("degrades to the device's own wording in the accessible summary", () => {
    render(
      <DiveProfileChart
        profile={profile({ events: [rogue("NDL Violation")] })}
      />,
    );

    // Not the string "undefined", which is what a `switch` with no `default`
    // returned from a function typed `: string`.
    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";

    expect(name).toContain("NDL Violation");
    expect(name).not.toContain("undefined");
  });

  it("still says something when the unknown type carries no label either", () => {
    render(<DiveProfileChart profile={profile({ events: [rogue()] })} />);

    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";

    expect(name).toContain("Device event");
    expect(name).not.toContain("undefined");
  });
});

describe("DiveProfileChart ceiling", () => {
  const withCeiling = profile({
    // Two runs with a real gap between them: an obligation that cleared and came
    // back. The chart must shade each separately rather than spanning the middle,
    // where the diver owed nothing.
    ceiling: {
      t: [60, 70, 80, 200, 210, 220],
      v: [300, 320, 340, 300, 310, 320],
    },
  });

  it("shades one region per run of consecutive samples", () => {
    const { container } = render(<DiveProfileChart profile={withCeiling} />);

    const shaded = container.querySelectorAll("path[class*='text-ceiling']");

    expect(shaded).toHaveLength(2);
  });

  it("draws the ceiling dashed and every other curve solid", () => {
    const { container } = render(<DiveProfileChart profile={withCeiling} />);

    const dashed = container.querySelectorAll("polyline[stroke-dasharray]");
    const solid = container.querySelectorAll(
      "polyline:not([stroke-dasharray])",
    );

    expect(dashed).toHaveLength(2); // one per ceiling run
    expect(solid.length).toBeGreaterThan(0); // depth
  });

  it("gives the legend a dashed swatch for the ceiling and solid ones elsewhere", () => {
    render(<DiveProfileChart profile={withCeiling} />);

    const swatch = (name: RegExp) =>
      screen.getByRole("button", { name }).querySelector("span")?.className ??
      "";

    // The legend is the only thing that says what the red region means, so a solid
    // swatch beside a dashed curve is the one thing it must not say.
    expect(swatch(/Deco ceiling/)).toContain("border-dashed");
    expect(swatch(/Depth/)).not.toContain("border-dashed");
  });

  it("offers no ceiling toggle on a dive that owed no decompression", () => {
    render(<DiveProfileChart profile={profile()} />);

    expect(
      screen.queryByRole("button", { name: /Deco ceiling/ }),
    ).not.toBeInTheDocument();
  });
});

describe("DiveProfileChart crosshair over a short deco obligation", () => {
  // The wiring the `lib` tests can't reach. `sampleIndexAt` and `readoutTolerance`
  // are covered there, but which of `gapThreshold`/`readoutTolerance` the chart
  // actually hands to the readout is a fact about this file - and feeding it the
  // former is precisely how the guard shipped inert the first time.
  //
  // Two samples ten seconds apart: a dive that tipped into deco briefly, which
  // still draws (they are inside the 15 s floor) and still reads out.
  const shortObligation = longProfile({
    ceiling: { t: [1400, 1410], v: [300, 300] },
  });

  it("does not quote the ceiling from the far side of the dive", () => {
    render(<DiveProfileChart profile={shortObligation} />);
    hoverAt(0.05); // 150 s, twenty minutes before the obligation existed

    expect(readoutText()).not.toMatch(/Deco ceiling/);
  });

  it("still quotes it while the crosshair is on it", () => {
    render(<DiveProfileChart profile={shortObligation} />);
    hoverAt(1405 / 3000);

    expect(readoutText()).toMatch(/3\.0 m Deco ceiling/);
  });

  it("names a marker the crosshair is on, and none when it is away from one", () => {
    // The other half of the same class of wiring: `nearestEvent` is covered in
    // `lib`, but the tolerance the chart hands it -
    // `(duration / PLOT_WIDTH) * EVENT_HOVER_UNITS`, about 38 s on this dive - is
    // a fact about this file and nothing asserted it.
    render(
      <DiveProfileChart
        profile={longProfile({ events: [{ t: 900, type: "bookmark" }] })}
      />,
    );

    hoverAt(900 / 3000);
    expect(readoutText()).toMatch(/Bookmark/);

    hoverAt(1500 / 3000);
    expect(readoutText()).not.toMatch(/Bookmark/);
  });
});

describe("DiveProfileChart shading a brief obligation", () => {
  // The drawing half of the short-series problem, and the one the readout fix
  // missed. `gapThreshold` answers Infinity below three samples, which joins two
  // isolated moments in deco into a single run - so the chart shaded twenty
  // minutes of forbidden zone across a stretch the diver owed nothing, while the
  // crosshair (already floored to 15 s) reported no ceiling there at all.
  const twoMoments = longProfile({
    ceiling: { t: [1400, 2600], v: [300, 300] },
  });

  it("does not span twenty minutes between two isolated deco samples", () => {
    const { container } = render(<DiveProfileChart profile={twoMoments} />);

    // Two single-point runs draw neither an area nor a line. Silence is the
    // honest answer to an obligation that lasted one sample; the card's
    // description still reports the dive had a ceiling, from `max_ceiling`.
    expect(
      container.querySelectorAll("path[class*='text-ceiling']"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("polyline[stroke-dasharray]"),
    ).toHaveLength(0);
  });

  it("still draws a brief obligation whose samples are adjacent", () => {
    // The case worth drawing, and the one a blanket "drop short series" would
    // have lost: two consecutive 10 s samples are 10 s apart, inside the 15 s
    // floor, so they remain one run.
    const { container } = render(
      <DiveProfileChart
        profile={longProfile({ ceiling: { t: [1400, 1410], v: [300, 300] } })}
      />,
    );

    expect(
      container.querySelectorAll("path[class*='text-ceiling']"),
    ).toHaveLength(1);
  });

  it("agrees with the crosshair about where the obligation was", () => {
    // The property `gapSeconds` exists for: the two halves are cut at one
    // threshold, so there is no stretch that is shaded but unquotable.
    render(<DiveProfileChart profile={twoMoments} />);
    hoverAt(2000 / 3000); // mid-span, between the two isolated samples

    expect(readoutText()).not.toMatch(/Deco ceiling/);
  });

  it("quotes nothing while hovering the isolated sample itself", () => {
    // Mid-span was the easy half, and testing only that is how this survived a
    // round: `gapSeconds` still resolved an index within 15 s of a sample that
    // had been dropped from the drawing, so the crosshair named a 3.0 m ceiling
    // and planted a dot on it over a chart with no ceiling on it. A ~5 px band,
    // narrower than the whole dive and no less wrong.
    const { container } = render(<DiveProfileChart profile={twoMoments} />);
    hoverAt(1400 / 3000); // exactly on the first isolated sample

    expect(readoutText()).not.toMatch(/Deco ceiling/);
    expect(
      container.querySelectorAll("circle[class*='text-ceiling']"),
    ).toHaveLength(0);
  });

  it("keeps the summary agreeing with the picture", () => {
    render(<DiveProfileChart profile={twoMoments} />);

    // A chart that drew no ceiling must not announce one either.
    expect(
      screen.getByRole("img").getAttribute("aria-label") ?? "",
    ).not.toMatch(/deco ceiling/i);
  });

  it("offers no toggle for a channel too sparse to draw", () => {
    render(<DiveProfileChart profile={twoMoments} />);

    expect(
      screen.queryByRole("button", { name: /Deco ceiling/ }),
    ).not.toBeInTheDocument();
  });
});

describe("DiveProfileChart summary over a partly-drawn channel", () => {
  // The granularity gap the channel filter didn't reach. `shownValues` gates at
  // channel level - is this channel on the chart - while runs are dropped at
  // sample level, so a ceiling that keeps one drawable run still handed its whole
  // raw series to the summary and to the shared axis. Here 2000 s is an isolated
  // 9.0 m sample that draws nothing, while the drawn run tops out at 3.0 m.
  const partlyDrawn = longProfile({
    ceiling: { t: [600, 610, 620, 2000], v: [300, 300, 300, 900] },
  });

  it("quotes the deepest ceiling that was drawn, not the deepest recorded", () => {
    render(<DiveProfileChart profile={partlyDrawn} />);

    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";

    // An invented deeper obligation is a safety claim, which is the argument
    // this file makes for itself everywhere else.
    expect(name).toContain("deco ceiling to 3.0 meters");
    expect(name).not.toContain("9.0 meters");
  });

  it("does not stretch the shared axis to an undrawn sample", () => {
    const { container } = render(<DiveProfileChart profile={partlyDrawn} />);

    // Depth tops out at 30 m here, so a domain reaching past ~30 could only be
    // accommodating the 9 m ceiling sample nothing drew... which is inside the
    // depth range anyway. The assertion that bites: the drawn ceiling sits where
    // 3 m sits on the depth axis, unmoved by the 9 m sample.
    const dashed = container.querySelector("polyline[stroke-dasharray]");
    const ys = (dashed?.getAttribute("points") ?? "")
      .split(" ")
      .map((point) => Number(point.split(",")[1]));

    // 3 m on a 0-30 m axis over a 238-unit plot: 14 + (3/30)*238 ≈ 37.8.
    expect(ys.every((y) => Math.abs(y - 37.8) < 0.5)).toBe(true);
  });

  it("still reads out the drawn run", () => {
    render(<DiveProfileChart profile={partlyDrawn} />);
    hoverAt(610 / 3000);

    expect(readoutText()).toMatch(/3\.0 m Deco ceiling/);
  });

  it("says nothing at the undrawn sample", () => {
    render(<DiveProfileChart profile={partlyDrawn} />);
    hoverAt(2000 / 3000);

    expect(readoutText()).not.toMatch(/Deco ceiling/);
  });
});

describe("DiveProfileChart with a two-sample measured channel", () => {
  // Refusing to join two distant samples is right for the ceiling and wrong
  // everywhere else: a gap in a measured channel means "not recorded", two
  // samples are still two readings, and filtering them out took the whole chart
  // with them when depth was the only channel.
  it("still plots a depth series of two samples", () => {
    const { container } = render(
      <DiveProfileChart
        profile={{
          duration_seconds: 3000,
          depth: { t: [100, 400], v: [1000, 2000] },
          temperature: null,
          pressure: [],
          events: [],
        }}
      />,
    );

    expect(container.textContent).not.toContain("recorded no samples to plot");
    expect(
      container.querySelectorAll("g[class*='text-teal'] polyline"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Depth/ })).toBeInTheDocument();
  });

  it("still plots a temperature series of two samples", () => {
    render(
      <DiveProfileChart
        profile={longProfile({ temperature: { t: [100, 160], v: [220, 219] } })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Temperature/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img").getAttribute("aria-label") ?? "").toMatch(
      /temperature/i,
    );
  });
});

describe("DiveProfileChart with a ceiling too sparse to plot", () => {
  // Only the ceiling refuses to join distant samples, so only the ceiling can end
  // up with nothing drawable. When it does, it must not claim a legend entry, an
  // axis in its own colour, or a line in the summary.
  const sparseCeiling = longProfile({
    ceiling: { t: [100, 1600], v: [300, 300] },
  });

  it("draws no curve, and says so consistently everywhere", () => {
    const { container } = render(<DiveProfileChart profile={sparseCeiling} />);

    expect(
      container.querySelectorAll("polyline[stroke-dasharray]"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("path[class*='text-ceiling']"),
    ).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: /Deco ceiling/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("img").getAttribute("aria-label") ?? "",
    ).not.toMatch(/deco ceiling/i);
  });

  it("leaves the depth axis where depth alone would put it", () => {
    // The ceiling's undrawn samples must not stretch the axis they share.
    const { container } = render(<DiveProfileChart profile={sparseCeiling} />);
    const withoutCeiling = render(<DiveProfileChart profile={longProfile()} />);

    const ticks = (root: HTMLElement) =>
      [...root.querySelectorAll("text[text-anchor='end']")].map(
        (label) => label.textContent,
      );

    expect(ticks(container)).toEqual(ticks(withoutCeiling.container));
  });
});

// How many distinct scales a selection puts on the plot. Depth and the ceiling share
// one domain by construction; temperature and pressure each have their own - so this
// is the number of edges that should end up labelled, and the chart has two.
function distinctScales(keys: readonly ChannelKey[]): number {
  return new Set(keys.map((key) => (key === "ceiling" ? "depth" : key))).size;
}

describe("DiveProfileChart depth fill across a dropout", () => {
  // A depth series with a real hole in it: `gapThreshold` is three times the median
  // delta with a 15 s floor, so a 300 s cadence breaks at anything past 900 s and
  // this 1 500 s hole is well clear of it. Modelled on `Dive_2025-03-08-1440.xml`,
  // which has a 1 341-second one.
  const withDropout = profile({
    duration_seconds: 3000,
    depth: {
      t: [0, 300, 600, 900, 2400, 2700, 3000],
      v: [0, 2000, 3000, 3000, 1000, 500, 0],
    },
  });

  it("breaks the fill where it breaks the line", () => {
    // The fill was built from the whole series while the line was built from its
    // segments, so the teal area ran straight across a gap the curve above it
    // correctly refused to cross - a filled region claiming the diver was in water
    // the device recorded nothing about.
    const { container } = render(<DiveProfileChart profile={withDropout} />);

    const fills = container.querySelectorAll("path[class*='text-teal']");
    const lines = container.querySelectorAll("g[class*='text-teal'] polyline");

    expect(lines).toHaveLength(2);
    expect(fills).toHaveLength(2);
  });

  it("leaves the dropout unfilled rather than spanning it", () => {
    // The count above would also pass on two paths that happened to overlap, so
    // this asserts the geometry: each fill starts and ends inside its own run, and
    // neither reaches across the hole between 900 s and 2 400 s.
    const { container } = render(<DiveProfileChart profile={withDropout} />);

    const spans = [...container.querySelectorAll("path[class*='text-teal']")]
      .map((fill) => fill.getAttribute("d") ?? "")
      .map((d) => {
        const xs = [...d.matchAll(/[ML](-?[\d.]+),/g)].map((match) =>
          Number(match[1]),
        );
        return [Math.min(...xs), Math.max(...xs)];
      })
      .sort((first, second) => first[0] - second[0]);

    // x(900) and x(2400) on a 3000 s dive over the 630-unit plot, offset by the
    // 44-unit left padding: 233 and 548.
    expect(spans[0][1]).toBeCloseTo(233, 0);
    expect(spans[1][0]).toBeCloseTo(548, 0);
  });

  it("still draws one fill for a series with no dropout in it", () => {
    const { container } = render(<DiveProfileChart profile={longProfile()} />);

    expect(container.querySelectorAll("path[class*='text-teal']")).toHaveLength(
      1,
    );
  });
});

describe("DiveProfileChart vertical axes", () => {
  // The reported bug was one cell of this table: with depth and the ceiling both
  // switched off, the left-hand labels vanished and the plot was left with a blank
  // margin and gridlines running out of it. Swept over all fifteen selections
  // rather than pinned at that one, because "which channel labels which edge" is a
  // rule with four inputs and the failing combination was not the obvious one.
  //
  // Seeded through the remembered selection rather than by clicking, which is the
  // same path a returning diver takes and needs no fifteen-way click sequence.
  it.each(EVERY_SELECTION)(
    "reads %s off the left edge, and the right only for a second scale",
    (_, keys) => {
      window.localStorage.setItem(
        DIVE_PROFILE_SERIES_KEY,
        JSON.stringify(keys),
      );

      const { container } = render(
        <DiveProfileChart profile={everyChannel()} />,
      );

      expect(leftAxisTicks(container).length).toBeGreaterThan(0);
      expect(rightAxisTicks(container).length > 0).toBe(
        distinctScales(keys) > 1,
      );
    },
  );

  it("leaves the right edge empty where the selection has one scale", () => {
    // Depth and the ceiling share a domain, so there is no second scale to put
    // there. It stays empty rather than repeating the left's numbers - two columns
    // of identical figures invite the reading that they are two scales.
    window.localStorage.setItem(
      DIVE_PROFILE_SERIES_KEY,
      JSON.stringify(["depth", "ceiling"]),
    );

    const { container } = render(<DiveProfileChart profile={everyChannel()} />);

    expect(leftAxisTicks(container).length).toBeGreaterThan(0);
    expect(rightAxisTicks(container)).toEqual([]);
  });

  it("gives the second scale the right-hand edge when there is one", () => {
    // And then they must not be the same numbers: meters on one side, °C on the
    // other.
    window.localStorage.setItem(
      DIVE_PROFILE_SERIES_KEY,
      JSON.stringify(["depth", "temperature"]),
    );

    const { container } = render(<DiveProfileChart profile={everyChannel()} />);

    expect(rightAxisTicks(container).length).toBeGreaterThan(0);
    expect(rightAxisTicks(container)).not.toEqual(leftAxisTicks(container));
  });

  // Which colour each edge is labelled in, which is how the chart says which
  // channel owns it: teal depth, red ceiling, coral temperature, violet pressure.
  const axisColours = (root: HTMLElement) => ({
    left:
      root.querySelector("text[text-anchor='end']")?.getAttribute("class") ??
      "",
    right:
      root.querySelector("text[text-anchor='start']")?.getAttribute("class") ??
      "",
  });

  function seeded(keys: readonly ChannelKey[]) {
    window.localStorage.setItem(DIVE_PROFILE_SERIES_KEY, JSON.stringify(keys));

    return axisColours(
      render(<DiveProfileChart profile={everyChannel()} />).container,
    );
  }

  // The sides are fixed so that a diver reading across a logbook of dives finds
  // the meters where they left them. Hue is a slower thing to check than
  // position, so an axis that swapped edges with the channel mix would make them
  // re-read the colour of the numbers on every dive.
  it("keeps meters on the left and temperature on the right", () => {
    expect(seeded(["depth", "temperature"])).toEqual({
      left: expect.stringContaining("text-teal"),
      right: expect.stringContaining("text-coral"),
    });
  });

  it("keeps the ceiling on depth's own edge when depth is off", () => {
    expect(seeded(["ceiling", "temperature"])).toEqual({
      left: expect.stringContaining("text-ceiling"),
      right: expect.stringContaining("text-coral"),
    });
  });

  it("sends pressure to the right when meters hold the left", () => {
    // Pressure is the channel that moves, and it is the right one to move: on a
    // full three-scale plot it is the one that goes unlabelled anyway.
    expect(seeded(["depth", "pressure"])).toEqual({
      left: expect.stringContaining("text-teal"),
      right: expect.stringContaining("text-pressure"),
    });
  });

  it("sends pressure to the left when temperature holds the right", () => {
    // The originally reported selection: depth and the ceiling both off. Neither
    // edge was labelled for pressure before, and the left was blank.
    expect(seeded(["temperature", "pressure"])).toEqual({
      left: expect.stringContaining("text-pressure"),
      right: expect.stringContaining("text-coral"),
    });
  });

  it("leaves pressure unlabelled where both edges are taken", () => {
    expect(seeded(["depth", "temperature", "pressure"])).toEqual({
      left: expect.stringContaining("text-teal"),
      right: expect.stringContaining("text-coral"),
    });
  });

  it("puts a lone temperature scale on the left, where a lone scale goes", () => {
    // The one place the fixed sides give way: with nothing sharing the plot there
    // is no side to protect, and a blank left gutter is what both reports were
    // about.
    expect(seeded(["temperature"])).toEqual({
      left: expect.stringContaining("text-coral"),
      right: "",
    });
  });
});

describe("DiveProfileChart with every channel switched off", () => {
  // Switching the last one off used to replace the whole chart with a sentence,
  // which collapsed the card to two lines and pulled the legend - the only way
  // back - up the page after the cursor that had just clicked it.
  function hideEverything() {
    const view = render(<DiveProfileChart profile={everyChannel()} />);
    for (const name of Object.values(CHANNEL_BUTTONS)) {
      fireEvent.click(screen.getByRole("button", { name }));
    }

    return view;
  }

  it("keeps the plot, and says why it is empty", () => {
    hideEverything();

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByText(/every channel is hidden/i)).toBeInTheDocument();
  });

  it("leaves the toggles where they were", () => {
    hideEverything();

    for (const name of Object.values(CHANNEL_BUTTONS)) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
  });

  it("draws no curve, no fill and no vertical axis", () => {
    // An empty plot, not a plot of nothing labelled as if it were something: with
    // no channel on screen there is no domain, so neither edge can carry numbers.
    const { container } = hideEverything();

    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    expect(
      container.querySelectorAll("path[fill='currentColor']"),
    ).toHaveLength(0);
    expect(leftAxisTicks(container)).toEqual([]);
    expect(rightAxisTicks(container)).toEqual([]);
  });

  it("still draws the elapsed-time axis, which no channel was holding up", () => {
    const { container } = hideEverything();

    expect(
      container.querySelectorAll("text[text-anchor='middle']").length,
    ).toBeGreaterThan(0);
  });
});

describe("DiveProfileChart markers past the end of the recorded profile", () => {
  // The API clamps event times at zero and deliberately leaves the high end
  // alone, signing off with "a chart that draws past its x domain is the chart's
  // to clip" (`_rebase_events`). Undrawn, `x(6000)` on a 3000 s dive is 1304 in a
  // 720-unit viewBox; `x(3200)` is 716, which is inside the viewBox but in the
  // right-hand axis-label gutter, aligned with no time on the axis.
  const late = longProfile({
    events: [
      { t: 1500, type: "bookmark" },
      { t: 3200, type: "bookmark" },
      { t: 6000, type: "gas_switch", gas_number: 1 },
    ],
  });

  it("draws only the markers that fall inside the plot", () => {
    const { container } = render(<DiveProfileChart profile={late} />);

    const ticks = [
      ...container.querySelectorAll("g[aria-hidden][opacity] line"),
    ];

    expect(ticks).toHaveLength(1);
    expect(Number(ticks[0].getAttribute("x1"))).toBeLessThanOrEqual(
      720 - 46, // WIDTH - PADDING.right, the plot's right edge
    );
  });

  it("does not name in the summary what it declined to draw", () => {
    // The actual defect: a marker invisible to the eye but announced to a screen
    // reader is the two views disagreeing about what the chart contains.
    render(<DiveProfileChart profile={late} />);

    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";

    expect(name).toContain("Bookmark at 25min");
    expect(name).not.toContain("53min");
    expect(name).not.toContain("1h 40min");
  });
});

describe("DiveProfileChart marker toggle", () => {
  // Markers used to be drawn unconditionally, on the argument that annotations are
  // cheap enough to always show. They aren't, on a dive that carries a dozen: a row
  // of ticks along the baseline is a picket fence in front of the curves it
  // annotates, and the diver had no way to put it down.
  const withMarkers = longProfile({
    events: [
      { t: 600, type: "gas_switch", gas_number: 2 },
      { t: 1500, type: "bookmark" },
      { t: 2400, type: "safety_stop" },
    ],
  });

  const markerTicks = (root: HTMLElement) =>
    root.querySelectorAll("g[aria-hidden][opacity] line");

  const markerToggle = () => screen.getByRole("button", { name: /^Markers/ });

  it("offers the toggle, on, for a dive that has markers", () => {
    render(<DiveProfileChart profile={withMarkers} />);

    expect(markerToggle()).toHaveAttribute("aria-pressed", "true");
    expect(markerTicks(document.body)).toHaveLength(3);
  });

  it("offers none for a dive that has none", () => {
    // A dive with no markers gets no switch for them, exactly as a dive that owed
    // no decompression gets no ceiling switch.
    render(<DiveProfileChart profile={longProfile()} />);

    expect(
      screen.queryByRole("button", { name: /^Markers/ }),
    ).not.toBeInTheDocument();
  });

  it("takes the markers off the plot when switched off", () => {
    const { container } = render(<DiveProfileChart profile={withMarkers} />);

    fireEvent.click(markerToggle());

    expect(markerTicks(container)).toHaveLength(0);
    expect(markerToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("stops naming them in the accessible summary too", () => {
    // The disagreement this chart has had to be talked out of repeatedly: a mark
    // the eye cannot see must not still be announced to a screen reader.
    render(<DiveProfileChart profile={withMarkers} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain(
      "Bookmark",
    );

    fireEvent.click(markerToggle());

    expect(screen.getByRole("img").getAttribute("aria-label")).not.toContain(
      "Bookmark",
    );
  });

  it("stops quoting them in the crosshair too", () => {
    render(<DiveProfileChart profile={withMarkers} />);
    hoverAt(1500 / 3000);
    expect(readoutText()).toMatch(/Bookmark/);

    fireEvent.click(markerToggle());
    hoverAt(1500 / 3000);

    expect(readoutText()).not.toMatch(/Bookmark/);
    // And the depth reading at that instant is untouched - the toggle hides the
    // annotations, not the readout they happened to coincide with.
    expect(readoutText()).toMatch(/Depth/);
  });

  it("leaves the curves alone", () => {
    const { container } = render(<DiveProfileChart profile={withMarkers} />);

    fireEvent.click(markerToggle());

    expect(container.querySelectorAll("polyline").length).toBeGreaterThan(0);
    expect(leftAxisTicks(container).length).toBeGreaterThan(0);
  });

  it("remembers the choice for the next dive", () => {
    // Through the same stored entry as the channels, which is what makes the
    // markers switch feel like the four beside it rather than a per-page mode.
    render(<DiveProfileChart profile={withMarkers} />);

    fireEvent.click(markerToggle());

    expect(
      JSON.parse(window.localStorage.getItem(DIVE_PROFILE_SERIES_KEY) ?? "[]"),
    ).not.toContain("events");
  });

  it("restores a remembered selection that hid them", () => {
    window.localStorage.setItem(
      DIVE_PROFILE_SERIES_KEY,
      JSON.stringify(["depth", "ceiling", "temperature", "pressure"]),
    );

    const { container } = render(<DiveProfileChart profile={withMarkers} />);

    expect(markerTicks(container)).toHaveLength(0);
    expect(markerToggle()).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the markers up with every channel hidden, and holds the message back", () => {
    // A plot showing only markers has content, so "Every channel is hidden. Pick
    // one below to plot it." printed across them would be describing a chart
    // nobody is looking at.
    const { container } = render(<DiveProfileChart profile={withMarkers} />);
    for (const name of Object.values(CHANNEL_BUTTONS)) {
      const toggle = screen.queryByRole("button", { name });
      if (toggle) fireEvent.click(toggle);
    }

    expect(markerTicks(container)).toHaveLength(3);
    expect(
      screen.queryByText(/every channel is hidden/i),
    ).not.toBeInTheDocument();
  });
});

describe("DiveProfileChart selection across dives", () => {
  // The remembered selection is one entry shared by every dive, while `available`
  // is per-dive - so anything that narrows the stored value to *this* dive's keys
  // erases the diver's opinion about the ones it happens to lack. That is the very
  // failure the `-v3` key bump exists to fix once, at migration; writing a narrowed
  // selection back would reopen it on every dive that lacks a key.
  const noMarkers = longProfile({
    temperature: { t: [0, 300, 600, 900], v: [260, 250, 240, 235] },
  });
  const withMarkers = longProfile({
    temperature: { t: [0, 300, 600, 900], v: [260, 250, 240, 235] },
    events: [{ t: 600, type: "bookmark" }],
  });

  it("does not let a marker-less dive switch the markers off for the next one", () => {
    render(<DiveProfileChart profile={noMarkers} />);
    fireEvent.click(screen.getByRole("button", { name: /^Temperature/ }));
    cleanup();

    render(<DiveProfileChart profile={withMarkers} />);

    expect(
      document.querySelectorAll("g[aria-hidden][opacity] line"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Markers/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not let a no-deco dive switch the ceiling off for the next deco dive", () => {
    // The same mechanism, one key over, and it predates the marker switch - a
    // no-deco dive offers no ceiling toggle, so any click on one used to write a
    // selection with `ceiling` stripped.
    render(<DiveProfileChart profile={noMarkers} />);
    fireEvent.click(screen.getByRole("button", { name: /^Temperature/ }));
    cleanup();

    render(
      <DiveProfileChart
        profile={longProfile({
          ceiling: { t: [1200, 1210, 1220], v: [300, 300, 320] },
        })}
      />,
    );

    expect(
      screen.getByRole("button", { name: /^Deco ceiling/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("still carries the choice the diver actually made", () => {
    // The other half: carrying the untouched keys must not also carry back the
    // one they switched off.
    render(<DiveProfileChart profile={noMarkers} />);
    fireEvent.click(screen.getByRole("button", { name: /^Temperature/ }));
    cleanup();

    render(<DiveProfileChart profile={withMarkers} />);

    expect(
      screen.getByRole("button", { name: /^Temperature/ }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("DiveProfileChart legend group name", () => {
  it("names the markers only on a dive that has them", () => {
    // A group announcing a control it does not contain is the same disagreement
    // this chart polices everywhere else, one level up in the tree.
    const { rerender } = render(
      <DiveProfileChart
        profile={longProfile({ events: [{ t: 600, type: "bookmark" }] })}
      />,
    );
    expect(
      screen.getByRole("group", { name: "Channels and markers" }),
    ).toBeInTheDocument();

    rerender(<DiveProfileChart profile={longProfile()} />);

    expect(screen.getByRole("group", { name: "Channels" })).toBeInTheDocument();
  });
});

describe("DiveProfileChart with markers but nothing plottable", () => {
  // `available` counts the markers now, so the "no samples" guard had to move to
  // the channels or it would stop firing here - leaving a plot box with a time
  // axis, a row of ticks and a legend reading only "Markers", with nothing
  // saying why it is bare.
  const markersOnly: DiveProfile = {
    duration_seconds: 3000,
    depth: null,
    temperature: null,
    pressure: [],
    events: [{ t: 600, type: "bookmark" }],
  };

  it("says the file recorded no samples, which markers are not", () => {
    render(<DiveProfileChart profile={markersOnly} />);

    expect(
      screen.getByText(/recorded no samples to plot/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("DiveProfileChart remembered selection that plots no curve here", () => {
  // The fallback exists so that "a dive that recorded only what you'd hidden opens
  // showing what it does have, not blank". Counting the markers as something the
  // selection plots defeats it: a stored selection whose only surviving key is
  // `events` leaves the chart with marker ticks, no curve, no axis - and no message,
  // since the overlay stands down while the markers are up.
  const depthAndMarkers = longProfile({
    events: [{ t: 600, type: "bookmark" }],
  });

  it("falls back to the curves this dive does have", () => {
    window.localStorage.setItem(
      DIVE_PROFILE_SERIES_KEY,
      JSON.stringify(["temperature", "events"]),
    );

    const { container } = render(
      <DiveProfileChart profile={depthAndMarkers} />,
    );

    expect(container.querySelectorAll("polyline").length).toBeGreaterThan(0);
    expect(leftAxisTicks(container).length).toBeGreaterThan(0);
  });

  it("keeps the markers choice through that fallback", () => {
    // The half a blanket "ignore the whole selection" fallback would get wrong:
    // absence of `events` is a real choice under this key, so restoring the curves
    // must not also switch the markers back on.
    window.localStorage.setItem(
      DIVE_PROFILE_SERIES_KEY,
      JSON.stringify(["temperature"]),
    );

    const { container } = render(
      <DiveProfileChart profile={depthAndMarkers} />,
    );

    expect(container.querySelectorAll("polyline").length).toBeGreaterThan(0);
    expect(
      container.querySelectorAll("g[aria-hidden][opacity] line"),
    ).toHaveLength(0);
  });
});
