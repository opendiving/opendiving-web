import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiveProfileChart } from "./dive-profile-chart";
import type { DiveProfile, DiveProfileEvent } from "@/lib/api/dives";

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
