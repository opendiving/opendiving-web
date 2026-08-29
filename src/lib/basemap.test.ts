import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  basemapOrigins,
  basemapStyle,
  DEFAULT_BASEMAP_ATTRIBUTION,
  DEFAULT_BASEMAP_ORIGIN,
  DEFAULT_STYLE_URL,
  DEFAULT_STYLE_URL_DARK,
  MAX_FIT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  MISSING_ATTRIBUTION_MESSAGE,
  rasterStyle,
  resolveBasemap,
  unionBounds,
  withRatioToken,
} from "./basemap";
import {
  MAX_ZOOM as SLIPPY_MAX_ZOOM,
  MIN_ZOOM as SLIPPY_MIN_ZOOM,
} from "./map-tiles";

// The slippy figure `MAX_FIT_ZOOM` replaces. Written out rather than imported
// because the constant it came from went with `fitBounds`, whose zoom-walking
// MapLibre's own `fitBounds` now does - the other two are still live, because
// the site picker still reads them.
const SLIPPY_MAX_FIT_ZOOM = 10;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveBasemap", () => {
  it("ships the bundled pair when nothing is configured", () => {
    expect(resolveBasemap()).toEqual({
      mode: "vector",
      vendored: true,
      light: DEFAULT_STYLE_URL,
      dark: DEFAULT_STYLE_URL_DARK,
      attribution: DEFAULT_BASEMAP_ATTRIBUTION,
    });
  });

  it("takes a configured style, and falls its dark back to the light one", () => {
    expect(
      resolveBasemap({
        styleUrl: "https://styles.example/day.json",
        attribution: "© Someone",
      }),
    ).toEqual({
      mode: "vector",
      vendored: false,
      light: "https://styles.example/day.json",
      // "Use my style", not "use mine by day and a stranger's by night".
      dark: "https://styles.example/day.json",
      attribution: "© Someone",
    });
  });

  // The whole of the escape hatch: raster stays configurable and the app renders
  // it through the same renderer, so nothing about the two documented keyed
  // blocks has to change.
  it("wraps a raster template, substituting the key into both", () => {
    expect(
      resolveBasemap({
        tileUrl: "https://tiles.example/light/{z}/{x}/{y}{r}.png?api_key={key}",
        tileUrlDark:
          "https://tiles.example/dark/{z}/{x}/{y}{r}.png?api_key={key}",
        apiKey: "s3cret",
      }),
    ).toMatchObject({
      mode: "raster",
      vendored: false,
      light: "https://tiles.example/light/{z}/{x}/{y}{r}.png?api_key=s3cret",
      dark: "https://tiles.example/dark/{z}/{x}/{y}{r}.png?api_key=s3cret",
    });
  });

  it("lets a style win outright, leaving the raster template inert", () => {
    const basemap = resolveBasemap({
      styleUrl: "https://styles.example/day.json",
      tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
      attribution: "© Someone",
    });
    expect(basemap.mode).toBe("vector");
    expect(basemap.light).toBe("https://styles.example/day.json");
  });

  // The three states the refusal has to tell apart. Getting this wrong in the
  // permissive direction ships a false licence credit; getting it wrong in the
  // strict direction takes the whole app down on a stock configuration, which is
  // how a cross-field validator once killed the API repo's test collection and
  // its compose stack at the same time.
  describe("when a style is configured without a credit", () => {
    it("refuses, naming both variables", () => {
      expect(() =>
        resolveBasemap({ styleUrl: "https://styles.example/day.json" }),
      ).toThrow(MISSING_ATTRIBUTION_MESSAGE);
      expect(MISSING_ATTRIBUTION_MESSAGE).toContain("MAP_STYLE_URL");
      expect(MISSING_ATTRIBUTION_MESSAGE).toContain("MAP_ATTRIBUTION");
    });

    it("stays silent for the unconfigured default", () => {
      expect(() => resolveBasemap()).not.toThrow();
      expect(resolveBasemap().attribution).toBe(DEFAULT_BASEMAP_ATTRIBUTION);
    });

    it("stays silent for a raster template, which keeps its own default", () => {
      const basemap = resolveBasemap({
        tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
      });
      expect(basemap.attribution).toContain("OpenStreetMap");
    });
  });

  // A dark style with no light one would mix this app's cartography with
  // somebody else's on a theme toggle, and credit one of them for both.
  it("ignores a dark style URL set on its own, and says so", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const basemap = resolveBasemap({
      styleUrlDark: "https://styles.example/night.json",
    });
    expect(basemap.vendored).toBe(true);
    expect(basemap.dark).toBe(DEFAULT_STYLE_URL_DARK);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("MAP_STYLE_URL_DARK"),
    );
  });
});

