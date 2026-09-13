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
    duration: 300,
    depth: {
      times: [0, 60, 120, 180, 240, 300],
      values: [0, 1800, 3000, 2400, 800, 0],
    },
    temperature: null,
    pressures: [],
    events: [],
    ...overrides,
  };
}

// A dive long enough for a marker and a curve to be far apart on the axis, with a
// depth series spanning all of it so the crosshair always has something to report.
function longProfile(overrides: Partial<DiveProfile> = {}): DiveProfile {
  return profile({
    duration: 3000,
    depth: {
      times: [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000],
      values: [0, 2000, 3000, 3000, 3000, 3000, 3000, 2000, 1000, 500, 0],
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
  const times = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];

  return {
    duration: 3000,
    depth: {
      times,
      values: [0, 2000, 3000, 3000, 3000, 3000, 3000, 2000, 1000, 500, 0],
    },
    // Four adjacent samples: an obligation short enough to be one run and long
    // enough to be drawn, which is what keeps the ceiling in `available`.
    ceiling: { times: [1200, 1210, 1220, 1230], values: [300, 300, 320, 300] },
    temperature: {
      times,
      values: [260, 250, 240, 235, 232, 230, 230, 232, 238, 245, 252],
    },
    pressures: [
      {
        gas_number: 1,
        times,
        values: [2000, 1850, 1700, 1560, 1420, 1280, 1140, 1000, 880, 800, 760],
      },
    ],
    // The six the computer worked out for itself, on depth's own clock and at
    // the API's own scales: seconds, hundredths of a bar, tenths of a percent
    // and whole percent.
    ndl: {
      times,
      values: [5940, 3600, 1800, 900, 300, 0, 0, 0, 0, 0, 0],
    },
    tts: { times, values: [0, 0, 0, 300, 600, 900, 1080, 900, 600, 300, 0] },
    ppo2: { times, values: [21, 80, 110, 132, 130, 128, 126, 90, 60, 40, 21] },
    cns: { times, values: [0, 10, 24, 40, 58, 77, 96, 110, 118, 122, 124] },
    gradient_factor: {
      times,
      values: [0, 5, 12, 20, 31, 45, 62, 80, 91, 96, 98],
    },
    surface_gradient_factor: {
      times,
      values: [0, 12, 30, 48, 66, 78, 84, 80, 64, 40, 20],
    },
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
  ndl: /^No-deco time/,
  tts: /^Time to surface/,
  ppo2: /^ppO₂/,
  cns: /^CNS/,
  gradient_factor: /^Gradient factor/,
  surface_gradient_factor: /^Surface gradient factor/,
} as const;

type ChannelKey = keyof typeof CHANNEL_BUTTONS;
const CHANNEL_KEYS = Object.keys(CHANNEL_BUTTONS) as ChannelKey[];

// The four that can claim an edge of the depth plot. The other six are drawn in
// the deco panel below it, which has a scale of its own per row and takes no
// edge from this plot at all.
const DEPTH_PLOT_KEYS: readonly ChannelKey[] = [
  "depth",
  "ceiling",
  "temperature",
  "pressure",
];

// Every non-empty selection of the ten, as [label, keys] rows for `it.each`. The
// empty one is the "all hidden" state and has a test of its own below.
const EVERY_SELECTION = Array.from(
  { length: 2 ** CHANNEL_KEYS.length },
  (_, mask) => CHANNEL_KEYS.filter((_, index) => mask & (1 << index)),
)
  .filter((keys) => keys.length > 0)
  .map((keys) => [keys.join(" + "), keys] as const);

// The numbers running down either edge of the **depth plot**. The elapsed-time
// ticks anchor `middle`, so the anchors are exactly the vertical axes - and the
// deco panel's rows carry their own left-hand numbers, which are a different
// question and are excluded here rather than being allowed to answer this one.
const outsideThePanel = (tick: Element) => !tick.closest("[data-deco-panel]");
const leftAxisTicks = (root: HTMLElement) =>
  [...root.querySelectorAll("text[text-anchor='end']")]
    .filter(outsideThePanel)
    .map((tick) => tick.textContent);
const rightAxisTicks = (root: HTMLElement) =>
  [...root.querySelectorAll("text[text-anchor='start']")]
    .filter(outsideThePanel)
    .map((tick) => tick.textContent);

// The deco panel's rows that are actually on screen, by the axis each carries.
const panelRows = (root: HTMLElement) =>
  [...root.querySelectorAll("[data-deco-panel]")].map((row) =>
    row.getAttribute("data-deco-panel"),
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
      times: [0, 60, 120, 180, 240, 300],
      values: [250, 245, 240, 238, 236, 235],
    },
    pressures: [
      {
        gas_number: 1,
        times: [0, 60, 120, 180, 240, 300],
        values: [2000, 1800, 1600, 1400, 1200, 1000],
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
    ({
      time: 120,
      type: "ndl_violation",
      label,
    }) as unknown as DiveProfileEvent;

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
      times: [60, 70, 80, 200, 210, 220],
      values: [300, 320, 340, 300, 310, 320],
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
    ceiling: { times: [1400, 1410], values: [300, 300] },
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
        profile={longProfile({ events: [{ time: 900, type: "bookmark" }] })}
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
    ceiling: { times: [1400, 2600], values: [300, 300] },
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
        profile={longProfile({
          ceiling: { times: [1400, 1410], values: [300, 300] },
        })}
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
    ceiling: { times: [600, 610, 620, 2000], values: [300, 300, 300, 900] },
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
          duration: 3000,
          depth: { times: [100, 400], values: [1000, 2000] },
          temperature: null,
          pressures: [],
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
        profile={longProfile({
          temperature: { times: [100, 160], values: [220, 219] },
        })}
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
    ceiling: { times: [100, 1600], values: [300, 300] },
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

// How many distinct scales a selection puts on the **depth plot**. Depth and the
// ceiling share one domain by construction; temperature and pressure each have
// their own, and the six deco channels put none there at all - so this is the
// number of edges that should end up labelled, and the plot has two.
function distinctScales(keys: readonly ChannelKey[]): number {
  return new Set(
    keys
      .filter((key) => DEPTH_PLOT_KEYS.includes(key))
      .map((key) => (key === "ceiling" ? "depth" : key)),
  ).size;
}

describe("DiveProfileChart depth fill across a dropout", () => {
  // A depth series with a real hole in it: `gapThreshold` is three times the median
  // delta with a 15 s floor, so a 300 s cadence breaks at anything past 900 s and
  // this 1 500 s hole is well clear of it. Modelled on `Dive_2025-03-08-1440.xml`,
  // which has a 1 341-second one.
  const withDropout = profile({
    duration: 3000,
    depth: {
      times: [0, 300, 600, 900, 2400, 2700, 3000],
      values: [0, 2000, 3000, 3000, 1000, 500, 0],
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
  // margin and gridlines running out of it. Swept over every non-empty selection
  // of the ten channels rather than pinned at that one, because "which channel
  // labels which edge" is a rule whose failing combination was not the obvious
  // one - and the six that take no edge are swept too, since "this selection
  // leaves both edges alone" is as much a cell of the table as the other kind.
  //
  // Seeded through the remembered selection rather than by clicking, which is the
  // same path a returning diver takes and needs no 1 023 click sequences.
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

      expect(leftAxisTicks(container).length > 0).toBe(
        distinctScales(keys) > 0,
      );
      expect(rightAxisTicks(container).length > 0).toBe(
        distinctScales(keys) > 1,
      );
    },
  );

  it.each(EVERY_SELECTION)(
    "gives %s a labelled scale wherever it is drawn",
    (_, keys) => {
      // No curve is drawn against nothing. A deco channel the diver switched on
      // is in a panel row, and that row carries its own numbers - which is the
      // half of the rule the depth plot's two edges could never have satisfied.
      window.localStorage.setItem(
        DIVE_PROFILE_SERIES_KEY,
        JSON.stringify(keys),
      );

      const { container } = render(
        <DiveProfileChart profile={everyChannel()} />,
      );

      const expectedRows = [
        keys.some((key) => key === "ndl" || key === "tts") ? "duration" : null,
        keys.includes("ppo2") ? "ppo2" : null,
        keys.some((key) =>
          ["cns", "gradient_factor", "surface_gradient_factor"].includes(key),
        )
          ? "percent"
          : null,
      ].filter((axis) => axis !== null);

      expect(panelRows(container)).toEqual(expectedRows);
      for (const axis of expectedRows) {
        const row = container.querySelector(`[data-deco-panel="${axis}"]`);
        expect(
          row?.querySelectorAll("text[text-anchor='end']").length,
        ).toBeGreaterThan(0);
      }
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
      { time: 1500, type: "bookmark" },
      { time: 3200, type: "bookmark" },
      { time: 6000, type: "gas_switch", gas_number: 1 },
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
      { time: 600, type: "gas_switch", gas_number: 2 },
      { time: 1500, type: "bookmark" },
      { time: 2400, type: "safety_stop" },
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
    temperature: { times: [0, 300, 600, 900], values: [260, 250, 240, 235] },
  });
  const withMarkers = longProfile({
    temperature: { times: [0, 300, 600, 900], values: [260, 250, 240, 235] },
    events: [{ time: 600, type: "bookmark" }],
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
          ceiling: { times: [1200, 1210, 1220], values: [300, 300, 320] },
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
        profile={longProfile({ events: [{ time: 600, type: "bookmark" }] })}
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
    duration: 3000,
    depth: null,
    temperature: null,
    pressures: [],
    events: [{ time: 600, type: "bookmark" }],
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
    events: [{ time: 600, type: "bookmark" }],
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

describe("DiveProfileChart deco readouts", () => {
  // t = 600 s is the third sample of `everyChannel`, so every channel has a real
  // reading there and none of them is interpolated.
  const hoverOverTheThirdSample = () => {
    render(<DiveProfileChart profile={everyChannel()} />);
    hoverAt(600 / 3000);
  };

  it("quotes every channel that is switched on, each in its own unit", () => {
    hoverOverTheThirdSample();

    // Minutes rather than the seconds the wire carries, two decimals of bar for
    // a ppO₂, and a percent sign attached the way a degree is.
    expect(readoutText()).toMatch(/30 min No-deco time/);
    expect(readoutText()).toMatch(/0 min Time to surface/);
    expect(readoutText()).toMatch(/1\.10 bar ppO₂/);
    expect(readoutText()).toMatch(/2\.4% CNS/);
    expect(readoutText()).toMatch(/12% Gradient factor/);
    expect(readoutText()).toMatch(/30% Surface gradient factor/);
  });

  it("stops quoting a channel the diver switched off", () => {
    // Hiding a thing hides it everywhere: the curve, the crosshair readout and
    // the accessible summary all read one visibility. This chart has been talked
    // out of the "drawn in one view, named in another" disagreement several
    // times over, and a new channel is a new way back into it.
    hoverOverTheThirdSample();
    expect(readoutText()).toMatch(/No-deco time/);

    fireEvent.click(screen.getByRole("button", { name: CHANNEL_BUTTONS.ndl }));
    hoverAt(600 / 3000);

    expect(readoutText()).not.toMatch(/No-deco time/);
    expect(readoutText()).toMatch(/Time to surface/);
  });

  it("names the shown deco channels in the accessible summary, and only those", () => {
    render(<DiveProfileChart profile={everyChannel()} />);

    const summary = () =>
      screen.getByRole("img").getAttribute("aria-label") ?? "";

    // **Which extreme says something is per quantity.** A maximum NDL is the
    // device's display cap on almost every recreational dive; the minimum is the
    // moment the dive came closest to an obligation.
    expect(summary()).toMatch(/no-decompression time down to 0 minutes/);
    expect(summary()).toMatch(/time to surface up to 18 minutes/);
    expect(summary()).toMatch(/oxygen partial pressure up to 1\.32 bar/);
    expect(summary()).toMatch(/CNS to 12\.4 percent/);
    expect(summary()).toMatch(/gradient factor to 98 percent/);
    expect(summary()).toMatch(/surface gradient factor to 84 percent/);

    fireEvent.click(screen.getByRole("button", { name: CHANNEL_BUTTONS.cns }));

    expect(summary()).not.toMatch(/CNS to/);
    expect(summary()).toMatch(/gradient factor to 98 percent/);
  });

  it("numbers each panel row in the unit its curves are in", () => {
    const { container } = render(<DiveProfileChart profile={everyChannel()} />);

    // The top tick of a row carries the unit; the bottom one is a bare number,
    // because two units on one 46-unit scale is noise.
    const topTick = (axis: string) =>
      container.querySelector(`[data-deco-panel="${axis}"] text`)
        ?.textContent ?? "";

    expect(topTick("duration")).toMatch(/ min$/);
    expect(topTick("ppo2")).toMatch(/ bar$/);
    expect(topTick("percent")).toMatch(/%$/);
  });

  it("keeps a gradient factor the device wrote past 100 %", () => {
    // A Suunto Ocean's `gf99` reaches five figures on a decompression ascent.
    // The axis stretches; the reading is not clamped, because a cap would be a
    // guess wearing a plausible number.
    render(
      <DiveProfileChart
        profile={everyChannel({
          gradient_factor: {
            times: [0, 300, 600],
            values: [40, 12575, 90],
          },
        })}
      />,
    );

    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /gradient factor to 12575 percent/,
    );
  });

  it("offers no toggle for a channel this dive's computer never recorded", () => {
    render(<DiveProfileChart profile={longProfile()} />);

    expect(
      screen.queryByRole("button", { name: CHANNEL_BUTTONS.ndl }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: CHANNEL_BUTTONS.depth }),
    ).toBeTruthy();
  });
});

describe("DiveProfileChart with a marker carrying no type", () => {
  // DiveJSON §6.6 makes `type` optional and spells "the device recorded
  // something and nothing in the vocabulary says what" as an absent type beside
  // a required label. The API used to send `other` for exactly this and now
  // sends a null, so a marker with no type is the ordinary case rather than a
  // broken payload - and it has to draw, and read, on its own wording.
  const withTypeless = longProfile({
    events: [{ time: 1500, type: null, label: "Violated Deep Stop" }],
  });

  it("draws it and names it by the device's own wording", () => {
    render(<DiveProfileChart profile={withTypeless} />);
    hoverAt(1500 / 3000);

    expect(readoutText()).toMatch(/Violated Deep Stop/);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(
      /Violated Deep Stop at/,
    );
  });

  it("draws the alarm classes it does know", () => {
    render(
      <DiveProfileChart
        profile={longProfile({
          events: [
            { time: 1500, type: "ceiling_violation", label: "Ceiling Broken" },
          ],
        })}
      />,
    );
    hoverAt(1500 / 3000);

    // The vocabulary's word, not the vendor's spelling: one value per distinct
    // meaning is the whole reason the enum is not one entry per vendor string.
    expect(readoutText()).toMatch(/Deco ceiling broken/);
  });
});

describe("DiveProfileChart deco panel scales", () => {
  // A gradient factor five orders of magnitude over a CNS clock, which is not a
  // made-up shape: a Suunto Ocean's `gf99` reaches five figures on a
  // decompression ascent, and the API stores it as the device wrote it.
  const lopsided = everyChannel({
    gradient_factor: { times: [0, 300, 600], values: [40, 12575, 90] },
    cns: { times: [0, 300, 600], values: [0, 80, 124] },
  });

  const topTick = (container: HTMLElement, axis: string) =>
    container.querySelector(`[data-deco-panel="${axis}"] text`)?.textContent ??
    "";

  it("takes a row's scale from the channels on it that are shown", () => {
    // Unlike the depth axis, which is computed from the ceiling whether or not
    // the ceiling is plotted: there the hidden channel is bounded by the visible
    // one, so feeding it in costs nothing and keeps the axis still. A gradient
    // factor is no such bound, and letting a hidden one set this scale would
    // draw the CNS clock as a flat line on the baseline.
    //
    // The percent axis's own 200 % ceiling does not make this rule redundant, and
    // these two numbers are why: a hidden gradient factor would still take the
    // row from a CNS clock's 12.5 % to the full band.
    const { container } = render(<DiveProfileChart profile={lopsided} />);
    expect(Number.parseFloat(topTick(container, "percent"))).toBe(200);

    fireEvent.click(
      screen.getByRole("button", { name: CHANNEL_BUTTONS.gradient_factor }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: CHANNEL_BUTTONS.surface_gradient_factor,
      }),
    );

    expect(Number.parseFloat(topTick(container, "percent"))).toBeLessThan(100);
  });

  it("rounds a fractional scale instead of printing its float noise", () => {
    // `Math.ceil(1.32 / 0.2) * 0.2` is 1.4000000000000001. `axisTicks` is where
    // that is already solved, and reading the domain's ends off it rather than
    // off `domain` directly is what keeps the solution in one place.
    const { container } = render(<DiveProfileChart profile={lopsided} />);

    expect(topTick(container, "ppo2")).toMatch(/^\d+(\.\d{1,2})? bar$/);
  });
});

describe("DiveProfileChart with a gradient factor past the percent axis's bound", () => {
  // Dive `019fcee1-2219-76df-9e5c-b20e3473f304` in shape: a Suunto Ocean `gf99`
  // running to 14 060 % across a third of the ascent, beside the surface gradient
  // factor that peaks near 170 and is the channel carrying the readable story.
  // Neither figure is invented - `plans/suunto-ocean-gf99.md` in the umbrella
  // establishes the reading as a device fault across a 79-dive corpus, in which
  // GF99 <= surface GF holds on every sample of the 75 clean dives and fails on
  // two samples in five of the four broken ones.
  //
  // No CNS, which is not tidiness: the Suunto JSON carries none, so on this dive
  // the percent row holds the two gradient factors and nothing else.
  const times = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000];
  const brokenGf = everyChannel({
    cns: null,
    gradient_factor: {
      times,
      values: [0, 40, 94, 220, 747, 14060, 6936, 334, 199, 120, 88],
    },
    surface_gradient_factor: {
      times,
      values: [0, 20, 60, 110, 150, 170, 166, 140, 100, 60, 30],
    },
  });
  // Five of the eleven are above 200 %, which is the same third of the curve the
  // real dive puts off-scale (70 of its 231 readings).
  const OVERRUNNING_SAMPLES = 5;

  const percentRow = (container: HTMLElement) =>
    container.querySelector('[data-deco-panel="percent"]');

  // The row's two rules, top first - `bounds` draws them in that order. Every
  // assertion about leaving the row is measured against these rather than against
  // a constant, so the row can move without the test lying.
  const rowRules = (container: HTMLElement) =>
    [...(percentRow(container)?.querySelectorAll("line") ?? [])].map((rule) =>
      Number(rule.getAttribute("y1")),
    );

  // Every y a channel's polylines pass through. Attribute geometry, not layout -
  // jsdom has no opinion about either, and the SVG's coordinates are the thing
  // being asserted.
  const curveYs = (container: HTMLElement, channel: string) =>
    [...container.querySelectorAll(`g.text-${channel} polyline`)].flatMap(
      (line) =>
        (line.getAttribute("points") ?? "")
          .split(" ")
          .filter(Boolean)
          .map((point) => Number(point.split(",")[1])),
    );

  it("stops the axis at 200 % instead of following the reading to 15 000", () => {
    const { container } = render(<DiveProfileChart profile={brokenGf} />);

    expect(percentRow(container)?.querySelector("text")?.textContent).toBe(
      "200%",
    );
  });

  it("gives the trustworthy channel the row instead of the baseline", () => {
    // The damage being repaired: against an axis fitted to 14 060 the surface
    // gradient factor's whole 170-percent story is 1.1 % of the row's height.
    const { container } = render(<DiveProfileChart profile={brokenGf} />);
    const [top, bottom] = rowRules(container);
    const highest = Math.min(...curveYs(container, "surface-gradient-factor"));

    expect((bottom - highest) / (bottom - top)).toBeGreaterThan(0.8);
  });

  it("draws the overrun leaving the row rather than lying along its top", () => {
    // Smaller y is higher, so this is the curve drawn *past* the row's top rule,
    // where the clip then takes it out of the picture. Clamped, every one of
    // these samples would sit exactly on `top` - and a value flattened against
    // the top edge reads as a measurement at the top edge.
    const { container } = render(<DiveProfileChart profile={brokenGf} />);
    const [top] = rowRules(container);
    const ys = curveYs(container, "gradient-factor");

    expect(ys.filter((y) => y < top)).toHaveLength(OVERRUNNING_SAMPLES);
    // Drawn at the row's own scale on the way out, so 14 060 leaves by much
    // further than 220 does. A clamp, or a second squashed scale above the
    // bound, would collapse that difference.
    expect(Math.min(...ys)).toBeLessThan(top - (rowRules(container)[1] - top));
  });

  it("clips each panel row, so what leaves it leaves the picture", () => {
    const { container } = render(<DiveProfileChart profile={brokenGf} />);
    const reference =
      container
        .querySelector("g.text-gradient-factor")
        ?.getAttribute("clip-path") ?? "";

    // Resolvable as a URL fragment, which is what `clipPrefix`'s strip is for -
    // React spells `useId` with characters that are legal in an `id` and not in
    // the `url(#...)` that has to find it.
    expect(reference).toMatch(/^url\(#[A-Za-z0-9_-]+\)$/);

    const clip = container.querySelector(
      `clipPath[id="${reference.slice(5, -1)}"] rect`,
    );
    expect(Number(clip?.getAttribute("y"))).toBe(rowRules(container)[0]);

    // And not applied to the depth plot, whose domain covers its own curve by
    // construction and whose readout dots sit on its edges - a clip there would
    // halve them.
    expect(
      container.querySelector("g.text-teal")?.getAttribute("clip-path"),
    ).toBeNull();
  });

  it("still quotes what the device wrote, with no dot to hang it on", () => {
    // Property one of the ruling: the axis is bounded and the reading is not. A
    // dot at the sample's own y would land over the depth plot, and one pulled
    // back to the row's top edge would claim the curve is up there.
    const { container } = render(<DiveProfileChart profile={brokenGf} />);
    hoverAt(1500 / 3000);

    expect(readoutText()).toMatch(/14060% Gradient factor/);
    expect(
      container.querySelectorAll("circle.text-gradient-factor"),
    ).toHaveLength(0);
    expect(
      container.querySelectorAll("circle.text-surface-gradient-factor").length,
    ).toBeGreaterThan(0);
  });

  it("leaves a dive whose readings fit exactly as it was", () => {
    // The 75 clean dives of the corpus. `everyChannel`'s gradient factor peaks at
    // 98 and its surface one at 84, so the bound never comes into it: the axis is
    // fitted, and no curve leaves the row.
    const { container } = render(<DiveProfileChart profile={everyChannel()} />);
    const [top] = rowRules(container);

    expect(percentRow(container)?.querySelector("text")?.textContent).not.toBe(
      "200%",
    );
    expect(curveYs(container, "gradient-factor").every((y) => y >= top)).toBe(
      true,
    );
  });
});
