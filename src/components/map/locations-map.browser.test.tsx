import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { LocationsMap } from "./locations-map";
import {
  FIT_PADDING,
  SIDE_FADE_WIDTH,
  SNAPSHOT_WIDTH,
  type MappableLocation,
} from "@/lib/map-picture";
import { resolveBasemap, type BasemapConfig } from "@/lib/basemap";
import { ConfigProvider } from "@/contexts/ConfigContext";

// **Load-bearing, and it looks like a stray import.** The browser project loads
// no stylesheet of this app's - `map-canvas.tsx` brings `maplibre-gl.css` with
// it, but Tailwind arrives only through `app/layout.tsx`, which no test renders.
// Without this line every Tailwind class in the tree computes to nothing, and
// the dark-theme guard below - which asserts an *absence*, that no element
// carries a CSS `filter` - passes whether or not the `invert hue-rotate-180` it
// exists to catch is present. Removing it does not fail that test; it silently
// stops it from being able to fail. That was the whole of the import's job until
// this file gained a geometry case: "fills its own frame with the map" measures
// boxes that only have a size while these classes apply, so the import is now
// load-bearing loudly as well as quietly. Louder still for "refits when its
// frame narrows", where a missing height can stop the behaviour under test from
// happening rather than merely stop it being measurable; that test's own height
// assertion says how. See "jsdom answers no layout question, and the browser
// lane only answers one with the stylesheet loaded" in DECISIONS.md.
import "@/app/globals.css";

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
//
// Every figure here is a *comparison* between two spans or a containment check,
// never an absolute pixel count, and that is what keeps them meaningful. The
// canvas is now exactly the frame - both axes follow the runner's window, which
// is narrower than the `sm:` breakpoint, so the height is `h-40` less the app's
// border - and the fit is computed against that box. Until the container
// collapse was fixed it was the frame's real width and a flat 300 tall,
// MapLibre's per-axis fallback (`clientWidth || 400`, `clientHeight || 300`)
// standing in for a box that had none. Every comparison here carried over
// unchanged across that repair, which is what writing them this way buys.
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
      "Map of Moalboal; Bohol",
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
      "Map of Blue Hole; Exit",
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

  // A place typed in by hand has a name and nothing else. The trip form's part
  // row says "Not on the map"; here it simply is not one.
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

  // **The frame this component draws is the frame the map fills**, which was
  // false in the shipped app for as long as `MapCanvas` handed MapLibre an
  // element it also tried to lay out with a class. MapLibre's unlayered
  // `.maplibregl-map { position: relative; overflow: hidden }` outranks any
  // Tailwind utility on that element, so the container sat at the frame's width
  // and zero height and clipped its own canvas away; the credit and the controls
  // still drew, because they are not inside it, and the map read as a styled
  // empty box. The fit and marker assertions above cannot see any of that - they
  // compare one span against another, and a canvas of the wrong size still
  // projects consistently - so this is stated separately and measured.
  //
  // Every figure is read off the frame rather than written down, because the
  // frame's width follows the runner's window.
  it("fills its own frame with the map", async () => {
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
    await canvasReady();

    const frame = screen.getByRole("img").getBoundingClientRect();
    expect(frame.height).toBeGreaterThan(0);

    const container = document
      .querySelector<HTMLElement>(".maplibregl-map")!
      .getBoundingClientRect();
    expect(container.width).toBeCloseTo(frame.width, 0);
    expect(container.height).toBeCloseTo(frame.height, 0);
    expect(container.top).toBeCloseTo(frame.top, 0);
    expect(container.left).toBeCloseTo(frame.left, 0);

    // The canvas follows the container, so a collapse shows up here as
    // MapLibre's flat 300 fallback rather than as the frame's own height.
    const canvas = document
      .querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas")!
      .getBoundingClientRect();
    expect(canvas.height).toBeCloseTo(frame.height, 0);

    // And that the map is genuinely *at* that point rather than clipped out of
    // it: `overflow: hidden` leaves a canvas with a plausible box of its own
    // while hit-testing falls through to whatever is behind it.
    const hit = document.elementFromPoint(
      frame.left + frame.width / 2,
      frame.top + frame.height / 2,
    );
    expect(document.querySelector(".maplibregl-map")!.contains(hit)).toBe(true);
  });

  // Firefox draws the canvas square through any rounded clip that is not on a
  // masked element, so the frame's corners have to reach `MapCanvas`'s own
  // element and be clipped to there. Chromium rounds the map either way, so what
  // this lane can hold is the chain, not the pixels.
  it("clips the map to its frame's corners, under a mask", async () => {
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

    const frame = screen.getByRole("img").parentElement!;
    const radius = getComputedStyle(frame).borderRadius;
    expect(radius).not.toBe("0px");

    const clip = getComputedStyle(
      document.querySelector(".maplibregl-map")!.parentElement!,
    );
    expect(clip.borderRadius).toBe(radius);
    expect(clip.overflow).toBe("hidden");
    expect(clip.getPropertyValue("mask-image")).not.toBe("none");
  });

  // What the caller lays over the map's foot is not map, so a lone place is
  // centred in what is left above it rather than in the whole frame.
  it("centres a place between the top edge and a covered bottom", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          coveredBottom={80}
          locations={[{ name: "Dahab", latitude: 28.49, longitude: 34.51 }]}
        />,
      ),
    );
    await spanOnScreen();

    const frame = screen.getByRole("img").getBoundingClientRect();
    const marker = (markers()[0] as HTMLElement).getBoundingClientRect();
    const centre = marker.top + marker.height / 2;
    expect(centre - frame.top).toBeCloseTo((frame.height - 80) / 2, 0);
  });

  // A backdrop's credit covers its top edge the way the caller's content covers
  // its foot, so the place centres between the two.
  it("centres a backdrop's place between its credit and a covered bottom", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          backdrop
          coveredBottom={40}
          locations={[{ name: "Dahab", latitude: 28.49, longitude: 34.51 }]}
        />,
      ),
    );
    await spanOnScreen();

    const frame = screen.getByRole("img").getBoundingClientRect();
    const credit = screen
      .getByRole("link", { name: /OpenStreetMap/ })
      .parentElement!.getBoundingClientRect();
    const marker = (markers()[0] as HTMLElement).getBoundingClientRect();
    const centre = marker.top + marker.height / 2;
    expect(credit.bottom).toBeGreaterThan(frame.top);
    expect(centre).toBeCloseTo((credit.bottom + frame.bottom - 40) / 2, 0);
  });

  // A region's pin is rarely the middle of its outline, and on a backdrop the
  // pin is what is centred - the outline only sizes the view.
  it("centres a backdrop's pin rather than its region's outline", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          backdrop
          coveredBottom={40}
          locations={[
            {
              name: "Red Sea",
              // Near the south of its outline, as a region's pin can be.
              latitude: 14,
              longitude: 38,
              bbox_south: 12,
              bbox_north: 30,
              bbox_west: 32,
              bbox_east: 44,
            },
          ]}
        />,
      ),
    );
    await spanOnScreen();

    const frame = screen.getByRole("img").getBoundingClientRect();
    const credit = screen
      .getByRole("link", { name: /OpenStreetMap/ })
      .parentElement!.getBoundingClientRect();
    const marker = (markers()[0] as HTMLElement).getBoundingClientRect();
    expect(marker.top + marker.height / 2).toBeCloseTo(
      (credit.bottom + frame.bottom - 40) / 2,
      0,
    );
  });

  it("keeps every pin of a backdrop between its credit and a covered bottom", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          backdrop
          coveredBottom={40}
          locations={[
            { name: "Aqaba", latitude: 29.53, longitude: 35.01 },
            { name: "Marsa Alam", latitude: 25.07, longitude: 34.89 },
          ]}
        />,
      ),
    );
    await spanOnScreen();

    const frame = screen.getByRole("img").getBoundingClientRect();
    const credit = screen
      .getByRole("link", { name: /OpenStreetMap/ })
      .parentElement!.getBoundingClientRect();
    for (const marker of Array.from(markers()) as HTMLElement[]) {
      const centre =
        marker.getBoundingClientRect().top +
        marker.getBoundingClientRect().height / 2;
      expect(centre).toBeGreaterThanOrEqual(credit.bottom);
      expect(centre).toBeLessThanOrEqual(frame.bottom - 40);
    }
  });

  it("fades a backdrop into a colour laid over it, not through a mask", async () => {
    render(
      withConfig(
        <LocationsMap
          subject="the trip's locations"
          backdrop
          locations={[{ name: "Dahab", latitude: 28.49, longitude: 34.51 }]}
        />,
      ),
    );
    await canvasReady();

    const fade = document.querySelector<HTMLElement>("[data-backdrop-fade]")!;
    expect(getComputedStyle(fade).backgroundImage).toContain("linear-gradient");
    expect(getComputedStyle(screen.getByRole("img")).maskImage).toBe("none");
  });

  // A list lets its off-screen maps go, so each keeps a picture of itself to
  // come back as. The picture has to hold real pixels, which is the part that
  // can fail silently: the canvas keeps no drawing buffer, and a read at any
  // other moment than the frame's own comes back empty.
  describe("with snapshot", () => {
    const TEAL = { r: 74, g: 110, b: 110 };
    const SOLID: BasemapConfig = {
      ...OFFLINE,
      styleUrl: `data:application/json,${encodeURIComponent(
        JSON.stringify({
          version: 8,
          sources: {},
          layers: [
            {
              id: "bg",
              type: "background",
              paint: {
                "background-color": `rgb(${TEAL.r}, ${TEAL.g}, ${TEAL.b})`,
              },
            },
          ],
        }),
      )}`,
    };

    const picture = () =>
      waitFor(
        () => {
          const image = document.querySelector("img");
          expect(image).not.toBeNull();
          return image!;
        },
        { timeout: 10000 },
      );

    it("swaps a drawn map for a picture of it, pins and all", async () => {
      render(
        withConfig(
          <LocationsMap
            subject="the trip's locations"
            snapshot
            locations={[
              { name: "Moalboal", latitude: 9.9494, longitude: 123.3986 },
              { name: "Bohol", latitude: 9.85, longitude: 124.14 },
            ]}
          />,
          SOLID,
        ),
      );

      const image = await picture();
      await waitFor(() => expect(image.complete).toBe(true));
      expect(image.src.startsWith("blob:")).toBe(true);
      expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull();
      expect(markers()).toHaveLength(2);

      const probe = document.createElement("canvas");
      probe.width = image.naturalWidth;
      probe.height = image.naturalHeight;
      const context = probe.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const [r, g, b, a] = context.getImageData(
        Math.floor(probe.width / 2),
        Math.floor(probe.height / 4),
        1,
        1,
      ).data;
      // Within a level or two, not exact: the picture is lossy WebP.
      expect(a).toBe(255);
      expect(Math.abs(r - TEAL.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(g - TEAL.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(b - TEAL.b)).toBeLessThanOrEqual(2);
    });

    // A resize moves the picture rather than drawing it again: the pin keeps
    // to the middle of the frame, and no map is built for it.
    it("keeps its picture through a resize, moving it with the frame", async () => {
      const Resizable = ({ width }: { width: number }) =>
        withConfig(
          <div style={{ width }}>
            <LocationsMap
              subject="the trip's locations"
              snapshot
              locations={[
                { name: "Tulamben", latitude: -8.27, longitude: 115.59 },
              ]}
            />
          </div>,
          SOLID,
        );
      const { rerender } = render(<Resizable width={300} />);
      await picture();
      await waitFor(() =>
        expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull(),
      );
      const middle = () => {
        const frame = screen.getByRole("img").getBoundingClientRect();
        const pin = (markers()[0] as HTMLElement).getBoundingClientRect();
        return pin.left + pin.width / 2 - (frame.left + frame.width / 2);
      };
      expect(middle()).toBeCloseTo(0, 0);

      rerender(<Resizable width={360} />);
      await waitFor(() => expect(middle()).toBeCloseTo(0, 0));
      expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull();
      expect(document.querySelector("img")).not.toBeNull();
    });

    it("comes back as its picture, without building a map again", async () => {
      const map = () =>
        withConfig(
          <LocationsMap
            subject="the trip's locations"
            snapshot
            locations={[{ name: "Anilao", latitude: 13.76, longitude: 120.92 }]}
          />,
          SOLID,
        );
      const first = render(map());
      await picture();
      first.unmount();

      render(map());
      expect(document.querySelector("img")).not.toBeNull();
      expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull();
      expect(markers()).toHaveLength(1);
    });

    // A frame wider than the picture - the trip page's hero on a desktop
    // window - shows the picture in its middle with the page either side, and
    // the places have to be in the picture: fitted across the frame, a wide
    // trip's pins would stand on the page beside it. Two places eighty degrees
    // apart in a frame taller than it is a trip the sides decide the zoom of.
    const WIDE = [
      { name: "Dahab", latitude: 28.49, longitude: 34.51 },
      { name: "Tulamben", latitude: -8.27, longitude: 115.59 },
    ];
    const inWideFrame = (element: React.ReactNode) => {
      const frame = document.createElement("div");
      frame.style.width = "1600px";
      document.body.appendChild(frame);
      render(withConfig(element, SOLID), { container: frame });
      return frame;
    };
    // Each pin's middle, in the picture's own pixels from its left edge.
    const pinsAcross = async () => {
      const image = await picture();
      await waitFor(() =>
        expect(document.querySelector("canvas.maplibregl-canvas")).toBeNull(),
      );
      await waitFor(() => expect(markers()).toHaveLength(2));
      const left = image.getBoundingClientRect().left;
      return Array.from(markers()).map((marker) => {
        const pin = marker.getBoundingClientRect();
        return pin.left + pin.width / 2 - left;
      });
    };

    it("fits a wide frame's places into the picture rather than across the frame", async () => {
      const frame = inWideFrame(
        <LocationsMap
          subject="the trip's locations"
          snapshot
          backdrop
          className="h-96 sm:h-96"
          locations={WIDE}
        />,
      );
      try {
        const xs = await pinsAcross();
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(FIT_PADDING - 1);
          expect(x).toBeLessThanOrEqual(SNAPSHOT_WIDTH - FIT_PADDING + 1);
        }
        // Into the picture, not squeezed into its middle for nothing.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
          SNAPSHOT_WIDTH / 2,
        );
        expect(document.querySelector("[data-backdrop-side-fade]")).toBeNull();
      } finally {
        frame.remove();
      }
    });

    it("keeps a side-faded picture's places out of its fades, which are gradients over it", async () => {
      const frame = inWideFrame(
        <LocationsMap
          subject="the trip's locations"
          snapshot
          backdrop
          sideFade
          className="h-96 sm:h-96"
          locations={WIDE}
        />,
      );
      try {
        const xs = await pinsAcross();
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(SIDE_FADE_WIDTH - 1);
          expect(x).toBeLessThanOrEqual(SNAPSHOT_WIDTH - SIDE_FADE_WIDTH + 1);
        }
        // As wide as the middle half allows, so the fades cost no more map than
        // they cover.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
          SNAPSHOT_WIDTH - 2 * SIDE_FADE_WIDTH - 4,
        );

        // Over the picture, as wide as it, and no mask anywhere under it.
        const fade = document.querySelector<HTMLElement>(
          "[data-backdrop-side-fade]",
        )!;
        const image = document.querySelector("img")!;
        expect(fade.getBoundingClientRect().width).toBe(
          image.getBoundingClientRect().width,
        );
        expect(getComputedStyle(fade).backgroundImage).toContain(
          "linear-gradient",
        );
        expect(getComputedStyle(screen.getByRole("img")).maskImage).toBe(
          "none",
        );
      } finally {
        frame.remove();
      }
    });

    it("shows a frame narrower than the picture none of the side fade", async () => {
      const frame = document.createElement("div");
      frame.style.width = "320px";
      document.body.appendChild(frame);
      try {
        render(
          withConfig(
            <LocationsMap
              subject="the trip's locations"
              snapshot
              backdrop
              sideFade
              locations={[WIDE[0]]}
            />,
            SOLID,
          ),
          { container: frame },
        );
        const image = await picture();
        // The fade lies past the frame's edges: what the frame shows of the
        // picture starts beyond the left fade and ends before the right one.
        const shown = screen.getByRole("img").getBoundingClientRect();
        const drawn = image.getBoundingClientRect();
        expect(drawn.left + SIDE_FADE_WIDTH).toBeLessThanOrEqual(shown.left);
        expect(drawn.right - SIDE_FADE_WIDTH).toBeGreaterThanOrEqual(
          shown.right,
        );
      } finally {
        frame.remove();
      }
    });
  });

  // **MapLibre does not refit on its own.** Its `trackResize` calls `resize()`,
  // which recomputes the projection for the new box and leaves centre and zoom
  // where they were - so without an explicit refit a frame that narrows keeps a
  // camera fitted to the wider one and pushes the outermost pins outside it. The
  // hand-rolled renderer got this for free by recomputing from a measured size;
  // this is the test that says the behaviour survived the move.
  it("refits when its frame narrows", async () => {
    const frame = document.createElement("div");
    frame.style.width = "640px";
    document.body.appendChild(frame);

    try {
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
        { container: frame },
      );
      // The first fit, before anything is resized.
      await waitFor(() =>
        expect(frame.querySelectorAll("[data-marker]").length).toBe(2),
      );

      // Everything below is scoped to the frame this test owns rather than to
      // the document: the queries elsewhere in this file are document-wide, and
      // a map from an earlier test still being torn down would answer them.
      const box = () =>
        frame.querySelector('[role="img"]')!.getBoundingClientRect();
      const pins = () =>
        Array.from(frame.querySelectorAll("[data-marker]")).map((marker) =>
          marker.getBoundingClientRect(),
        );

      // Where the resize below lands in MapLibre's first observation of this
      // container, it is acted on only if the box differs from the one the map
      // was built at - and a zero height never differs. Asserted here so a frame
      // with no size fails as itself, rather than as a map that refits when it
      // feels like it. See the stylesheet import above.
      expect(box().height).toBeGreaterThan(0);

      frame.style.width = "240px";
      await waitFor(() => {
        expect(box().width).toBeLessThan(300);
        expect(pins()).toHaveLength(2);
        for (const at of pins()) {
          expect(at.left).toBeGreaterThanOrEqual(box().left - 1);
          expect(at.right).toBeLessThanOrEqual(box().right + 1);
        }
      });
    } finally {
      frame.remove();
    }
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