describe("withRatioToken", () => {
  // This app's templates have always written `{r}`, and both keyed blocks in
  // `.env.example` are `{z}/{x}/{y}{r}.png`. Handed to MapLibre unchanged they
  // would request a literal `{r}` and 404 - breaking precisely the two
  // configurations the escape hatch exists to preserve.
  it("renames the density placeholder to MapLibre's spelling", () => {
    expect(
      withRatioToken(
        "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png",
      ),
    ).toBe(
      "https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{ratio}.png",
    );
  });

  it("leaves a template without one alone", () => {
    const template = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
    expect(withRatioToken(template)).toBe(template);
  });
});

describe("rasterStyle", () => {
  // The style spec's default is 512, and every template this app documents
  // serves 256 - taking the default would draw each tile over four tiles' worth
  // of ground.
  it("states the 256px tile size rather than taking the spec's default", () => {
    const style = rasterStyle("https://tiles.example/{z}/{x}/{y}.png");
    expect(style.sources.basemap).toMatchObject({
      type: "raster",
      tileSize: 256,
    });
  });

  it("renames the density placeholder on the way in", () => {
    const style = rasterStyle("https://tiles.example/{z}/{x}/{y}{r}.png");
    expect(style.sources.basemap).toMatchObject({
      tiles: ["https://tiles.example/{z}/{x}/{y}{ratio}.png"],
    });
  });

  it("draws the source it declares", () => {
    const style = rasterStyle("https://tiles.example/{z}/{x}/{y}.png");
    expect(style.layers).toEqual([
      { id: "basemap", type: "raster", source: "basemap" },
    ]);
  });
});

describe("basemapOrigins", () => {
  // The bundled styles are same-origin documents, but everything they name is
  // not, and a host the renderer contacts without the policy naming it fails as
  // a blocked request with a console line nobody reads.
  it("names the provider the bundled styles fetch from", () => {
    expect(basemapOrigins(resolveBasemap())).toEqual([DEFAULT_BASEMAP_ORIGIN]);
  });

  it("names a configured style's own origin, once for a matching pair", () => {
    expect(
      basemapOrigins(
        resolveBasemap({
          styleUrl: "https://styles.example/day.json",
          styleUrlDark: "https://styles.example/night.json",
          attribution: "© Someone",
        }),
      ),
    ).toEqual(["https://styles.example"]);
  });

  it("names both hosts of a raster pair", () => {
    expect(
      basemapOrigins(
        resolveBasemap({
          tileUrl: "https://a.example/{z}/{x}/{y}.png",
          tileUrlDark: "https://b.example/{z}/{x}/{y}.png",
        }),
      ),
    ).toEqual(["https://a.example", "https://b.example"]);
  });

  // Failing closed keeps middleware up - this runs in the request path, and a
  // typo in an optional map's variable must not take the site down.
  it("drops a malformed value, and names the variable while doing it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      basemapOrigins({
        mode: "vector",
        vendored: false,
        light: "htp://styles.example/day.json",
        dark: "htp://styles.example/day.json",
        attribution: "© Someone",
      }),
    ).toEqual([]);
    // "htp://" parses happily as a non-special scheme and yields the opaque
    // origin "null", which browsers discard with nothing said about why.
    expect(warn).toHaveBeenCalled();
  });

  // The one shape that is not a mistake: a style an operator serves themselves,
  // which `'self'` already covers.
  it("says nothing about a same-origin style", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      basemapOrigins({
        mode: "vector",
        vendored: false,
        light: "/my-style.json",
        dark: "/my-style.json",
        attribution: "© Someone",
      }),
    ).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("basemapStyle", () => {
  it("hands a configured style over as a URL, for MapLibre to fetch", async () => {
    const basemap = resolveBasemap({
      styleUrl: "https://styles.example/day.json",
      styleUrlDark: "https://styles.example/night.json",
      attribution: "© Someone",
    });
    await expect(basemapStyle(basemap, "light")).resolves.toBe(
      "https://styles.example/day.json",
    );
    await expect(basemapStyle(basemap, "dark")).resolves.toBe(
      "https://styles.example/night.json",
    );
  });

  it("builds a document around a raster template", async () => {
    const basemap = resolveBasemap({
      tileUrl: "https://tiles.example/{z}/{x}/{y}.png",
    });
    await expect(basemapStyle(basemap, "light")).resolves.toMatchObject({
      version: 8,
    });
  });

  // MapLibre runs a style's `sprite` through `new URL(value)` with no base and
  // throws "must be absolute" on anything else - unlike a style's sources, which
  // it does resolve. So the bundled pair, whose sprite travels with it, has to be
  // fetched and resolved here; the absolute form cannot be baked into the file
  // because a published image runs on whatever domain it is given.
  it("resolves the bundled style's relative sprite against this origin", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          version: 8,
          sprite: "/basemap/sprite/ofm",
          sources: {},
          layers: [],
        }),
      ),
    );
    const style = await basemapStyle(resolveBasemap(), "light");
    expect(typeof style).not.toBe("string");
    expect((style as { sprite: string }).sprite).toBe(
      `${window.location.origin}/basemap/sprite/ofm`,
    );
  });

  it("says which file it could not read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 404, statusText: "Not Found" }),
    );
    await expect(basemapStyle(resolveBasemap(), "dark")).rejects.toThrow(
      DEFAULT_STYLE_URL_DARK,
    );
  });
});

