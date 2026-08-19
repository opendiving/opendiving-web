import { afterEach, describe, expect, it } from "vitest";
import {
  clampCenter,
  clampLatitude,
  DEFAULT_DARK_TILE_URL,
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_URL,
  fitBounds,
  FittedView,
  LatLonBounds,
  MAX_FIT_ZOOM,
  MAX_LATITUDE,
  MIN_ZOOM,
  nearestWrappedX,
  parseAttribution,
  project,
  TILE_SIZE,
  tileOrigins,
  tileSource,
  tileUrl,
  unproject,
  visibleTiles,
  wrapLongitude,
} from "@/lib/map-tiles";

// The reference values here are analytic rather than copied from another
// implementation, which would only prove the two agree. Web Mercator pins down
// a handful of exact points - the prime meridian and equator at the centre of
// the map, ±180° at its edges, the cut-off latitude at its top - and one famous
// derived one: the horizontal line a quarter of the way down the world sits at
// atan(sinh(π/2)) = 66.51326°N. That is *not* the Arctic Circle (66.56°N),
// which is the tell that it came from the projection and not from an atlas.
const QUARTER_WORLD_LATITUDE = 66.51326044311186;

describe("wrapLongitude", () => {
  it("leaves an in-range longitude alone", () => {
    expect(wrapLongitude(34.5372)).toBeCloseTo(34.5372, 10);
    expect(wrapLongitude(-179.9)).toBeCloseTo(-179.9, 10);
  });

  it("folds a longitude that has run past the antimeridian", () => {
    // Panning east from 179° by 3° arrives at 178°W, not at 182°E.
    expect(wrapLongitude(182)).toBeCloseTo(-178, 10);
    expect(wrapLongitude(-182)).toBeCloseTo(178, 10);
    expect(wrapLongitude(540)).toBeCloseTo(180 - 360, 10);
  });

  it("settles the two names for the antimeridian on one", () => {
    expect(wrapLongitude(180)).toBe(-180);
    expect(wrapLongitude(-180)).toBe(-180);
  });

  it("is idempotent", () => {
    for (const longitude of [0, 34.5372, 182, -182, 359.9, -540]) {
      const once = wrapLongitude(longitude);
      expect(wrapLongitude(once)).toBeCloseTo(once, 10);
    }
  });
});

describe("clampLatitude", () => {
  it("cuts at the latitudes Mercator can represent", () => {
    expect(clampLatitude(89)).toBe(MAX_LATITUDE);
    expect(clampLatitude(-89)).toBe(-MAX_LATITUDE);
    expect(clampLatitude(28.5717)).toBe(28.5717);
  });
});

describe("project", () => {
  it("puts the null island at the centre of the world", () => {
    const scale = TILE_SIZE * 2 ** 3;
    expect(project({ latitude: 0, longitude: 0 }, 3)).toEqual({
      x: scale / 2,
      y: scale / 2,
    });
  });

  it("puts the antimeridian and the Mercator cut-off at the world's edges", () => {
    const scale = TILE_SIZE * 2 ** 2;
    const northWest = project({ latitude: MAX_LATITUDE, longitude: -180 }, 2);
    expect(northWest.x).toBeCloseTo(0, 6);
    expect(northWest.y).toBeCloseTo(0, 6);

    const south = project({ latitude: -MAX_LATITUDE, longitude: 0 }, 2);
    expect(south.y).toBeCloseTo(scale, 6);
  });

  it("puts 66.51326°N a quarter of the way down the map", () => {
    const scale = TILE_SIZE * 2 ** 4;
    const { y } = project(
      { latitude: QUARTER_WORLD_LATITUDE, longitude: 0 },
      4,
    );
    expect(y).toBeCloseTo(scale / 4, 4);
  });

  it("doubles every coordinate for each zoom level", () => {
    const position = { latitude: 28.5717, longitude: 34.5372 };
    const near = project(position, 5);
    const far = project(position, 6);
    expect(far.x).toBeCloseTo(near.x * 2, 8);
    expect(far.y).toBeCloseTo(near.y * 2, 8);
  });

  it("folds a longitude that ran past the antimeridian, rather than projecting off the map", () => {
    const scale = TILE_SIZE * 2 ** 3;
    const { x } = project({ latitude: 0, longitude: 190 }, 3);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(scale);
    expect(x).toBeCloseTo(project({ latitude: 0, longitude: -170 }, 3).x, 8);
  });
});

