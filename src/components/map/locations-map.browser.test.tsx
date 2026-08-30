import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { LocationsMap, type MappableLocation } from "./locations-map";
import { resolveBasemap, type BasemapConfig } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";

// **A real browser, not jsdom.** MapLibre needs a WebGL2 context, which jsdom
// does not have and no mock supplies - `vitest-webgl-canvas-mock` is WebGL1-only
// and unmaintained, and MapLibre's own suite works only because it installs a
// 355-line null WebGL2 context that its `exports` map puts out of reach. So this
// file runs in the browser project (`vitest.config.mts`), which is also why it
// is named `.browser.test.tsx`.
//
// What that buys beyond running at all: the fit, the marker placement and the
// theme swap are checked against the renderer that actually ships, rather than
// against a component's arithmetic about what it would have drawn.

// Every test mounts a map against the bundled style, which fetches from
// `tiles.openfreemap.org`. That is a real network dependency in a unit suite, so
// the style is replaced with one that draws nothing and asks for nothing: the
// behaviour under test is this component's - which places it fits, which markers
// it makes, what it labels them - and none of it is about cartography arriving.
const EMPTY_STYLE = `data:application/json,${encodeURIComponent(
  JSON.stringify({ version: 8, sources: {}, layers: [] }),
)}`;

const OFFLINE: BasemapConfig = {
  styleUrl: EMPTY_STYLE,
  attribution:
    "[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)",
};

const withConfig = (
  children: React.ReactNode,
  config: BasemapConfig = OFFLINE,
) => (
  <ConfigProvider config={{ basemap: resolveBasemap(config) }}>
    {children}
  </ConfigProvider>
);

const markers = () => document.querySelectorAll("[data-marker]");

// The camera the map actually settled on, read off the instance rather than off
// the component - the whole reason for running here is that there is one.
const canvasReady = () =>
  waitFor(() => {
    const canvas = document.querySelector("canvas.maplibregl-canvas");
    expect(canvas).not.toBeNull();
    return canvas!;
  });

// The zoom is read back through the marker positions rather than through a
// handle on the map: the component keeps its instance private, which is the
// contract worth keeping. Two places drawn further apart on screen is a deeper
// zoom, and that is all these comparisons need.
const spanOnScreen = async () => {
  await canvasReady();
  return waitFor(() => {
    const found = Array.from(markers()) as HTMLElement[];
    expect(found.length).toBeGreaterThan(0);
    const lefts = found.map((marker) => marker.getBoundingClientRect().left);
    return Math.max(...lefts) - Math.min(...lefts);
  });
};

