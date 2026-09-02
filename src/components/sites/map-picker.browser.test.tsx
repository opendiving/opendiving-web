import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "vitest/browser";
import type { Mock } from "vitest";

import { MapPicker } from "./map-picker";
import { resolveBasemap, type BasemapConfig, type LatLon } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";
import {
  formatCoordinateForForm,
  parseFormPosition,
} from "@/lib/validations/dive-site";

// **Load-bearing, and it looks like a stray import.** Nothing in the browser
// project loads this app's Tailwind - it arrives only through `app/layout.tsx`,
// which no test renders - so without this line every Tailwind class in the tree
// computes to nothing. The theme guard at the bottom of this file asserts an
// *absence*, that no element carries a CSS `filter`, and the regression it
// guards against is a pair of Tailwind classes: unloaded, they compute to
// `filter: none` whether present or not and the guard cannot fail.
//
// **It governs the geometry too now, which it did not use to.** The `beforeAll`
// stylesheet below still fixes the *surface* at 512x256 and still wins there,
// deliberately - but it no longer says anything about the map's own box, and
// `MapCanvas` fills that box with `absolute inset-0 grid`, which is Tailwind and
// arrives here only through this line. Removing the import therefore fails two
// tests outright rather than quietly disarming one: the container measures 512x0
// and both "sizes its map to the surface" and the crosshair's real click go red.
// See "jsdom answers no layout question, and the browser lane only answers one
// with the stylesheet loaded" in DECISIONS.md.
import "@/app/globals.css";

// **A real browser, not jsdom.** The picker draws through MapLibre, which needs
// a WebGL2 context - so this file belongs to the browser project
// (`vitest.config.mts`), which is why it is named `.browser.test.tsx`.
//
// What only a render reaches is the round trip this component has with the form
// it writes into: a position it emitted comes back as a prop, and it has to tell
// that echo apart from the diver having typed one. Getting it wrong is not a
// crash - the map just quietly drags itself out from under the cursor on every
// click - so it needs a test rather than a careful reading. The rest of what is
// here is the behaviour MapLibre does *not* supply: where a zoom with no pointer
// behind it is anchored, the keyboard, the crosshair, and the fact that one
// finger belongs to the page.

// Every test mounts a map. The bundled style fetches from `tiles.openfreemap.org`,
// which is a real network dependency in a unit suite, so it is replaced with one
// that draws nothing and asks for nothing: none of the behaviour below is about
// cartography arriving.
const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

const OFFLINE: BasemapConfig = {
  styleUrl: EMPTY_STYLE,
  attribution:
    "[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)",
};

// **The geometry every pointer test below is written against, and it overrides
// the app's own on purpose.** Tailwind now reaches this file - see the
// `globals.css` import above - so the picker's `relative h-40 w-full` would
// otherwise size the surface from the window, and every client coordinate here
// would move with the runner's viewport. A fixed 512x256 is what makes
// `clientAt(x, y)` mean the same thing on every machine, so this rule stays and
// deliberately wins: it is unlayered, and Tailwind's output sits inside
// `@layer utilities`.
//
// **A second rule used to sit under it, and it was standing in for a defect.**
// It forced `position: absolute; inset: 0` onto the map's container, because
// `MapCanvas` put those on the element it handed MapLibre and MapLibre's own
// unlayered `.maplibregl-map { position: relative }` outranked them - so the
// container collapsed to zero height, MapLibre's per-axis fallback drew a
// 512x300 canvas clipped outside the box its ancestors occupy, and a real
// Playwright click hit-tested onto `<body>` and never landed. The harness was
// quietly supplying the layout the app could not. `map-canvas.tsx` now keeps the
// app's layout on an element MapLibre never touches, so the rule is gone and
// every coordinate below is measured against the component's real geometry. If
// that fix regresses, this file goes red rather than staying comfortable: see
// "sizes its map to the surface, with no help from this stylesheet" at the
// bottom.
const FRAME = { width: 512, height: 256 };

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = `
    [role="application"] {
      position: relative;
      width: ${FRAME.width}px;
      height: ${FRAME.height}px;
    }
  `;
  document.head.append(style);
});