describe("unproject", () => {
  it("inverts project for real positions", () => {
    // The Blue Hole, a Bali site south of the equator, and one well west.
    const positions = [
      { latitude: 28.5717, longitude: 34.5372 },
      { latitude: -8.2762, longitude: 115.5936 },
      { latitude: 20.2114, longitude: -87.4654 },
    ];
    for (const position of positions) {
      for (const zoom of [1, 8, 14, 18]) {
        const round = unproject(project(position, zoom), zoom);
        expect(round.latitude).toBeCloseTo(position.latitude, 9);
        expect(round.longitude).toBeCloseTo(position.longitude, 9);
      }
    }
  });

  it("reads the centre of the world as the null island", () => {
    const scale = TILE_SIZE * 2 ** 6;
    const centre = unproject({ x: scale / 2, y: scale / 2 }, 6);
    expect(centre.latitude).toBeCloseTo(0, 9);
    expect(centre.longitude).toBeCloseTo(0, 9);
  });

  it("reads a quarter of the way down the map as 66.51326°N", () => {
    const scale = TILE_SIZE * 2 ** 6;
    const { latitude } = unproject({ x: 0, y: scale / 4 }, 6);
    expect(latitude).toBeCloseTo(QUARTER_WORLD_LATITUDE, 6);
  });

  it("keeps a pan past either edge inside the coordinate ranges the API accepts", () => {
    const scale = TILE_SIZE * 2 ** 3;
    const east = unproject({ x: scale * 1.25, y: -200 }, 3);
    expect(east.longitude).toBeGreaterThanOrEqual(-180);
    expect(east.longitude).toBeLessThanOrEqual(180);
    expect(east.latitude).toBeLessThanOrEqual(MAX_LATITUDE);

    const west = unproject({ x: -scale * 0.25, y: scale + 200 }, 3);
    expect(west.longitude).toBeGreaterThanOrEqual(-180);
    expect(west.latitude).toBeGreaterThanOrEqual(-MAX_LATITUDE);
  });
});

describe("nearestWrappedX", () => {
  it("leaves a marker inside the current world alone", () => {
    const scale = TILE_SIZE * 2 ** 4;
    expect(nearestWrappedX(100, scale / 2, 4)).toBe(100);
  });

  it("brings a marker across the antimeridian to the near side of the view", () => {
    // A site at 179°E while the view sits on 179°W: one world apart in
    // projected pixels, two degrees apart on screen.
    const zoom = 4;
    const scale = TILE_SIZE * 2 ** zoom;
    const marker = project({ latitude: 0, longitude: 179 }, zoom);
    const view = project({ latitude: 0, longitude: -179 }, zoom);
    const drawn = nearestWrappedX(marker.x, view.x, zoom);

    expect(Math.abs(drawn - view.x)).toBeLessThan(scale / 2);
    // Still the same meridian, just named by the neighbouring copy of the world.
    expect(((drawn % scale) + scale) % scale).toBeCloseTo(marker.x, 8);
  });
});

