import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapPicker } from "./map-picker";

// The projection and the tile grid are unit-tested in `lib/map-tiles.test.ts`.
// What only a render reaches is the round trip this component has with the form
// it writes into: a position it emitted comes back as a prop, and it has to tell
// that echo apart from the diver having typed one. Getting it wrong is not a
// crash - the map just quietly drags itself out from under the cursor on every
// click - so it needs a test rather than a careful reading.

// The global stub in `vitest.setup.ts` never reports a size, which would leave
// the grid empty and every assertion below vacuous.
const VIEWPORT = { width: 512, height: 256 };
beforeAll(() => {
  window.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, contentRect: VIEWPORT } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// The view isn't exposed, so it is read back off what the map actually asked
// for: the zoom and tile indices in the tile URLs are the centre and scale.
const tiles = () =>
  (screen.getAllByRole("presentation", { hidden: true }) as HTMLImageElement[])
    .map((image) => image.src.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, z, x, y]) => `${z}/${x}/${y}`)
    .sort();

const tileZoomOf = () => Number(tiles()[0].split("/")[0]);

// Zoom is continuous but tiles are not, so the level actually in force is the
// tile level plus whatever the layer has been scaled by to make up the rest.
const zoomOf = () => {
  const layer = screen.getByTestId("tile-layer");
  const scale = Number(layer.style.transform.match(/scale\(([\d.]+)\)/)![1]);
  return tileZoomOf() + Math.log2(scale);
};

// Where the pin is drawn inside the viewport. The tile indices are too coarse
// to see the map move at low zoom - the whole world is two columns wide - but
// the marker offset is exactly what a diver would notice.
const markerOffset = () => {
  const marker = document.querySelector<HTMLElement>(
    '[role="application"] div[style*="translate3d"]',
  );
  const match = marker?.style.transform.match(
    /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/,
  );
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
};

// A press and release with no movement in between, which is a placement.
const clickMap = (surface: HTMLElement, x: number, y: number) => {
  fireEvent.pointerDown(surface, {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX: x,
    clientY: y,
  });
  fireEvent.pointerUp(window, { pointerId: 1, clientX: x, clientY: y });
};

const surface = () => screen.getByRole("application");