// The Blue Hole, and a Bali site to type your way to and back from.
const BLUE_HOLE = { latitude: 28.5717, longitude: 34.5372 };
const BALI = { latitude: -8.2762, longitude: 115.5936 };

interface Harness {
  onPick: Mock<(position: LatLon) => void>;
  at: (position: { latitude: number; longitude: number } | null) => void;
}

function renderPicker(
  initial: { latitude: number; longitude: number } | null = null,
): Harness {
  const onPick = vi.fn<(position: LatLon) => void>();
  const picker = (position: typeof initial) => (
    <ConfigProvider config={{ basemap: resolveBasemap(OFFLINE) }}>
      <MapPicker
        latitude={position?.latitude ?? null}
        longitude={position?.longitude ?? null}
        onPick={onPick}
      />
    </ConfigProvider>
  );
  const { rerender } = render(picker(initial));
  return { onPick, at: (position) => rerender(picker(position)) };
}

const surface = () => screen.getByRole("application");

/**
 * The element MapLibre measures every pointer position against.
 *
 * `DOM.mousePos` takes `map.getCanvas().getBoundingClientRect()`, so a test that
 * wants to press at a particular place in the map has to offer client
 * coordinates relative to the same box - which the stylesheet above makes
 * `FRAME`.
 */
const canvas = () =>
  document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas")!;

const frame = () => canvas().getBoundingClientRect();

const clientAt = (x: number, y: number) => {
  const box = frame();
  return { clientX: box.left + x, clientY: box.top + y };
};

const surfaceReady = () => waitFor(() => expect(canvas()).not.toBeNull());

// Long enough for a camera MapLibre is easing rather than jumping. Its wheel
// zoom smooths over about 200 ms; nothing else here is animated at all, since
// every camera call this component makes passes `duration: 0`.
const settled = () => new Promise((resolve) => setTimeout(resolve, 500));

// MapLibre's own listeners sit on the canvas container, so that is where a real
// pointer's events land. Untrusted events by construction - `preventDefault` on
// one changes nothing the browser would have done - which costs nothing here:
// every assertion below is about what the app's handlers did, and coordinates
// have to be exact in a way no CDP gesture would let them be.
const target = () =>
  document.querySelector<HTMLElement>(".maplibregl-canvas-container")!;

const clickMap = (x: number, y: number) => {
  const element = target();
  fireEvent.mouseDown(element, { button: 0, buttons: 1, ...clientAt(x, y) });
  fireEvent.mouseUp(element, { button: 0, buttons: 0, ...clientAt(x, y) });
  fireEvent.click(element, { button: 0, ...clientAt(x, y) });
};

const dragMap = (
  from: [number, number],
  to: [number, number],
  release = true,
) => {
  const element = target();
  fireEvent.mouseDown(element, { button: 0, buttons: 1, ...clientAt(...from) });
  fireEvent.mouseMove(element, { button: 0, buttons: 1, ...clientAt(...to) });
  if (release) {
    fireEvent.mouseUp(element, { button: 0, buttons: 0, ...clientAt(...to) });
    fireEvent.click(element, { button: 0, ...clientAt(...to) });
  }
};

const touchEvent = (
  type: "touchstart" | "touchmove" | "touchend",
  down: [number, number][],
  changed: [number, number][] = down,
) => {
  const element = target();
  const asTouch = ([x, y]: [number, number], index: number) =>
    new Touch({ identifier: index, target: element, ...clientAt(x, y) });
  const touches = down.map(asTouch);
  return new TouchEvent(type, {
    touches,
    targetTouches: touches,
    changedTouches: changed.map(asTouch),
    bubbles: true,
    cancelable: true,
  });
};

const touch = (
  type: "touchstart" | "touchmove" | "touchend",
  down: [number, number][],
  changed?: [number, number][],
) => fireEvent(target(), touchEvent(type, down, changed));

