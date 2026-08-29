import { describe, expect, it, vi } from "vitest";
import {
  clampCenter,
  clampLatitude,
  DEFAULT_TILE_ATTRIBUTION,
  DEFAULT_TILE_URL,
  LatLonBounds,
  MAX_LATITUDE,
  MIN_ZOOM,
  nearestWrappedX,
  parseAttribution,
  project,
  TILE_SIZE,
  tileOrigins,
  tileSource,
  needsDarkFilter,
  tileSrcSet,
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

describe("tileUrl", () => {
  it("fills a {z}/{x}/{y} template", () => {
    expect(
      tileUrl("https://tiles.example/light/{z}/{x}/{y}.png", 2440, 1698, 12),
    ).toBe("https://tiles.example/light/12/2440/1698.png");
  });

  it("drops {r} at single density and fills it above", () => {
    const template = "https://tiles.example/light/{z}/{x}/{y}{r}.png";
    expect(tileUrl(template, 2440, 1698, 12)).toBe(
      "https://tiles.example/light/12/2440/1698.png",
    );
    expect(tileUrl(template, 2440, 1698, 12, 2)).toBe(
      "https://tiles.example/light/12/2440/1698@2x.png",
    );
  });

  // A tile server with no high-density variant must never be asked for one,
  // whatever density the caller wants.
  it("leaves a template without {r} alone at any density", () => {
    const template = "https://tiles.example/light/{z}/{x}/{y}.png";
    expect(tileUrl(template, 2440, 1698, 12, 2)).toBe(
      tileUrl(template, 2440, 1698, 12),
    );
  });
});

describe("tileSrcSet", () => {
  it("offers both densities of a {r} template", () => {
    expect(
      tileSrcSet(
        "https://tiles.example/light/{z}/{x}/{y}{r}.png",
        2440,
        1698,
        12,
      ),
    ).toBe(
      "https://tiles.example/light/12/2440/1698.png 1x, " +
        "https://tiles.example/light/12/2440/1698@2x.png 2x",
    );
  });

  // Not a one-candidate srcSet: naming the plain tile as its own 2x would
  // claim a resolution the file does not have, and the browser would draw it
  // at half the size it is.
  it("offers nothing for a template without {r}", () => {
    expect(
      tileSrcSet("https://tiles.example/light/{z}/{x}/{y}.png", 2440, 1698, 12),
    ).toBeUndefined();
  });

  // OpenStreetMap serves no `@2x`, so the shipped template asks for no such
  // thing. Every keyless provider tested was in the same position - a `{r}`
  // reaching this default would 404 every tile on a retina display.
  it("offers nothing for the shipped default", () => {
    expect(tileSrcSet(DEFAULT_TILE_URL, 4, 8, 5)).toBeUndefined();
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

  it("reads the default attribution as a link to the licence", () => {
    const parts = parseAttribution(DEFAULT_TILE_ATTRIBUTION);
    expect(parts.filter((part) => part.href)).toEqual([
      {
        text: "© OpenStreetMap contributors",
        href: "https://www.openstreetmap.org/copyright",
      },
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
  it("defaults to OpenStreetMap for both themes", () => {
    const source = tileSource();
    expect(source.light).toBe(DEFAULT_TILE_URL);
    expect(source.dark).toBe(DEFAULT_TILE_URL);
    expect(source.attribution).toBe(DEFAULT_TILE_ATTRIBUTION);
    // Which is the whole reason the renderers darken the tiles themselves.
    expect(needsDarkFilter(source)).toBe(true);
  });

  // "Use my tile server" means in both themes - falling back to a stranger's
  // dark tiles at night would send a self-hoster's divers to a third party they
  // deliberately configured away from.
  it("uses a configured light template for dark too", () => {
    const source = tileSource({
      light: "https://tiles.example/{z}/{x}/{y}.png",
    });
    expect(source.dark).toBe("https://tiles.example/{z}/{x}/{y}.png");
  });

  it("keeps a configured dark template", () => {
    expect(
      tileSource({
        light: "https://tiles.example/{z}/{x}/{y}.png",
        dark: "https://tiles.example/dark/{z}/{x}/{y}.png",
      }).dark,
    ).toBe("https://tiles.example/dark/{z}/{x}/{y}.png");
  });

  // A dark template on its own is the one combination that keeps the default
  // light tiles: the pair is only "mine" once the light one has been pointed
  // away.
  it("keeps the light default when only the dark one is configured", () => {
    const source = tileSource({
      dark: "https://tiles.example/dark/{z}/{x}/{y}.png",
    });
    expect(source.light).toBe(DEFAULT_TILE_URL);
    expect(source.dark).toBe("https://tiles.example/dark/{z}/{x}/{y}.png");
  });

  it("substitutes {key} into both templates", () => {
    const source = tileSource({
      light: "https://tiles.example/light/{z}/{x}/{y}.png?key={key}",
      dark: "https://tiles.example/dark/{z}/{x}/{y}.png?key={key}",
      apiKey: "s3cret",
    });

    expect(source.light).toContain("?key=s3cret");
    expect(source.dark).toContain("?key=s3cret");
    expect(source.light).not.toContain("{key}");
  });

  // The request would go out with an empty key and come back a 401 or a
  // watermark, and neither of those names the variable nobody set.
  it("warns when a template wants a key and none is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const source = tileSource({
      light: "https://tiles.example/{z}/{x}/{y}.png?key={key}",
    });

    expect(source.light).toBe("https://tiles.example/{z}/{x}/{y}.png?key=");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("MAP_TILE_API_KEY"),
    );
    warn.mockRestore();
  });

  it("takes a configured attribution", () => {
    expect(tileSource({ attribution: "© Someone" }).attribution).toBe(
      "© Someone",
    );
  });
});

describe("needsDarkFilter", () => {
  it("is true for a provider with no dark tiles of its own", () => {
    expect(needsDarkFilter(tileSource())).toBe(true);
    expect(
      needsDarkFilter(
        tileSource({ light: "https://t.example/{z}/{x}/{y}.png" }),
      ),
    ).toBe(true);
  });

  // A real dark basemap beats anything a filter can synthesize, so configuring
  // one has to switch the filter off - which is the same condition, read the
  // other way.
  it("is false once a dark template is configured", () => {
    expect(
      needsDarkFilter(
        tileSource({
          light: "https://t.example/light/{z}/{x}/{y}.png",
          dark: "https://t.example/dark/{z}/{x}/{y}.png",
        }),
      ),
    ).toBe(false);
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