describe("LocationsMap", () => {
  it("draws a marker for each place that has a position", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
            { name: "Bohol", latitude: 9.85, longitude: 124.14 },
          ]}
        />,
      ),
    );
    await waitFor(() => expect(markers().length).toBe(2));
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Moalboal, Bohol",
    );
  });

  // A device's fix and a pin somebody placed are different claims about where
  // something is, and a mis-pinned site is only visible if the two are drawn
  // differently. Same size and same accent either way, so the inversion is the
  // only difference.
  it("draws a recorded fix as a ring and a placed pin as a dot", async () => {
    render(
      withConfig(
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
      ),
    );

    // Both are markers - the fix is not a second kind of thing the fit or the
    // count could quietly drop.
    await waitFor(() => expect(markers().length).toBe(2));

    const [pin, fix] = Array.from(markers()) as HTMLElement[];
    expect(pin.className).toContain("bg-coral");
    expect(pin.className).not.toContain("border-coral");
    expect(fix.className).toContain("border-coral");
    expect(fix.className).not.toContain("bg-coral");

    // And its name is a name like any other, so it reaches the label.
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Blue Hole, Exit",
    );
  });

  // Two same-shaped rings a few hundred metres apart are one blob at this zoom,
  // so which is which has to survive hover even though the names are in the
  // surface's own label too.
  it("names each marker for a pointer", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the dive's location"
          locations={[{ name: "Entry", latitude: 28.5721, longitude: 34.5372 }]}
        />,
      ),
    );
    await waitFor(() =>
      expect((markers()[0] as HTMLElement).title).toBe("Entry"),
    );
  });

  // A place typed in by hand has a name and nothing else. The picker's row says
  // "not on the map"; here it simply is not one.
  it("skips a place with no position", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
            { name: "That reef with the turtles" },
          ]}
        />,
      ),
    );
    await waitFor(() => expect(markers().length).toBe(1));
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of Moalboal",
    );
  });

  it("renders nothing at all when no place has a position", () => {
    const { container } = render(
      withConfig(
        <LocationsMap
          locations={[{ name: "Somewhere warm" }]}
          subject="the trip's locations"
        />,
      ),
    );
    expect(container).toBeEmptyDOMElement();
  });

  // A form that shows this map beside the field filling it wants the frame from
  // the start, so nothing below it moves when the first place lands. The world
  // is what there is to show until then - and the label has to say so, since
  // "Map of the trip's locations" over a blank world is wrong in the one place
  // nobody looking at the screen can see it.
  it("draws the whole world when asked to show an empty map", async () => {
    render(
      withConfig(
        <LocationsMap
          locations={[{ name: "Somewhere warm" }]}
          subject="the trip's locations"
          showWhenEmpty
        />,
      ),
    );

    await canvasReady();
    expect(markers().length).toBe(0);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Map of the world, awaiting the trip's locations",
    );
  });

  // The container does not exist on the first render when there is nothing to
  // draw, so building the map has to be tied to the element appearing rather
  // than to the component mounting - otherwise a caller that renders the map
  // before its locations load gets a frame that stays empty forever. That is
  // what the callback ref in `map-canvas.tsx` is for.
  it("builds a map on a surface that only appears on a later render", async () => {
    const { rerender } = render(
      withConfig(
        <LocationsMap
          locations={[{ name: "Somewhere warm" }]}
          subject="the trip's locations"
        />,
      ),
    );
    rerender(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
          ]}
        />,
      ),
    );
    await canvasReady();
    await waitFor(() => expect(markers().length).toBe(1));
  });

  it("zooms out far enough to hold two distant places", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
            { name: "Red Sea", latitude: 27.0, longitude: 34.0 },
          ]}
        />,
      ),
    );
    await spanOnScreen();

    // Ninety degrees apart, and both have to be *on* the map. A fit that
    // silently dropped one of the boxes would open on the other and leave this
    // one outside the frame, which no marker count would notice.
    const frame = screen.getByRole("img").getBoundingClientRect();
    for (const marker of Array.from(markers())) {
      const box = marker.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(frame.left - 1);
      expect(box.right).toBeLessThanOrEqual(frame.right + 1);
    }
  });

  // A lone place - or a pair of them a couple of hundred metres apart - fits at
  // every zoom there is, so the cap is the whole answer. It is the same cap for a
  // dive site as for a trip location, because this map cannot be zoomed out and
  // an offshore site at street level is a dot on blank water.
  it("caps the fit at locality zoom rather than opening at street level", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the dive site"
          locations={[
            { name: "Entry", latitude: 28.5721, longitude: 34.537 },
            { name: "Exit", latitude: 28.5721, longitude: 34.539 },
          ]}
        />,
      ),
    );

    // 0.002 degrees, about 200 m. At `MAX_FIT_ZOOM` the whole world is
    // 512 * 2 ** 9 px, so those two land about 1.5 px apart. Without the cap
    // MapLibre fits them to the frame and they land some 370 px apart, which is
    // what makes this a test of the cap rather than of the fit.
    expect(await spanOnScreen()).toBeLessThan(20);
  });

  // A country is fitted by its footprint, not by the single point a geocoder
  // calls its centre - otherwise picking "Philippines" opens on one town in it.
  // Read through a second, fixed place: a footprint forces a wider fit, so the
  // two land *closer together* on screen than the same pair of points alone.
  it("fits a place by its bounding box when it has one", async () => {
    const pair = (box?: Partial<MappableLocation>) => [
      { name: "Cebu", latitude: 10.3, longitude: 123.9, ...box },
      { name: "Bohol", latitude: 9.85, longitude: 124.14 },
    ];

    const { unmount } = render(
      withConfig(
        <LocationsMap subject="the trip's locations" locations={pair()} />,
      ),
    );
    const asPoints = await spanOnScreen();
    unmount();

    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={pair({
            bbox_south: 9.4,
            bbox_north: 11.3,
            bbox_west: 123.3,
            bbox_east: 124.1,
          })}
        />,
      ),
    );
    const asBox = await spanOnScreen();

    expect(asBox).toBeLessThan(asPoints);
  });

  // Half a box is not an extent, and the API validates all four or none - so a
  // broken one is read as the place's own point rather than as a footprint.
  it("ignores a partial bounding box rather than half-using it", async () => {
    const { unmount } = render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Cebu", latitude: 10.3, longitude: 123.9 },
            { name: "Bohol", latitude: 9.85, longitude: 124.14 },
          ]}
        />,
      ),
    );
    const asPoints = await spanOnScreen();
    unmount();

    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            {
              name: "Cebu",
              latitude: 10.3,
              longitude: 123.9,
              bbox_south: 9.4,
              bbox_north: 11.3,
              // and no west/east
            },
            { name: "Bohol", latitude: 9.85, longitude: 124.14 },
          ]}
        />,
      ),
    );

    expect(await spanOnScreen()).toBeCloseTo(asPoints, 0);
  });

  // **Three places, not two, and that is the whole point of the test.** MapLibre
  // repairs a single finished box on its own - `cameraForBounds` calls
  // `adjustAntiMeridian()` - so a two-point check passes whether or not the
  // union survived the move off the hand-rolled renderer. What only three can
  // show is the *order*: unwrapped, the map opens on about ten degrees of ocean
  // and reads Suva, Taveuni, Apia from left to right. Unioned raw, it opens on
  // the 350 degrees going the other way round the planet and reads Apia, Suva,
  // Taveuni instead - with the two Fijian places jammed against the right edge.
  it("opens a trip across the antimeridian the short way round", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Suva", latitude: -18.1, longitude: 178.4 },
            { name: "Taveuni", latitude: -16.8, longitude: 179.9 },
            { name: "Apia", latitude: -13.8, longitude: -171.8 },
          ]}
        />,
      ),
    );
    await spanOnScreen();

    const order = (Array.from(markers()) as HTMLElement[])
      .sort(
        (a, b) =>
          a.getBoundingClientRect().left - b.getBoundingClientRect().left,
      )
      .map((marker) => marker.title);
    expect(order).toEqual(["Suva", "Taveuni", "Apia"]);
  });

  // Every place has a name, but nothing stops it being blank - and "Map of "
  // is what a screen reader would otherwise read out.
  it("falls back to the caller's subject when no name is usable", async () => {
    render(
      withConfig(
        <LocationsMap
          locations={[{ name: " ", latitude: 9.9494, longitude: 123.3986 }]}
          subject="the dive site"
        />,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
        "Map of the dive site",
      ),
    );
  });

  // The licence links have to stay outside the labelled image: a link inside
  // `role="img"` is dropped from the accessibility tree, and a credit nobody can
  // follow is not much of a credit. MapLibre owns the container now, so this is
  // about where the attribution sits relative to it rather than about markup
  // this component draws itself.
  it("keeps the attribution reachable, and outside the image", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
          ]}
        />,
      ),
    );
    const link = await screen.findByRole("link", {
      name: "© OpenStreetMap contributors",
    });
    expect(screen.getByRole("img").contains(link)).toBe(false);
  });

  // Exactly one credit on screen. MapLibre ships its own `AttributionControl`
  // and renders it as HTML, which this repo will not do - `attributionControl:
  // false` is what keeps the app's own the only one.
  it("shows one attribution, not MapLibre's as well", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          locations={[
            { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
          ]}
        />,
      ),
    );
    await canvasReady();
    expect(document.querySelectorAll(".maplibregl-ctrl-attrib").length).toBe(0);
  });

  // The dark theme is now a different *style*, not a CSS filter over the light
  // one - which is most of the point of the move. The filter is gone, and its
  // absence is asserted rather than assumed: an `invert` left on the container
  // would go unnoticed against a dark basemap until somebody switched providers.
  describe("in the dark theme", () => {
    const renderDark = (config: BasemapConfig) =>
      render(
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          {withConfig(
            <LocationsMap
              subject="the trip's locations"
              locations={[
                { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
              ]}
            />,
            config,
          )}
        </ThemeProvider>,
      );

    it("draws the dark style, and filters nothing", async () => {
      renderDark({
        ...OFFLINE,
        styleUrlDark: EMPTY_STYLE,
      });
      await canvasReady();

      const frame = screen.getByRole("img");
      for (const element of [frame, ...frame.querySelectorAll("*")]) {
        const { filter } = getComputedStyle(element);
        expect(filter === "none" || filter === "").toBe(true);
      }
    });

    // An unset dark value falls back to the configured light one, never to the
    // style this app ships - the rule the raster templates have always followed.
    it("falls a missing dark style back to the configured light one", () => {
      const basemap = resolveBasemap({
        styleUrl: "https://styles.example/day.json",
        attribution: "© Someone",
      });
      expect(basemap.dark).toBe("https://styles.example/day.json");
    });
  });
});