describe("visibleTiles", () => {
  const centre = (zoom: number) => {
    const scale = TILE_SIZE * 2 ** zoom;
    return { x: scale / 2, y: scale / 2 };
  };

  it("covers a viewport smaller than one tile with the tiles it straddles", () => {
    // A 100x100 viewport centred on a tile corner touches all four tiles.
    const tiles = visibleTiles({ x: 512, y: 512 }, 100, 100, 3);
    expect(tiles).toHaveLength(4);
    expect(tiles.map((tile) => `${tile.x}/${tile.y}`).sort()).toEqual([
      "1/1",
      "1/2",
      "2/1",
      "2/2",
    ]);
  });

  it("positions tiles so the requested centre lands in the middle of the viewport", () => {
    const width = 400;
    const height = 300;
    const tiles = visibleTiles(centre(4), width, height, 4);
    for (const tile of tiles) {
      // Every tile overlaps the viewport - nothing is fetched to be drawn
      // entirely off-screen.
      expect(tile.left).toBeLessThan(width);
      expect(tile.top).toBeLessThan(height);
      expect(tile.left + TILE_SIZE).toBeGreaterThan(0);
      expect(tile.top + TILE_SIZE).toBeGreaterThan(0);
    }
    // ...and between them they cover it completely.
    const left = Math.min(...tiles.map((tile) => tile.left));
    const top = Math.min(...tiles.map((tile) => tile.top));
    expect(left).toBeLessThanOrEqual(0);
    expect(top).toBeLessThanOrEqual(0);
    expect(
      Math.max(...tiles.map((tile) => tile.left)) + TILE_SIZE,
    ).toBeGreaterThanOrEqual(width);
    expect(
      Math.max(...tiles.map((tile) => tile.top)) + TILE_SIZE,
    ).toBeGreaterThanOrEqual(height);
  });

  it("skips rows past the poles instead of requesting tiles that do not exist", () => {
    // Zoom 1 is a 512px world; a 512x512 viewport centred on its top edge has
    // half its height above the north pole.
    const tiles = visibleTiles({ x: 256, y: 0 }, 512, 512, 1);
    expect(tiles.every((tile) => tile.y >= 0 && tile.y < 2)).toBe(true);
    expect(tiles.some((tile) => tile.top < 0)).toBe(false);
  });

  it("wraps columns past the antimeridian back into the world", () => {
    const zoom = 2;
    const scale = TILE_SIZE * 2 ** zoom;
    const tiles = visibleTiles({ x: scale, y: scale / 2 }, 512, 100, zoom);
    // Panning off the east edge keeps drawing map: the far column is the
    // world's first tile again, not a gap.
    expect(tiles.every((tile) => tile.x >= 0 && tile.x < 4)).toBe(true);
    expect(tiles.some((tile) => tile.x === 3)).toBe(true);
    expect(tiles.some((tile) => tile.x === 0)).toBe(true);
  });

  it("gives repeated worlds distinct keys so React does not reuse one element for both", () => {
    const zoom = 2;
    const scale = TILE_SIZE * 2 ** zoom;
    const tiles = visibleTiles({ x: scale, y: scale / 2 }, 512, 100, zoom);
    expect(new Set(tiles.map((tile) => tile.key)).size).toBe(tiles.length);
  });
});

describe("clampCenter", () => {
  it("leaves a centre with a full viewport around it alone", () => {
    const scale = TILE_SIZE * 2 ** 4;
    expect(clampCenter({ x: 100, y: scale / 2 }, 224, 4)).toEqual({
      x: 100,
      y: scale / 2,
    });
  });

  it("stops the viewport running past either pole", () => {
    // Zoom 1 is a 512 px world, so a 224 px surface has only 288 px of travel.
    expect(clampCenter({ x: 10, y: 0 }, 224, 1).y).toBe(112);
    expect(clampCenter({ x: 10, y: 512 }, 224, 1).y).toBe(400);
  });

  it("centres a viewport taller than the world instead of inverting", () => {
    // The clamp's own bounds cross over here - min 400 and max 112 at zoom 0.
    expect(clampCenter({ x: 10, y: 0 }, 800, 1).y).toBe(256);
  });

  it("never clamps longitude, which has no edge to run off", () => {
    const scale = TILE_SIZE * 2 ** 3;
    expect(clampCenter({ x: -500, y: scale / 2 }, 224, 3).x).toBe(-500);
    expect(clampCenter({ x: scale + 500, y: scale / 2 }, 224, 3).x).toBe(
      scale + 500,
    );
  });
});

