import { beforeAll, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripLocationsMap } from "./trip-locations-map";

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

// The zoom two different sets of locations settle on, one render at a time:
// leaving the first mounted would leave `tileZoom` reading its tiles.
const zoomFor = (
  locations: React.ComponentProps<typeof TripLocationsMap>["locations"],
) => {
  const { unmount } = render(<TripLocationsMap locations={locations} />);
  const zoom = tileZoom();
  unmount();
  return zoom;
};

describe("TripLocationsMap", () => {
  it("draws a pin for each place that has a position", () => {
    render(
      <TripLocationsMap
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

  // A place typed in by hand has a name and nothing else. The picker's row says
  // "not on the map"; here it simply is not one.
  it("skips a place with no position", () => {
    render(
      <TripLocationsMap
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
      <TripLocationsMap locations={[{ name: "Somewhere warm" }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // The surface does not exist on the first render when there is nothing to
  // draw, so measuring it has to be tied to the element appearing rather than to
  // the component mounting - otherwise a caller that renders the map before its
  // locations load gets a frame that stays empty forever.
  it("measures a surface that only appears on a later render", () => {
    const { rerender } = render(
      <TripLocationsMap locations={[{ name: "Somewhere warm" }]} />,
    );
    rerender(
      <TripLocationsMap
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

  // The licence links have to stay outside the labelled image: a link inside
  // `role="img"` is dropped from the accessibility tree.
  it("keeps the tile attribution reachable", () => {
    render(
      <TripLocationsMap
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