describe("MapPicker", () => {
  it("places a rounded position where the map was clicked", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    clickMap(surface(), 300, 100);

    expect(onPick).toHaveBeenCalledTimes(1);
    const [position] = onPick.mock.calls[0];
    // Five decimals is ~1.1 m, and it has to be exact so the value that comes
    // back through the form is comparable to the one that went out.
    expect(String(position.latitude)).toMatch(/^-?\d+(\.\d{1,5})?$/);
    expect(String(position.longitude)).toMatch(/^-?\d+(\.\d{1,5})?$/);
  });

  it("does not move when its own placement comes back as a prop", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={null} longitude={null} onPick={onPick} />,
    );
    const before = tiles();

    clickMap(surface(), 300, 100);
    const [placed] = onPick.mock.calls[0];
    // What the form does with it: store it, hand it straight back.
    rerender(
      <MapPicker
        latitude={placed.latitude}
        longitude={placed.longitude}
        onPick={onPick}
      />,
    );

    // Same tiles, same zoom - the pin moved, the map did not, and the pin is
    // still sitting where the click landed rather than snapped to the centre.
    expect(tiles()).toEqual(before);
    // Not exact: the position was rounded to five decimals on its way out and
    // back, which is worth a fraction of a pixel.
    expect(markerOffset()?.x).toBeCloseTo(300, 3);
    expect(markerOffset()?.y).toBeCloseTo(100, 3);
  });

  it("follows a position that came from somewhere else", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={null} longitude={null} onPick={onPick} />,
    );
    const before = tiles();

    // The Blue Hole, typed into the latitude/longitude fields by hand.
    rerender(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );

    expect(tiles()).not.toEqual(before);
    // A site that had no position is worth zooming in on.
    expect(zoomOf()).toBe(12);
  });

  it("keeps the zoom the diver chose when an existing position is edited", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoomOf()).toBe(10);

    // Correcting one digit must not slam a deliberately wide view back to
    // street level - `useWatch` fires this once per keystroke.
    rerender(<MapPicker latitude={28.5717} longitude={34.6} onPick={onPick} />);

    expect(zoomOf()).toBe(10);
  });

  it("follows a position it once emitted, after the map has moved on", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={null} longitude={null} onPick={onPick} />,
    );

    clickMap(surface(), 300, 100);
    const [placed] = onPick.mock.calls[0];
    const echo = (
      <MapPicker
        latitude={placed.latitude}
        longitude={placed.longitude}
        onPick={onPick}
      />
    );
    rerender(echo);

    // Typed somewhere else entirely, then typed back by hand.
    rerender(
      <MapPicker latitude={-8.2762} longitude={115.5936} onPick={onPick} />,
    );

    // The second arrival is a diver typing, not an echo - the echo was spent
    // the first time. A remembered one that was never cleared would match here
    // too, leaving the map over Bali with the pin a world off-screen and
    // clipped by `overflow-hidden`.
    rerender(echo);
    expect(markerOffset()?.x).toBeCloseTo(VIEWPORT.width / 2, 3);
    expect(markerOffset()?.y).toBeCloseTo(VIEWPORT.height / 2, 3);
  });

  it("keeps the zoom across a half-typed coordinate", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(zoomOf()).toBe(10);

    // Backspacing a longitude to "34." is not a position, so the field passes
    // (null, null) for that render. Reading "was null last render" as "first
    // placement" would zoom the next keystroke back to street level.
    rerender(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    rerender(<MapPicker latitude={28.5717} longitude={34.5} onPick={onPick} />);

    expect(zoomOf()).toBe(10);
  });

  it("does not leave an echo armed by a placement that changed nothing", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={null} longitude={null} onPick={onPick} />,
    );

    // Enter places at the centre; pressing it twice emits the same position,
    // and the second emit has no props change coming to consume it.
    fireEvent.keyDown(surface(), { key: "Enter" });
    const [placed] = onPick.mock.calls[0];
    const echo = (
      <MapPicker
        latitude={placed.latitude}
        longitude={placed.longitude}
        onPick={onPick}
      />
    );
    rerender(echo);
    fireEvent.keyDown(surface(), { key: "Enter" });

    rerender(
      <MapPicker latitude={-8.2762} longitude={115.5936} onPick={onPick} />,
    );
    rerender(echo);

    // Typed back by hand, so the map follows and the pin is on screen.
    expect(markerOffset()?.x).toBeCloseTo(VIEWPORT.width / 2, 3);
    expect(markerOffset()?.y).toBeCloseTo(VIEWPORT.height / 2, 3);
  });

  it("holds the pin still while zooming, rather than the centre", () => {
    const onPick = vi.fn();
    const { rerender } = render(
      <MapPicker latitude={null} longitude={null} onPick={onPick} />,
    );
    // A pin well off-centre, as a tap on a phone leaves it.
    clickMap(surface(), 400, 60);
    const [placed] = onPick.mock.calls[0];
    rerender(
      <MapPicker
        latitude={placed.latitude}
        longitude={placed.longitude}
        onPick={onPick}
      />,
    );
    const before = markerOffset();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    // Zooming about the centre would push the pin twice as far out on every
    // press; on touch, where the map cannot be dragged vertically, walking the
    // site off screen would be unrecoverable.
    expect(markerOffset()?.x).toBeCloseTo(before!.x, 3);
    expect(markerOffset()?.y).toBeCloseTo(before!.y, 3);
  });

  it("zooms about the centre once the pin has been panned away from", () => {
    const onPick = vi.fn();
    render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );
    // Pan far enough that the pin leaves the viewport, as a diver does when
    // the site is being moved to a different bay.
    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 450,
      clientY: 128,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 50, clientY: 128 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 50, clientY: 128 });
    expect(markerOffset()!.x).toBeLessThan(0);

    const offsetBefore = markerOffset()!.x - VIEWPORT.width / 2;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const offsetAfter = markerOffset()!.x - VIEWPORT.width / 2;

    // Centre-anchored: the off-screen pin's distance from the centre doubles
    // with the scale, which is what keeps whatever the diver panned to under
    // the crosshair. Pin-anchored - correct while the pin is visible, wrong
    // here - would instead hold that distance fixed and throw the target out.
    expect(offsetAfter).toBeCloseTo(offsetBefore * 2, 3);
  });

  it("shows the crosshair once the keyboard takes over, and not before", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const crosshair = () =>
      document.querySelector('[role="application"] > [aria-hidden]:not(img)');

    // A mouse click focuses the surface, but a crosshair beside the pin it
    // just placed answers a question nobody with a mouse is asking.
    clickMap(surface(), 300, 100);
    expect(crosshair()).toBeNull();

    fireEvent.keyDown(surface(), { key: "ArrowUp" });
    expect(crosshair()).not.toBeNull();

    // ...and it goes away again as soon as the mouse comes back.
    clickMap(surface(), 200, 120);
    expect(crosshair()).toBeNull();
  });

  it("says out loud where a keyboard placement landed", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    fireEvent.keyDown(surface(), { key: "Enter" });

    // Nothing else confirms it: the coordinates land in two inputs elsewhere in
    // the dialog, and the geocode suggestion never arrives with no geocoder.
    const [placed] = onPick.mock.calls[0];
    expect(screen.getByRole("status")).toHaveTextContent(
      `Placed at ${placed.latitude}, ${placed.longitude}`,
    );
  });

  it("announces a second placement at the same spot too", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
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

  it("never leaves the viewport hanging over a pole", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);

    // At the widest zoom the whole world is 512 px tall, so a short drag is
    // enough to push the top of the map above the north pole - where there are
    // no tiles, and the overhang renders as bare background.
    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 250,
      clientY: 20,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 250, clientY: 400 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 250, clientY: 400 });

    // Two rows of tiles, each fully accounted for: nothing above the first.
    const rows = tiles().map((tile) => Number(tile.split("/")[2]));
    expect(Math.min(...rows)).toBe(0);
    const top = Math.min(
      ...(
        screen.getAllByRole("presentation", {
          hidden: true,
        }) as HTMLImageElement[]
      ).map((image) =>
        Number(image.style.transform.match(/, (-?[\d.]+)px, 0\)/)![1]),
      ),
    );
    expect(top).toBeLessThanOrEqual(0);
  });

  it("credits the tiles with links that can actually be followed", () => {
    render(<MapPicker latitude={null} longitude={null} onPick={vi.fn()} />);

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
    expect(screen.getByRole("link", { name: "© CARTO" })).toHaveAttribute(
      "href",
      "https://carto.com/attributions",
    );
  });

  it("does not start a gesture on the attribution links", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = tiles();

    // `handlePointerDown` calls preventDefault, which suppresses the click that
    // would follow - so a pointerdown swallowed here leaves a dead link.
    const link = screen.getByRole("link", { name: "© CARTO" });
    fireEvent.pointerDown(link, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 400,
      clientY: 200,
    });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 400, clientY: 200 });

    expect(onPick).not.toHaveBeenCalled();
    expect(tiles()).toEqual(before);
  });

  it("pans instead of placing when the pointer moved", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = tiles();

    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 180, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 180, clientY: 100 });

    expect(onPick).not.toHaveBeenCalled();
    expect(tiles()).not.toEqual(before);
  });

  it("zooms on a two-finger pinch, about the centroid", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = zoomOf();

    const touch = (id: number, x: number, y: number) => ({
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
    });
    fireEvent.pointerDown(surface(), touch(1, 200, 128));
    fireEvent.pointerDown(surface(), touch(2, 300, 128));
    // Spread doubles, which is past the 1.5x a whole zoom level costs.
    fireEvent.pointerMove(window, touch(1, 150, 128));
    fireEvent.pointerMove(window, touch(2, 350, 128));

    // Exactly a doubling of the spread, so exactly one level.
    expect(zoomOf()).toBeCloseTo(before + 1, 6);

    fireEvent.pointerUp(window, touch(1, 150, 128));
    fireEvent.pointerUp(window, touch(2, 350, 128));
    // A pinch is not a tap, however still the fingers were at the end.
    expect(onPick).not.toHaveBeenCalled();
  });

  it("pans the map when two fingers travel together", () => {
    const onPick = vi.fn();
    render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );
    const before = markerOffset()!;

    const touch = (id: number, x: number, y: number) => ({
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
    });
    fireEvent.pointerDown(surface(), touch(1, 200, 128));
    fireEvent.pointerDown(surface(), touch(2, 300, 128));
    // Both fingers 60px right. `pointermove` fires once per pointer, so the
    // spread changes on the way - which is exactly the case that used to take
    // the zoom path and drop the pan entirely, moving the map ~2% of the ask.
    fireEvent.pointerMove(window, touch(1, 260, 128));
    fireEvent.pointerMove(window, touch(2, 360, 128));

    // Two fingers are the only way to pan on touch, so the magnitude matters:
    // the map must travel with them, not a rounding error's worth.
    expect(markerOffset()!.x - before.x).toBeCloseTo(60, 0);
    expect(markerOffset()!.y - before.y).toBeCloseTo(0, 0);
    // A pure translation is not a zoom.
    expect(zoomOf()).toBeCloseTo(12, 6);
  });

  it("leaves one finger to the page, and says so", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = tiles();

    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerMove(window, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 180,
      clientY: 100,
    });

    // The map must not move: this drag belongs to the dialog's scroll, which a
    // thumb needs to reach Save.
    expect(tiles()).toEqual(before);
    expect(screen.getByText("Use two fingers to move the map")).toBeVisible();
  });

  it("does not nag about two fingers at the tail of a pinch", () => {
    render(<MapPicker latitude={null} longitude={null} onPick={vi.fn()} />);
    const touch = (id: number, x: number, y: number) => ({
      pointerId: id,
      pointerType: "touch",
      clientX: x,
      clientY: y,
    });

    fireEvent.pointerDown(surface(), touch(1, 200, 128));
    fireEvent.pointerDown(surface(), touch(2, 300, 128));
    fireEvent.pointerMove(window, touch(1, 150, 128));
    fireEvent.pointerMove(window, touch(2, 350, 128));

    // Fingers rarely leave together, so the second half of a pinch is one
    // finger moving - which must not be read as someone who needs telling.
    fireEvent.pointerUp(window, touch(1, 150, 128));
    fireEvent.pointerMove(window, touch(2, 340, 128));

    expect(
      screen.queryByText("Use two fingers to move the map"),
    ).not.toBeInTheDocument();
  });

  it("still places on a tap", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);

    fireEvent.pointerDown(surface(), {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 100,
    });
    fireEvent.pointerUp(window, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 300,
      clientY: 100,
    });

    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it("zooms on ctrl+wheel and leaves a plain wheel to the dialog", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = zoomOf();

    // A plain wheel is the diver scrolling toward Save.
    fireEvent.wheel(surface(), { deltaY: -100 });
    expect(zoomOf()).toBe(before);

    // Ctrl+wheel is the explicit gesture - and what a trackpad pinch sends. One
    // mouse notch is one level.
    fireEvent.wheel(surface(), { deltaY: -100, ctrlKey: true });
    expect(zoomOf()).toBe(before + 1);

    fireEvent.wheel(surface(), { deltaY: 100, metaKey: true });
    expect(zoomOf()).toBe(before);
  });

  it("zooms by a fraction of a level per trackpad event, and glides", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    const before = zoomOf();
    const scales = new Set<string>();

    // A trackpad pinch arrives as a stream of ctrl+wheel events carrying a few
    // pixels each. One whole level per event crossed the entire range in a
    // flick; a hundred pixels per level, applied continuously, is a glide.
    for (let i = 0; i < 20; i++) {
      fireEvent.wheel(surface(), { deltaY: -8, ctrlKey: true });
      scales.add(screen.getByTestId("tile-layer").style.transform);
    }

    expect(zoomOf()).toBeCloseTo(before + 1.6, 6);
    // What this cannot pin: a burst arriving faster than React commits, which
    // is what a 120 Hz trackpad does. `fireEvent` commits between events, and
    // batching them inside one `act` does not reproduce it either - jsdom's
    // scheduling is not the browser's. Verified there instead: thirty events
    // with no gap moved 0.04 levels of the 1.2 asked for before `viewRef`, and
    // the full 1.2 after.
    // The point of the exercise: it passed through intermediate scales rather
    // than snapping between two of them.
    expect(scales.size).toBeGreaterThan(10);
  });

  it("keeps a partial level as a scale on the tile layer", () => {
    const onPick = vi.fn();
    render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );

    fireEvent.wheel(surface(), { deltaY: -30, ctrlKey: true });

    // Three tenths of a level in: still the tiles for level 12, blown up by
    // 2^0.3, rather than a jump to level 13.
    expect(zoomOf()).toBeCloseTo(12.3, 6);
    expect(tileZoomOf()).toBe(12);
  });

  it("leaves the browser's own shortcuts alone", () => {
    const onPick = vi.fn();
    render(
      <MapPicker latitude={28.5717} longitude={34.5372} onPick={onPick} />,
    );
    const before = { zoom: zoomOf(), tiles: tiles() };

    // Ctrl/Cmd with -/= is page zoom, and alt with an arrow is back/forward.
    // The map takes focus on any pointerdown, so it is easy to land here
    // without ever meaning to use the keyboard.
    fireEvent.keyDown(surface(), { key: "-", ctrlKey: true });
    fireEvent.keyDown(surface(), { key: "=", metaKey: true });
    fireEvent.keyDown(surface(), { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(surface(), { key: "Enter", ctrlKey: true });

    expect(zoomOf()).toBe(before.zoom);
    expect(tiles()).toEqual(before.tiles);
    expect(onPick).not.toHaveBeenCalled();

    // Shift stays allowed: `+` needs it on most layouts.
    fireEvent.keyDown(surface(), { key: "+", shiftKey: true });
    expect(zoomOf()).toBe(before.zoom + 1);
  });

  it("places at the crosshair on Enter, so the map is not mouse-only", () => {
    const onPick = vi.fn();
    render(<MapPicker latitude={null} longitude={null} onPick={onPick} />);
    fireEvent.keyDown(surface(), { key: "Enter" });

    expect(onPick).toHaveBeenCalledTimes(1);
    // The centre of the default view, which is what the crosshair marks.
    const [position] = onPick.mock.calls[0];
    expect(position.latitude).toBeCloseTo(20, 4);
    expect(position.longitude).toBeCloseTo(0, 4);
  });
});