// Where the pin is drawn inside the frame. MapLibre writes the marker's position
// as a transform of its own, and rounds it to whole pixels off a moveend - hence
// the one-pixel tolerances below rather than exact comparisons.
const markerOffset = () => {
  const marker = document.querySelector<HTMLElement>('[data-marker="pin"]');
  const match = marker?.style.transform.match(
    /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/,
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

const PROBE_SPAN = 200;

/**
 * The camera's zoom, read back through the only channel this component offers.
 *
 * A placement reports the position under a screen point, and MapLibre's mercator
 * x is linear in longitude - so two placements on the same row give the scale,
 * and the scale is the zoom: the world is `512 * 2 ** zoom` pixels wide in
 * MapLibre's units. Placing does not move the camera, which is what makes this a
 * probe rather than an intervention; it does leave `onPick` two calls longer,
 * so it goes last in any test that counts them.
 */
const zoomOf = (onPick: Harness["onPick"]) => {
  const first = onPick.mock.calls.length;
  clickMap(80, 60);
  clickMap(80 + PROBE_SPAN, 60);
  const west = onPick.mock.calls[first][0].longitude;
  const east = onPick.mock.calls[first + 1][0].longitude;
  return Math.log2((360 * PROBE_SPAN) / (512 * (east - west)));
};

describe("MapPicker", () => {
  it("places a rounded position where the map was clicked", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();

    clickMap(300, 100);

    expect(onPick).toHaveBeenCalledTimes(1);
    const [position] = onPick.mock.calls[0];
    // Five decimals is ~1.1 m, and it has to be exact so the value that comes
    // back through the form is comparable to the one that went out.
    expect(String(position.latitude)).toMatch(/^-?\d+(\.\d{1,5})?$/);
    expect(String(position.longitude)).toMatch(/^-?\d+(\.\d{1,5})?$/);
  });

  // The invariant `MAX_LATITUDE` used to protect from inside the projection, now
  // that MapLibre owns the projection and bounds neither value: an emitted pair
  // has to survive the round trip through the form's own strings, or a placement
  // comes back as no position at all.
  it("emits only positions the form's own parser accepts", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();

    const { width, height } = frame();
    for (const [x, y] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
      [width / 2, height / 2],
    ] as [number, number][]) {
      clickMap(x, y);
    }

    expect(onPick.mock.calls.length).toBe(5);
    for (const [position] of onPick.mock.calls) {
      const parsed = parseFormPosition(
        formatCoordinateForForm(position.latitude),
        formatCoordinateForForm(position.longitude),
      );
      expect(parsed).not.toBeNull();
      // Numerically rather than `toEqual`, which separates `-0` from `0`. A
      // click on the prime meridian emits `-0` and `String(-0)` is `"0"`, so the
      // round trip normalises the sign of a zero - the same position by every
      // rule that matters, including the `===` the echo record compares with.
      expect(parsed!.latitude).toBeCloseTo(position.latitude, 10);
      expect(parsed!.longitude).toBeCloseTo(position.longitude, 10);
    }
  });

  it("does not move when its own placement comes back as a prop", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();

    clickMap(300, 100);
    const [placed] = onPick.mock.calls[0];
    // What the form does with it: store it, hand it straight back.
    at(placed);

    // The pin is still sitting where the click landed rather than snapped to
    // the centre, which is the whole of "the map did not move".
    expect(markerOffset()!.x).toBeCloseTo(300, 0);
    expect(markerOffset()!.y).toBeCloseTo(100, 0);
  });

  it("follows a position that came from somewhere else", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();

    // The Blue Hole, typed into the latitude/longitude fields by hand.
    at(BLUE_HOLE);

    const { width, height } = frame();
    expect(markerOffset()!.x).toBeCloseTo(width / 2, 0);
    expect(markerOffset()!.y).toBeCloseTo(height / 2, 0);
    // A site that had no position is worth zooming in on.
    expect(zoomOf(onPick)).toBeCloseTo(11, 3);
  });

  it("keeps the zoom the diver chose when an existing position is edited", async () => {
    const { onPick, at } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoomOf(onPick)).toBeCloseTo(9, 3);

    // Correcting one digit must not slam a deliberately wide view back to
    // street level - `useWatch` fires this once per keystroke.
    at({ ...BLUE_HOLE, longitude: 34.6 });

    expect(zoomOf(onPick)).toBeCloseTo(9, 3);
  });

  it("keeps the zoom across a half-typed coordinate", async () => {
    const { onPick, at } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoomOf(onPick)).toBeCloseTo(9, 3);

    // Backspacing a longitude to "34." is not a position, so the field passes
    // (null, null) for that render. Reading "was null last render" as "first
    // placement" would zoom the next keystroke back to street level.
    at(null);
    at({ ...BLUE_HOLE, longitude: 34.5 });

    expect(zoomOf(onPick)).toBeCloseTo(9, 3);
  });

  it("follows a position it once emitted, after the map has moved on", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();

    clickMap(300, 100);
    const [placed] = onPick.mock.calls[0];
    at(placed);

    // Typed somewhere else entirely, then typed back by hand.
    at(BALI);

    // The second arrival is a diver typing, not an echo - the echo was spent
    // the first time. A remembered one that was never cleared would match here
    // too, leaving the map over Bali with the pin a world off-screen.
    at(placed);
    const { width, height } = frame();
    expect(markerOffset()!.x).toBeCloseTo(width / 2, 0);
    expect(markerOffset()!.y).toBeCloseTo(height / 2, 0);
  });

  it("does not leave an echo armed by a placement that changed nothing", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();

    // Enter places at the centre; pressing it twice emits the same position,
    // and the second emit has no props change coming to consume it.
    fireEvent.keyDown(surface(), { key: "Enter" });
    const [placed] = onPick.mock.calls[0];
    at(placed);
    fireEvent.keyDown(surface(), { key: "Enter" });

    at(BALI);
    at(placed);

    // Typed back by hand, so the map follows and the pin is on screen.
    const { width, height } = frame();
    expect(markerOffset()!.x).toBeCloseTo(width / 2, 0);
    expect(markerOffset()!.y).toBeCloseTo(height / 2, 0);
  });

  // A cleared position is the one outside change that must *not* move the view:
  // there is nowhere to follow to, and jumping somewhere arbitrary because a
  // field was emptied is worse than staying put.
  it("drops the pin without moving the view when the fields are cleared", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();

    clickMap(300, 100);
    const [placed] = onPick.mock.calls[0];
    at(placed);
    const before = zoomOf(onPick);

    at(null);

    expect(markerOffset()).toBeNull();
    expect(zoomOf(onPick)).toBeCloseTo(before, 6);
  });

  // **Anchored zoom, which nothing else in this file would catch.** MapLibre's
  // `easeTo` zooms about the centre unless `around` is passed, so a port that
  // dropped it would leave these two reading as renderer-specific.
  it("holds the pin still while zooming, rather than the centre", async () => {
    const { onPick, at } = renderPicker();
    await surfaceReady();
    // A pin well off-centre, as a tap on a phone leaves it.
    clickMap(340, 60);
    const [placed] = onPick.mock.calls[0];
    at(placed);
    const before = markerOffset()!;

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    // Zooming about the centre would push the pin twice as far out on every
    // press; on touch, where one finger does not pan, walking the site off
    // screen would be unrecoverable.
    expect(markerOffset()!.x).toBeCloseTo(before.x, 0);
    expect(markerOffset()!.y).toBeCloseTo(before.y, 0);
  });

  it("zooms about the centre once the pin has been panned away from", async () => {
    renderPicker(BLUE_HOLE);
    await surfaceReady();
    const { width } = frame();

    // Pan far enough that the pin leaves the frame, as a diver does when the
    // site is being moved to a different bay.
    dragMap([width - 40, 150], [20, 150]);
    await waitFor(() => expect(markerOffset()!.x).toBeLessThan(0));

    const offsetBefore = markerOffset()!.x - width / 2;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const offsetAfter = markerOffset()!.x - width / 2;

    // Centre-anchored: the off-screen pin's distance from the centre doubles
    // with the scale, which is what keeps whatever the diver panned to under
    // the crosshair. Pin-anchored - correct while the pin is visible, wrong
    // here - would instead hold that distance fixed and throw the target out.
    expect(offsetAfter).toBeCloseTo(offsetBefore * 2, 0);
  });

  // The `role="application"` contract, and the crosshair's focus state machine.
  // MapLibre owns its own container, so the element a screen reader is asked to
  // hand the arrow keys to is this component's, and the crosshair has to be
  // inside it - not a detail the selector should be relaxed about.
  it("shows the crosshair once the keyboard takes over, and not before", async () => {
    renderPicker();
    await surfaceReady();
    const crosshair = () =>
      document.querySelector(
        '[role="application"] > [aria-hidden][data-testid="crosshair"]',
      );

    // **Real input, unlike the rest of this file, and it has to be.**
    // `:focus-visible` is the browser's own judgement about the last input
    // modality, and a dispatched `MouseEvent` does not change that judgement:
    // programmatic focus with no trusted interaction behind it *does* match
    // `:focus-visible`, so a synthesised click reads as a keyboard diver and the
    // crosshair appears after all. Everything else here dispatches events
    // because it needs exact coordinates; this one needs a real mouse and a real
    // key, and the click lands wherever Playwright puts it.
    await userEvent.click(canvas());
    expect(crosshair()).toBeNull();

    await userEvent.keyboard("{ArrowUp}");
    expect(crosshair()).not.toBeNull();

    // ...and it goes away again as soon as the mouse comes back.
    await userEvent.click(canvas());
    expect(crosshair()).toBeNull();
  });

  it("says out loud where a keyboard placement landed", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();
    fireEvent.keyDown(surface(), { key: "Enter" });

    // Nothing else confirms it: the coordinates land in two inputs elsewhere in
    // the dialog, and the geocode suggestion never arrives with no geocoder.
    const [placed] = onPick.mock.calls[0];
    expect(screen.getByRole("status")).toHaveTextContent(
      `Placed at ${placed.latitude}, ${placed.longitude}`,
    );
  });

  it("announces a second placement at the same spot too", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();
    fireEvent.keyDown(surface(), { key: "Enter" });
    const first = screen.getByRole("status").textContent;

    fireEvent.keyDown(surface(), { key: "Enter" });

    // A live region only speaks when its text changes, so an identical string
    // would confirm the second keypress with silence.
    expect(screen.getByRole("status").textContent).not.toBe(first);
    expect(screen.getByRole("status")).toHaveTextContent(
      `Placed at ${onPick.mock.calls[1][0].latitude}`,
    );
  });

  it("places at the crosshair on Enter, so the map is not mouse-only", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();
    fireEvent.keyDown(surface(), { key: "Enter" });

    expect(onPick).toHaveBeenCalledTimes(1);
    // The centre of the default view, which is what the crosshair marks.
    const [position] = onPick.mock.calls[0];
    expect(position.latitude).toBeCloseTo(20, 4);
    expect(position.longitude).toBeCloseTo(0, 4);
  });

  it("pans on the arrow keys, and leaves the browser's own shortcuts alone", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = zoomOf(onPick);

    // Ctrl/Cmd with -/= is page zoom, and alt with an arrow is back/forward.
    // The map takes focus on any press, so it is easy to land here without ever
    // meaning to use the keyboard.
    fireEvent.keyDown(surface(), { key: "-", ctrlKey: true });
    fireEvent.keyDown(surface(), { key: "=", metaKey: true });
    fireEvent.keyDown(surface(), { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(surface(), { key: "Enter", ctrlKey: true });
    expect(zoomOf(onPick)).toBeCloseTo(before, 6);
    expect(markerOffset()!.x).toBeCloseTo(frame().width / 2, 0);

    // A plain arrow moves the view, so the pin goes the other way.
    fireEvent.keyDown(surface(), { key: "ArrowRight" });
    await waitFor(() =>
      expect(markerOffset()!.x).toBeCloseTo(frame().width / 2 - 60, 0),
    );

    // Shift stays allowed: `+` needs it on most layouts.
    fireEvent.keyDown(surface(), { key: "+", shiftKey: true });
    expect(zoomOf(onPick)).toBeCloseTo(before + 1, 3);
  });

  // The 5 px slop the hand-rolled gesture handler used, kept as MapLibre's
  // `clickTolerance` - which defaults to 3. A wobble is a placement and a drag
  // is not, and there is no third answer that both tests could pass.
  it("still places through a wobble, and pans instead of placing at 6 px", async () => {
    const { onPick } = renderPicker();
    await surfaceReady();

    dragMap([300, 100], [304, 100]);
    expect(onPick).toHaveBeenCalledTimes(1);

    dragMap([300, 100], [294, 100]);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("pans instead of placing when the pointer moved", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = markerOffset()!;

    dragMap([300, 100], [180, 100]);

    expect(onPick).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(markerOffset()!.x).toBeCloseTo(before.x - 120, 0),
    );
  });

  // MapLibre's drag handler adds inertia; this app's never had any, and on a
  // control where the next click places a pin a map still gliding is a pin in
  // the wrong bay.
  it("stops panning the moment the pointer lifts", async () => {
    renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = markerOffset()!;

    dragMap([300, 100], [180, 100]);
    await waitFor(() =>
      expect(markerOffset()!.x).toBeCloseTo(before.x - 120, 0),
    );

    // A fling would still be easing here, tens of pixels further on.
    await settled();
    expect(markerOffset()!.x).toBeCloseTo(before.x - 120, 0);
  });

  it("zooms on ctrl+wheel and leaves a plain wheel to the dialog", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = zoomOf(onPick);

    // A plain wheel is the diver scrolling toward Save.
    fireEvent.wheel(target(), { deltaY: -100, ...clientAt(200, 150) });
    await settled();
    expect(zoomOf(onPick)).toBeCloseTo(before, 6);

    // Ctrl+wheel is the explicit gesture - and what a trackpad pinch sends.
    // Waited out rather than polled: `zoomOf` places two pins to read the scale,
    // so retrying it inside a `waitFor` fires a placement every 50 ms for as long
    // as the assertion is false, which is how this test first hung the suite.
    fireEvent.wheel(target(), {
      deltaY: -100,
      ctrlKey: true,
      ...clientAt(200, 150),
    });
    await settled();
    // Only the *split* is this app's: how far one notch goes is MapLibre's
    // wheel-rate, which differs between a mouse and a trackpad and is none of
    // this component's business.
    expect(zoomOf(onPick)).toBeGreaterThan(before + 0.1);
  });

  // One finger belongs to the page: the map covers most of a `overflow-y-auto`
  // dialog on a phone, and a thumb landing on it has to be able to scroll past
  // to reach Save. The hint is the app's own, not MapLibre's - which draws a
  // screen of its own for the same event, and for a blocked wheel besides.
  it("leaves one finger to the page, and says so", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = markerOffset()!;

    touch("touchstart", [[300, 100]]);
    touch("touchmove", [[180, 100]]);

    await waitFor(() =>
      expect(
        screen.getByText("Use two fingers to move the map"),
      ).toBeInTheDocument(),
    );
    expect(markerOffset()!.x).toBeCloseTo(before.x, 0);
  });

  it("pans the map when two fingers travel together", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = markerOffset()!;

    touch("touchstart", [
      [200, 128],
      [300, 128],
    ]);
    touch("touchmove", [
      [260, 128],
      [360, 128],
    ]);

    // Two fingers are the only way to pan on touch, so the magnitude matters:
    // the map must travel with them, not a rounding error's worth.
    await waitFor(() =>
      expect(markerOffset()!.x).toBeCloseTo(before.x + 60, 0),
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it("does not nag about two fingers at the tail of a pinch", async () => {
    renderPicker(BLUE_HOLE);
    await surfaceReady();

    touch("touchstart", [
      [200, 128],
      [300, 128],
    ]);
    touch("touchmove", [
      [150, 128],
      [350, 128],
    ]);

    // Fingers rarely leave together, so the second half of a pinch is one
    // finger moving - which must not be read as someone who needs telling.
    touch("touchend", [[350, 128]], [[150, 128]]);
    touch("touchmove", [[340, 128]]);

    await settled();
    expect(
      screen.queryByText("Use two fingers to move the map"),
    ).not.toBeInTheDocument();
  });

  it("credits the basemap with links that can actually be followed", async () => {
    renderPicker();
    await surfaceReady();

    const osm = screen.getByRole("link", {
      name: /OpenStreetMap contributors/,
    });
    expect(osm).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    // The map lives in a dialog holding a half-filled form; navigating away in
    // the same tab would throw it away.
    expect(osm).toHaveAttribute("target", "_blank");
    expect(osm).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  // Structural now rather than a guard in a gesture handler: the credit is a
  // sibling of MapLibre's canvas container rather than a child, so a press on it
  // never reaches the renderer at all. Worth a test anyway - the arrangement is
  // easy to undo by moving one element inside `MapCanvas`.
  it("does not start a gesture on the attribution links", async () => {
    const { onPick } = renderPicker(BLUE_HOLE);
    await surfaceReady();
    const before = markerOffset()!;

    const link = screen.getByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    fireEvent.mouseDown(link, { button: 0, buttons: 1, ...clientAt(480, 240) });
    fireEvent.mouseMove(target(), {
      button: 0,
      buttons: 1,
      ...clientAt(200, 240),
    });
    fireEvent.mouseUp(target(), {
      button: 0,
      buttons: 0,
      ...clientAt(200, 240),
    });

    await settled();
    expect(onPick).not.toHaveBeenCalled();
    expect(markerOffset()!.x).toBeCloseTo(before.x, 0);
  });

  // Exactly one credit on screen. MapLibre ships its own `AttributionControl`
  // and renders it as HTML, which this repo will not do.
  it("shows one attribution, not MapLibre's as well", async () => {
    renderPicker();
    await surfaceReady();
    expect(document.querySelectorAll(".maplibregl-ctrl-attrib").length).toBe(0);
  });

  // The dark theme is a different *style* now, not a CSS filter over the light
  // one. Asserted as an absence, because an `invert` left behind would go
  // unnoticed against a dark basemap until somebody switched providers.
  it("filters nothing, in either theme", async () => {
    renderPicker(BLUE_HOLE);
    await surfaceReady();

    const box = surface();
    for (const element of [box, ...box.querySelectorAll("*")]) {
      const { filter } = getComputedStyle(element);
      expect(filter === "none" || filter === "").toBe(true);
    }
  });

  // **What the `beforeAll` stylesheet used to hide.** Every other test in this
  // file presses at coordinates inside `FRAME` and would fail if the map were
  // not under them - but for as long as the harness forced the container to
  // `position: absolute; inset: 0` itself, they were pressing on geometry the
  // test supplied rather than on the component's. That rule is gone, so this
  // asserts directly what the rest of the file now depends on: the map fills the
  // surface the picker gives it, and the crosshair's centre is over the canvas
  // rather than over whatever `overflow: hidden` left showing through.
  it("sizes its map to the surface, with no help from this stylesheet", async () => {
    // No pin: a marker sits exactly on the centre this hit-tests, and it would
    // answer for the canvas underneath it.
    renderPicker();
    await surfaceReady();

    const box = surface().getBoundingClientRect();
    expect(box.width).toBeCloseTo(FRAME.width, 0);
    expect(box.height).toBeCloseTo(FRAME.height, 0);

    const container = document
      .querySelector<HTMLElement>(".maplibregl-map")!
      .getBoundingClientRect();
    expect(container.width).toBeCloseTo(box.width, 0);
    expect(container.height).toBeCloseTo(box.height, 0);
    expect(container.top).toBeCloseTo(box.top, 0);
    expect(container.left).toBeCloseTo(box.left, 0);

    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    expect(canvas().contains(hit) || canvas() === hit).toBe(true);
  });
});
