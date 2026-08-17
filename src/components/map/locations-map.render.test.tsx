import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationsMap } from "./locations-map";
import { MAX_FIT_ZOOM } from "@/lib/map-tiles";

// The fit itself is unit-tested in `lib/map-tiles.test.ts`. What only a render
// reaches is what this component does with it: which locations it draws at all,
// and that the view it asks the maths for is the one it then renders tiles and
// pins from.

// The global stub in `vitest.setup.ts` never reports a size, which would leave
// the grid empty and every assertion below vacuous.
const VIEWPORT = { width: 320, height: 180 };
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
// for: the zoom in the tile URLs is the scale it settled on.
const tileZoom = () => {
  const tile = document.querySelector<HTMLImageElement>("img[src*='cartocdn']");
  return Number(tile!.src.match(/\/(\d+)\/\d+\/\d+\.png$/)![1]);
};

const pins = () =>
  document.querySelectorAll('div[style*="translate3d"]').length;

// The marker itself, inside the positioned wrapper - which is where the shape
// lives, the wrapper carrying only the placement.
const markerClasses = () =>
  Array.from(document.querySelectorAll('div[style*="translate3d"] > div')).map(
    (marker) => marker.className,
  );

// The zoom two different sets of locations settle on, one render at a time:
// leaving the first mounted would leave `tileZoom` reading its tiles.
const zoomFor = (
  locations: React.ComponentProps<typeof LocationsMap>["locations"],
) => {
  const { unmount } = render(
    <LocationsMap locations={locations} subject="the trip's locations" />,
  );
  const zoom = tileZoom();
  unmount();
  return zoom;
};

describe("LocationsMap", () => {
  it("draws a pin for each place that has a position", () => {
    render(
      <LocationsMap
        subject="the trip's locations"
        locations={[
          { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
          { name: "Bohol", latitude: 9.85, longitude: 124.14 },
        ]}
      />,
    );
    expect(pins()).toBe(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Moalboal, Bohol",
    );
  });

  // A device's fix and a pin somebody placed are different claims about where
  // something is, and a mis-pinned site is only visible if the two are drawn
  // differently. Same size and same accent either way, so the inversion is the
  // only difference.
  it("draws a recorded fix as a ring and a placed pin as a dot", () => {
    render(
      <LocationsMap
        subject="the dive's location"
        locations={[
          { name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 },
          {
            name: "Exit",
            latitude: 28.4375,
            longitude: 34.4584,
            variant: "fix",
          },
        ]}
      />,
    );

    // Both are markers - the fix is not a second kind of thing the fit or the
    // count could quietly drop.
    expect(pins()).toBe(2);

    const [pin, fix] = markerClasses();
    expect(pin).toContain("bg-coral");
    expect(pin).not.toContain("border-coral");
    expect(fix).toContain("border-coral");
    expect(fix).not.toContain("bg-coral");

    // And its name is a name like any other, so it reaches the label.
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Blue Hole, Exit",
    );
  });

  // A place typed in by hand has a name and nothing else. The picker's row says
  // "not on the map"; here it simply is not one.
  it("skips a place with no position", () => {
    render(
      <LocationsMap
        subject="the trip's locations"
        locations={[
          { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
          { name: "That reef with the turtles" },
        ]}
      />,
    );
    expect(pins()).toBe(1);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Moalboal",
    );
  });

  it("renders nothing at all when no place has a position", () => {
    const { container } = render(
      <LocationsMap
        locations={[{ name: "Somewhere warm" }]}
        subject="the trip's locations"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The surface does not exist on the first render when there is nothing to
  // draw, so measuring it has to be tied to the element appearing rather than to
  // the component mounting - otherwise a caller that renders the map before its
  // locations load gets a frame that stays empty forever.
  it("measures a surface that only appears on a later render", () => {
    const { rerender } = render(
      <LocationsMap
        locations={[{ name: "Somewhere warm" }]}
        subject="the trip's locations"
      />,
    );
    rerender(
      <LocationsMap
        subject="the trip's locations"
        locations={[
          { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
        ]}
      />,
    );
    expect(
      document.querySelectorAll("img[src*='cartocdn']").length,
    ).toBeGreaterThan(0);
    expect(pins()).toBe(1);
  });

  it("zooms out to hold two distant places", () => {
    const single = zoomFor([
      { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
    ]);
    const both = zoomFor([
      { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
      { name: "Red Sea", latitude: 27.0, longitude: 34.0 },
    ]);
    expect(both).toBeLessThan(single);
  });

  // A country is fitted by its footprint, not by the single point the geocoder
  // happens to call its centre - otherwise picking "Philippines" would open on
  // one town in it.
  it("fits a place by its bounding box when it has one", () => {
    const asPoint = zoomFor([
      { name: "Cebu", latitude: 10.3, longitude: 123.9 },
    ]);
    const asBox = zoomFor([
      {
        name: "Cebu",
        latitude: 10.3,
        longitude: 123.9,
        bbox_south: 9.4,
        bbox_north: 11.3,
        bbox_west: 123.3,
        bbox_east: 124.1,
      },
    ]);
    expect(asBox).toBeLessThan(asPoint);
  });

  // A lone place fits at every zoom there is, so the cap is the whole answer for
  // one - and it is the same cap for a dive site as for a trip location, because
  // this map cannot be zoomed out and an offshore site at street level is a dot
  // on blank water. See DECISIONS.md.
  it("opens a lone place at locality zoom", () => {
    expect(
      zoomFor([{ name: "Blue Hole", latitude: 28.5721, longitude: 34.5372 }]),
    ).toBe(MAX_FIT_ZOOM);
  });

  // Every place has a name, but nothing stops it being blank - and "Map of "
  // is what a screen reader would otherwise read out.
  it("falls back to the caller's subject when no name is usable", () => {
    render(
      <LocationsMap
        locations={[{ name: " ", latitude: 9.9494, longitude: 123.3986 }]}
        subject="the dive site"
      />,
    );
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of the dive site",
    );
  });

  // The licence links have to stay outside the labelled image: a link inside
  // `role="img"` is dropped from the accessibility tree.
  it("keeps the tile attribution reachable", () => {
    render(
      <LocationsMap
        subject="the trip's locations"
        locations={[
          { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: "© OpenStreetMap contributors" }),
    ).toBeInTheDocument();
  });
});