// The styles are vendored, so a re-vendor is a file swap with no code change to
// review - which is exactly when a second host slips into `connect-src` unnoticed
// and the map half-renders in production with a console line nobody reads. This
// reads what is actually shipped rather than trusting the constant.
describe("the bundled styles", () => {
  const shipped = (file: string) =>
    JSON.parse(readFileSync(`public/basemap/${file}`, "utf8"));

  it.each([
    ["liberty.json", DEFAULT_STYLE_URL],
    ["dark.json", DEFAULT_STYLE_URL_DARK],
  ])("%s is the file the default points at", (file, url) => {
    expect(url).toBe(`/basemap/${file}`);
    expect(shipped(file).version).toBe(8);
  });

  it.each(["liberty.json", "dark.json"])(
    "%s fetches from no origin the policy does not name",
    (file) => {
      const style = shipped(file);
      const absolute = JSON.stringify(style).match(/https?:\/\/[^"']+/g) ?? [];
      const origins = new Set(absolute.map((url) => new URL(url).origin));
      expect([...origins]).toEqual([DEFAULT_BASEMAP_ORIGIN]);
    },
  );

  it.each(["liberty.json", "dark.json"])(
    "%s points at the sprite set vendored beside it",
    (file) => {
      expect(shipped(file).sprite).toBe("/basemap/sprite/ofm");
    },
  );
});

// MapLibre measures zoom against a 512px tile, the slippy convention against
// 256, so the same view is one number lower here. Carried across as the same
// integers these would each open one level too deep - and nothing about the
// rendered map would say so, which is why the relationship is asserted rather
// than described.
describe("zoom, against the numbers it replaces", () => {
  it.each([
    ["MIN_ZOOM", MIN_ZOOM, SLIPPY_MIN_ZOOM],
    ["MAX_ZOOM", MAX_ZOOM, SLIPPY_MAX_ZOOM],
    ["MAX_FIT_ZOOM", MAX_FIT_ZOOM, SLIPPY_MAX_FIT_ZOOM],
  ])("%s is one level below the slippy figure", (_name, maplibre, slippy) => {
    expect(maplibre).toBe(slippy - 1);
  });
});

describe("unionBounds", () => {
  it("has nothing to say about no places", () => {
    expect(unionBounds([])).toBeNull();
  });

  // **Three, not two.** MapLibre repairs a single finished box on its own -
  // `cameraForBounds` calls `adjustAntiMeridian()` - so a two-point check passes
  // whether or not this function survived the move off the hand-rolled renderer.
  // Fiji and Samoa are the recorded case: about six degrees of ocean, not the
  // 354 going the other way round the planet.
  it("keeps three places either side of the antimeridian six degrees apart", () => {
    const union = unionBounds([
      { south: -18.1, north: -18.1, west: 178.4, east: 178.4 }, // Suva, Fiji
      { south: -16.8, north: -16.8, west: 179.9, east: 179.9 }, // Taveuni, Fiji
      { south: -13.8, north: -13.8, west: -171.8, east: -171.8 }, // Apia, Samoa
    ])!;
    expect(union.east - union.west).toBeCloseTo(9.8, 5);
    // The eastern place is expressed in the copy of the world next to the
    // others rather than 350 degrees away from them.
    expect(union.east).toBeCloseTo(188.2, 5);
  });

  it("reads a box that crosses the antimeridian as one interval", () => {
    const union = unionBounds([
      { south: -18, north: -16, west: 179, east: -179 },
    ])!;
    expect(union.east - union.west).toBeCloseTo(2, 5);
  });

  it("gives back the whole world rather than an extent wider than one", () => {
    const union = unionBounds([
      { south: -60, north: 60, west: -170, east: 170 },
      { south: -60, north: 60, west: 170, east: -170 },
    ])!;
    expect(union.west).toBe(-180);
    expect(union.east).toBe(180);
  });

  it("takes the outer edges of overlapping boxes", () => {
    const union = unionBounds([
      { south: 9.4, north: 11.3, west: 123.3, east: 124.1 },
      { south: 8.0, north: 10.0, west: 123.8, east: 125.0 },
    ])!;
    expect(union).toMatchObject({ south: 8.0, north: 11.3 });
    // `toBeCloseTo` on the longitudes: they go out and back through the [-180,
    // 180) fold, which is exact in degrees and not in binary.
    expect(union.west).toBeCloseTo(123.3, 5);
    expect(union.east).toBeCloseTo(125.0, 5);
  });
});