describe("fitBounds", () => {
  const VIEWPORT = { width: 320, height: 180 };

  const point = (latitude: number, longitude: number) => ({
    south: latitude,
    north: latitude,
    west: longitude,
    east: longitude,
  });

  // Whether every corner of `box` lands inside the viewport the view describes,
  // which is the whole contract - asserting on the zoom alone would pass a view
  // that fits by being centred somewhere else entirely.
  const contains = (view: FittedView, box: LatLonBounds) => {
    const center = project(view.center, view.zoom);
    const origin = {
      x: center.x - VIEWPORT.width / 2,
      y: center.y - VIEWPORT.height / 2,
    };
    return [box.west, box.east].every((longitude) =>
      [box.south, box.north].every((latitude) => {
        const corner = project({ latitude, longitude }, view.zoom);
        const x = nearestWrappedX(corner.x, center.x, view.zoom) - origin.x;
        const y = corner.y - origin.y;
        return x >= 0 && x <= VIEWPORT.width && y >= 0 && y <= VIEWPORT.height;
      }),
    );
  };

  it("opens a single place at locality zoom, centred on it", () => {
    const view = fitBounds(
      [point(9.9494, 123.3986)],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(view.zoom).toBe(MAX_FIT_ZOOM);
    expect(view.center.latitude).toBeCloseTo(9.9494, 6);
    expect(view.center.longitude).toBeCloseTo(123.3986, 6);
  });

  // A town's footprint would fit at street level, and a trip location shown
  // that close is a lone pin among house numbers.
  it("does not go deeper than locality zoom for a tiny box", () => {
    const view = fitBounds(
      [{ south: 9.94, north: 9.96, west: 123.39, east: 123.41 }],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(view.zoom).toBe(MAX_FIT_ZOOM);
  });

  it("finds the deepest zoom that still holds a union of boxes", () => {
    const boxes = [
      { south: 9.9, north: 10.1, west: 123.3, east: 123.5 },
      { south: 9.5, north: 9.7, west: 124.0, east: 124.4 },
    ];
    const view = fitBounds(boxes, VIEWPORT.width, VIEWPORT.height);
    expect(boxes.every((box) => contains(view, box))).toBe(true);
    // Tight, not merely sufficient: one level further in and it would spill.
    const tighter = { center: view.center, zoom: view.zoom + 1 };
    expect(boxes.every((box) => contains(tighter, box))).toBe(false);
  });

  // The union of 178°E and 172°W is six degrees of ocean, not the 354 the raw
  // numbers describe - the difference between a readable pair of pins and a
  // whole-world view with one at each edge.
  it("unwraps a pair straddling the antimeridian", () => {
    const view = fitBounds(
      [point(-17.7, 178.0), point(-13.8, -172.0)],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(view.center.longitude).toBeCloseTo(-177, 6);
    expect(view.zoom).toBeGreaterThan(MIN_ZOOM);
  });

  // Same place, described the way Nominatim describes it: a box whose east edge
  // reads as smaller than its west one.
  it("reads a box that crosses the antimeridian as one interval", () => {
    const view = fitBounds(
      [{ south: -18, north: -13, west: 170, east: -170 }],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    // 170°E to 170°W is twenty degrees wide, centred on the antimeridian.
    expect(view.center.longitude).toBeCloseTo(-180, 6);
    expect(view.zoom).toBe(4);
  });

  it("gives up a zoom level to keep the padding it was asked for", () => {
    const boxes = [{ south: 0, north: 0, west: -20, east: 20 }];
    const tight = fitBounds(boxes, VIEWPORT.width, VIEWPORT.height);
    const padded = fitBounds(boxes, VIEWPORT.width, VIEWPORT.height, 60);
    expect(padded.zoom).toBe(tight.zoom - 1);
  });

  it("falls back to the widest view when nothing fits", () => {
    const view = fitBounds(
      [point(-80, -170), point(80, 170)],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(view.zoom).toBe(MIN_ZOOM);
  });

  // Mercator stretches towards the poles, so the halfway *latitude* of a view
  // spanning hemispheres is not the latitude halfway down its picture.
  it("centres on the middle of the projected extent, not the mean latitude", () => {
    const view = fitBounds(
      [point(0, 0), point(60, 0)],
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(view.center.latitude).toBeGreaterThan(30);
    expect(view.center.latitude).toBeCloseTo(
      unproject(
        {
          x: 0,
          y:
            (project({ latitude: 60, longitude: 0 }, 8).y +
              project({ latitude: 0, longitude: 0 }, 8).y) /
            2,
        },
        8,
      ).latitude,
      6,
    );
  });

  // A map with nothing to show yet is not an error the caller has to answer -
  // it is the whole world, on the same centre the site picker opens on.
  it("answers an empty list with the widest view", () => {
    expect(fitBounds([], VIEWPORT.width, VIEWPORT.height)).toEqual({
      center: { latitude: 20, longitude: 0 },
      zoom: MIN_ZOOM,
    });
  });
});

describe("tileUrl", () => {
  it("fills a {z}/{x}/{y} template", () => {
    expect(
      tileUrl("https://tiles.example/light/{z}/{x}/{y}.png", 2440, 1698, 12),
    ).toBe("https://tiles.example/light/12/2440/1698.png");
  });
});

describe("parseAttribution", () => {
  it("splits links out of the surrounding text", () => {
    expect(
      parseAttribution("Map [© CARTO](https://carto.com/attributions) here"),
    ).toEqual([
      { text: "Map " },
      { text: "© CARTO", href: "https://carto.com/attributions" },
      { text: " here" },
    ]);
  });

  it("reads the default attribution as two links", () => {
    const parts = parseAttribution(DEFAULT_TILE_ATTRIBUTION);
    expect(parts.filter((part) => part.href).map((part) => part.text)).toEqual([
      "© OpenStreetMap contributors",
      "© CARTO",
    ]);
  });

  it("leaves a plain string alone, for a provider with nothing to link to", () => {
    expect(parseAttribution("© Someone")).toEqual([{ text: "© Someone" }]);
  });

  // This string comes from an environment variable, so the one thing it must
  // not do is put an arbitrary scheme into an href.
  it("keeps the label but drops a link that is not http(s)", () => {
    expect(parseAttribution("[Credit](javascript:alert)")).toEqual([
      { text: "Credit" },
    ]);
    expect(parseAttribution("[Credit](data:text/html,x)")).toEqual([
      { text: "Credit" },
    ]);
    expect(parseAttribution("[Credit](not a url)")).toEqual([
      { text: "[Credit](not a url)" },
    ]);
  });
});

describe("tileSource", () => {
  const setEnv = (key: string, value?: string) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  afterEach(() => {
    for (const key of [
      "NEXT_PUBLIC_MAP_TILE_URL",
      "NEXT_PUBLIC_MAP_TILE_URL_DARK",
      "NEXT_PUBLIC_MAP_TILE_ATTRIBUTION",
    ]) {
      setEnv(key, undefined);
    }
  });

  it("defaults to Carto's matched light/dark pair", () => {
    const source = tileSource();
    expect(source.light).toBe(DEFAULT_TILE_URL);
    expect(source.dark).toBe(DEFAULT_DARK_TILE_URL);
    expect(source.dark).not.toBe(source.light);
    expect(source.attribution).toBe(DEFAULT_TILE_ATTRIBUTION);
  });

  // "Use my tile server" means in both themes - falling back to Carto's dark
  // tiles at night would send a self-hoster's divers to a third party they
  // deliberately configured away from.
  it("uses a configured light template for dark too", () => {
    setEnv("NEXT_PUBLIC_MAP_TILE_URL", "https://tiles.example/{z}/{x}/{y}.png");
    const source = tileSource();
    expect(source.dark).toBe("https://tiles.example/{z}/{x}/{y}.png");
  });

  it("keeps a configured dark template", () => {
    setEnv("NEXT_PUBLIC_MAP_TILE_URL", "https://tiles.example/{z}/{x}/{y}.png");
    setEnv(
      "NEXT_PUBLIC_MAP_TILE_URL_DARK",
      "https://tiles.example/dark/{z}/{x}/{y}.png",
    );
    expect(tileSource().dark).toBe(
      "https://tiles.example/dark/{z}/{x}/{y}.png",
    );
  });
});

describe("tileOrigins", () => {
  it("gives one origin per distinct tile host, path stripped", () => {
    expect(
      tileOrigins({
        light: "https://tiles.example/light/{z}/{x}/{y}.png",
        dark: "https://tiles.example/dark/{z}/{x}/{y}.png",
        attribution: "",
      }),
    ).toEqual(["https://tiles.example"]);
  });

  it("keeps a separate dark host", () => {
    expect(
      tileOrigins({
        light: "https://light.example/{z}/{x}/{y}.png",
        dark: "https://dark.example/{z}/{x}/{y}.png",
        attribution: "",
      }),
    ).toEqual(["https://light.example", "https://dark.example"]);
  });

  // `new URL` only throws when there is no parseable scheme at all: "htp://..."
  // parses as a non-special scheme and yields the opaque origin "null", which
  // would reach `img-src` as the literal token `null` and be discarded by the
  // browser with nothing said about which variable caused it.
  it("rejects a mistyped scheme rather than emitting a null origin", () => {
    expect(
      tileOrigins({
        light: "htp://tiles.example/{z}/{x}/{y}.png",
        dark: "https://dark.example/{z}/{x}/{y}.png",
        attribution: "",
      }),
    ).toEqual(["https://dark.example"]);
  });

  it("drops a malformed template rather than throwing in middleware", () => {
    expect(
      tileOrigins({
        light: "tiles.example/{z}/{x}/{y}.png",
        dark: "https://dark.example/{z}/{x}/{y}.png",
        attribution: "",
      }),
    ).toEqual(["https://dark.example"]);
  });
});
