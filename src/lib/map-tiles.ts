// Web-Mercator slippy-map arithmetic for the hand-rolled maps
// (`components/sites/map-picker.tsx`, `components/map/locations-map.tsx`),
// in the spirit of `lib/chart-scale.ts`: the maths lives here, pure and tested,
// and the components only render what it returns.
//
// No mapping library. A raster tile grid needs one CSP relaxation - the tile
// host in `img-src` - where MapLibre would have forced `worker-src blob:`, which
// upstream itself describes as equivalent to `unsafe-eval`. See DECISIONS.md.

export const TILE_SIZE = 256;

// Web Mercator is undefined at the poles and conventionally cut here, which is
// what makes the projected world square: this is the latitude whose projected y
// equals the map's own width.
export const MAX_LATITUDE = 85.0511287798066;

// Zoom 0 is one 256px tile for the whole planet, which is smaller than the
// picker's viewport - so the world would float in a void. Zoom 1 is the widest
// view that still fills it.
export const MIN_ZOOM = 1;
// OpenStreetMap's standard tiles stop at 19; 18 is street level and plenty for
// pinning an entry point, without inviting a zoom that returns blank tiles.
export const MAX_ZOOM = 18;

export interface LatLon {
  latitude: number;
  longitude: number;
}

// Where a map opens with nothing on it yet, at `MIN_ZOOM`: the whole world,
// centred a little north of the equator because that is where the land - and
// most of the world's diving - is. Shared by the site picker and the trip
// form's confirmation map so the two open on the same view by construction,
// rather than on two literals that agree until somebody edits one.
export const WORLD_CENTER: LatLon = { latitude: 20, longitude: 0 };

// A position in world pixels: the whole planet is `TILE_SIZE * 2 ** zoom` on a
// side, with (0, 0) at the north-west corner.
export interface Point {
  x: number;
  y: number;
}

// The world's width in either tiles (`tileCount`) or pixels (`worldSize`).
const tileCount = (zoom: number) => 2 ** zoom;
const worldSize = (zoom: number) => TILE_SIZE * tileCount(zoom);

/**
 * Latitude cut to the range Web Mercator can represent.
 */
export function clampLatitude(latitude: number): number {
  return Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude));
}

/**
 * Longitude folded back into [-180, 180), so panning past the antimeridian
 * yields a coordinate a diver (and the API's `ge=-180, le=180` bound) accepts.
 *
 * Exactly 180 comes back as -180. They are the same meridian, and picking one
 * representative is what keeps the range half-open and the folding idempotent.
 */
export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * A position as world pixels at `zoom`.
 */
export function project(position: LatLon, zoom: number): Point {
  const scale = worldSize(zoom);
  const latitude = (clampLatitude(position.latitude) * Math.PI) / 180;
  return {
    x: ((wrapLongitude(position.longitude) + 180) / 360) * scale,
    // The Mercator y: ln(tan φ + sec φ), normalized so the poles' cut-off sits
    // at 0 and `scale`.
    y:
      ((1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) /
        2) *
      scale,
  };
}

/**
 * The inverse of `project`: world pixels back to a position.
 */
export function unproject(point: Point, zoom: number): LatLon {
  const scale = worldSize(zoom);
  const mercatorY = Math.PI - (2 * Math.PI * point.y) / scale;
  return {
    latitude: clampLatitude((180 / Math.PI) * Math.atan(Math.sinh(mercatorY))),
    longitude: wrapLongitude((point.x / scale) * 360 - 180),
  };
}

/**
 * The copy of world-pixel `x` nearest to `reference`.
 *
 * The map repeats east-west, so a marker at 179°E and a view centred on 179°W
 * are neighbours on screen but a whole world apart in projected pixels. Drawing
 * the marker at its raw projected x would put it off the far edge of a viewport
 * it is visibly inside. Both are the same place; this picks the representative
 * that lands where the eye expects it.
 */
export function nearestWrappedX(
  x: number,
  reference: number,
  zoom: number,
): number {
  const scale = worldSize(zoom);
  return x + Math.round((reference - x) / scale) * scale;
}

/**
 * A view centre held so the viewport never runs off the top or bottom of the
 * world.
 *
 * Only y is clamped: the map repeats east-west, so there is no edge to run off
 * horizontally, but there is no tile above the north pole and `visibleTiles`
 * correctly refuses to ask for one - which without this leaves the top half of
 * the map as bare background. Easy to reach rather than theoretical: at the
 * widest zoom the whole world is 512 px tall, so a short downward drag on a
 * 224 px surface is enough.
 *
 * A viewport taller than the whole world can only be centred on it, which is
 * why that case is answered directly rather than by a clamp whose bounds have
 * crossed over.
 */
export function clampCenter(
  center: Point,
  height: number,
  zoom: number,
): Point {
  const world = worldSize(zoom);
  const half = height / 2;
  return {
    x: center.x,
    y:
      height >= world
        ? world / 2
        : Math.min(world - half, Math.max(half, center.y)),
  };
}

/**
 * A rectangular extent in degrees, as a geocoder reports a place's footprint.
 *
 * `west` may be greater than `east`: a box straddling the antimeridian is not
 * malformed, and the API deliberately does not reject one. A single point is
 * the degenerate case where both pairs are equal, which is what lets a place
 * with a position but no footprint go through the same path.
 */
export interface LatLonBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface FittedView {
  center: LatLon;
  zoom: number;
}

// How far in `fitBounds` is allowed to go, for a lone place that would otherwise
// fit at any zoom you like and open at the deepest. A single pin opens where the
// surrounding coast is recognisable rather than at street level, where a lone
// marker on a grid of house numbers says nothing - and, for the half of dive
// sites that are offshore, on nothing but open water. See DECISIONS.md.
export const MAX_FIT_ZOOM = 10;

// A latitude's projected y as a fraction of the world's height, which is the
// same at every zoom. Comparing extents against the viewport only needs that
// ratio, so it is computed once instead of per candidate zoom.
const unitY = (latitude: number) =>
  project({ latitude, longitude: 0 }, 0).y / TILE_SIZE;

/**
 * The view that shows every one of `boxes` inside a `width` x `height`
 * viewport, with `padding` pixels to spare on each side.
 *
 * Integer zooms only - this is for a static map that draws tiles at their own
 * level and never scales them - so the answer is the deepest whole level the
 * union still fits in, found by walking down from `MAX_FIT_ZOOM`. Nothing fits
 * at `MIN_ZOOM`? Then `MIN_ZOOM` it is: the widest view there is.
 *
 * Longitudes are unwrapped against the first box before the union, the way
 * `nearestWrappedX` picks a marker's nearest copy. A trip to Fiji and Samoa
 * spans six degrees across the antimeridian, and unioning their raw
 * coordinates would instead describe the 354 degrees of ocean going the other
 * way round the planet - a whole-world view with both pins at its edges.
 *
 * No boxes at all is not an error, it is a map with nothing to show yet: the
 * caller gets `WORLD_CENTER` at the widest zoom rather than having to
 * special-case a null.
 */
export function fitBounds(
  boxes: LatLonBounds[],
  width: number,
  height: number,
  padding = 0,
): FittedView {
  if (boxes.length === 0) {
    return { center: { ...WORLD_CENTER }, zoom: MIN_ZOOM };
  }

  let south = MAX_LATITUDE;
  let north = -MAX_LATITUDE;
  let west = Infinity;
  let east = -Infinity;
  // The first box's west edge, which every later box is unwrapped against.
  let reference = 0;

  boxes.forEach((box, index) => {
    // Min/max rather than trusting the order: this also renders form state on
    // its way to the API, so it meets boxes the API's validation has not seen.
    south = Math.min(south, clampLatitude(Math.min(box.south, box.north)));
    north = Math.max(north, clampLatitude(Math.max(box.south, box.north)));

    // The box's width taken as a signed span first, so the antimeridian case
    // (east folding back behind west) stays one interval instead of becoming a
    // negative one, while a genuinely zero-width point stays a point.
    const signed = box.east - box.west;
    const span = signed >= 0 ? Math.min(signed, 360) : signed + 360;
    let boxWest = wrapLongitude(box.west);

    if (index === 0) {
      reference = boxWest;
    } else {
      boxWest += Math.round((reference - boxWest) / 360) * 360;
    }
    west = Math.min(west, boxWest);
    east = Math.max(east, boxWest + span);
  });

  const spanX = Math.min(east - west, 360) / 360;
  const spanY = unitY(south) - unitY(north);

  // A padding wider than the frame would otherwise demand a negative extent and
  // force MIN_ZOOM; one pixel is the smallest honest ask.
  const availableWidth = Math.max(1, width - 2 * padding);
  const availableHeight = Math.max(1, height - 2 * padding);

  let zoom = MIN_ZOOM;
  for (let candidate = MAX_FIT_ZOOM; candidate > MIN_ZOOM; candidate--) {
    const scale = worldSize(candidate);
    if (spanX * scale <= availableWidth && spanY * scale <= availableHeight) {
      zoom = candidate;
      break;
    }
  }

  // The midpoint of the *projected* extent, not the average of the two
  // latitudes: Mercator stretches towards the poles, so the two differ by
  // degrees on a view spanning hemispheres, and it is the projected one that
  // puts equal amounts of map above and below.
  const centerY = ((unitY(south) + unitY(north)) / 2) * worldSize(zoom);
  const clamped = clampCenter({ x: 0, y: centerY }, height, zoom);

  return {
    center: {
      latitude: unproject(clamped, zoom).latitude,
      longitude: wrapLongitude((west + east) / 2),
    },
    zoom,
  };
}

export interface VisibleTile {
  // Stable across a pan, and distinct per repeated world, so React keeps the
  // same <img> element (and its already-decoded bitmap) as the grid shifts.
  key: string;
  // Tile indices to request: `x` is wrapped into [0, 2**zoom), `y` never needs
  // to be because tiles outside the poles are skipped entirely.
  x: number;
  y: number;
  zoom: number;
  // Offset from the viewport's north-west corner, in CSS pixels.
  left: number;
  top: number;
}

/**
 * Every tile touching a `width` x `height` viewport centred on `center`.
 *
 * Rows above the north edge or below the south edge are omitted rather than
 * clamped: there is no tile there, and requesting one is a 404 per frame.
 * Columns are not omitted but wrapped, so panning east past the antimeridian
 * keeps drawing map instead of running off into empty space.
 */
export function visibleTiles(
  center: Point,
  width: number,
  height: number,
  zoom: number,
): VisibleTile[] {
  const count = tileCount(zoom);
  const originX = center.x - width / 2;
  const originY = center.y - height / 2;

  const firstX = Math.floor(originX / TILE_SIZE);
  const lastX = Math.ceil((originX + width) / TILE_SIZE) - 1;
  const firstY = Math.floor(originY / TILE_SIZE);
  const lastY = Math.ceil((originY + height) / TILE_SIZE) - 1;

  const tiles: VisibleTile[] = [];
  for (let y = firstY; y <= lastY; y++) {
    if (y < 0 || y >= count) continue;
    for (let x = firstX; x <= lastX; x++) {
      tiles.push({
        key: `${zoom}/${x}/${y}`,
        x: ((x % count) + count) % count,
        y,
        zoom,
        left: x * TILE_SIZE - originX,
        top: y * TILE_SIZE - originY,
      });
    }
  }
  return tiles;
}

// What `{r}` becomes in a template asked for at twice the density. Leaflet and
// OpenLayers both spell it this way, and so do the providers that serve one.
const HIGH_DENSITY = "@2x";

/**
 * A tile URL from a `{z}/{x}/{y}` template.
 *
 * `{r}` - the placeholder for a provider's high-density variant - resolves to
 * nothing at `density` 1 and to `@2x` above it. A template without one comes
 * back unchanged, which is what lets a self-hoster's tile server that serves no
 * such variant carry on being asked only for what it has.
 */
export function tileUrl(
  template: string,
  x: number,
  y: number,
  zoom: number,
  density = 1,
): string {
  return template
    .replace(/\{z\}/g, String(zoom))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y))
    .replace(/\{r\}/g, density > 1 ? HIGH_DENSITY : "");
}

/**
 * The `srcSet` offering one tile at both densities, or `undefined` for a
 * template with no high-density variant to offer.
 *
 * Which one to draw is left to the browser rather than decided here from
 * `devicePixelRatio`, for two reasons. That value exists only in the browser,
 * so a `src` derived from it differs between the server's render and the
 * client's first one - a hydration mismatch, over a map tile. And of the two
 * candidates the browser fetches only the one it picks, so offering both costs
 * one request, not two.
 *
 * `undefined` rather than a lone `1x` candidate: a template with no `{r}` would
 * otherwise be advertising a file as its own double-resolution variant, which
 * is a claim about the pixels in it that nothing has checked.
 */
export function tileSrcSet(
  template: string,
  x: number,
  y: number,
  zoom: number,
): string | undefined {
  if (!template.includes("{r}")) return undefined;
  return (
    `${tileUrl(template, x, y, zoom)} 1x, ` +
    `${tileUrl(template, x, y, zoom, 2)} 2x`
  );
}

// OpenStreetMap's own standard tiles. Not the first choice here - Carto's
// Positron/Dark Matter were, for a matched dark variant this has no answer to -
// and they were abandoned on 2026-08-28 when every keyless Carto tile turned out
// to arrive stamped "API KEY REQUIRED" across the map, at every zoom, in every
// style, at both densities. See DECISIONS.md for what else was decoded that day:
// of the providers that answer an unregistered request from any domain at all,
// this is the only one that still carries place names.
//
// Deliberately the bare host rather than the `{s}` subdomain rotation: sharding
// is a workaround for HTTP/1.1 connection limits that HTTP/2 made pointless, and
// one fixed host is one exact CSP `img-src` source instead of a wildcard.
//
// No `{r}`, because there is no `@2x` here to ask for. The placeholder is still
// filled for a configured template that has one - see `tileSrcSet` - which on
// today's evidence means a provider the operator holds a key for.
export const DEFAULT_TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// A licence condition of the data, not a nicety - rendered over the map itself.
// Written in the markdown link syntax `parseAttribution` understands, so the
// credit can point at the licence rather than merely naming it. The OSMF tile
// policy asks for it plainly visible, which is also why it is not behind a
// toggle.
export const DEFAULT_TILE_ATTRIBUTION =
  "[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)";

export interface AttributionPart {
  text: string;
  // Absent for a plain run of text between (or instead of) links.
  href?: string;
}

// `[label](href)`, the one piece of markdown worth supporting here.
const ATTRIBUTION_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * An attribution string as text runs and links, ready to render as elements.
 *
 * Structured rather than handed over as HTML because `react/no-danger` is an
 * error in this repo, and rightly so: this string comes from an environment
 * variable, and `dangerouslySetInnerHTML` on config is how a self-hoster's typo
 * becomes an injection. Building React nodes from parsed parts keeps the escape
 * hatch shut.
 *
 * Only `http`/`https` links survive. Nothing else is a licence page, and a
 * `javascript:` href reaching an anchor would be an own goal for the sake of a
 * credit line.
 */
export function parseAttribution(value: string): AttributionPart[] {
  const parts: AttributionPart[] = [];
  let index = 0;

  for (const match of value.matchAll(ATTRIBUTION_LINK)) {
    const [whole, text, href] = match;
    const before = value.slice(index, match.index);
    if (before) parts.push({ text: before });

    let safe = false;
    try {
      const { protocol } = new URL(href);
      safe = protocol === "http:" || protocol === "https:";
    } catch {
      safe = false;
    }
    // A link that cannot be followed still has to be *credited*, so the label
    // survives as plain text rather than the whole entry being dropped.
    parts.push(safe ? { text, href } : { text });
    index = match.index + whole.length;
  }

  const rest = value.slice(index);
  if (rest) parts.push({ text: rest });
  return parts;
}

export interface TileSource {
  light: string;
  dark: string;
  attribution: string;
}

/** What an operator configured, before the defaults are applied. */
export interface TileConfig {
  light?: string;
  dark?: string;
  attribution?: string;
  // Substituted for `{key}` in either template. A separate variable rather than
  // something the operator pastes into both URLs: it is written once, and it is
  // the one part of the tile configuration that is a credential.
  apiKey?: string;
}

// The placeholder a keyed provider's template carries. Every one of them spells
// the parameter differently - Carto `?key=`, Stadia `?api_key=` - so the query
// string belongs to the operator's template and only the value comes from here.
const API_KEY = "{key}";

function withApiKey(template: string, apiKey?: string): string {
  if (!template.includes(API_KEY)) return template;
  if (!apiKey) {
    // Said in production too, like `tileOrigins`: the tile request goes out with
    // an empty key and comes back a 401 or a watermark, and neither of those
    // says which variable was never set.
    console.warn(
      `[map-tiles] Tile template wants an API key but MAP_TILE_API_KEY is ` +
        `unset: ${template}. Tiles will be requested with an empty key.`,
    );
  }
  // split/join rather than a `/g` regex: `.test()` on a global regex advances
  // its own lastIndex, so the same template can answer differently on the
  // second call.
  return template.split(API_KEY).join(apiKey ?? "");
}

/**
 * The configured tile source, or the keyless OpenStreetMap default.
 *
 * An unset dark template always falls back to the light one, and that single
 * rule covers both cases that reach it. Configure nothing and there is no dark
 * variant to fall back to - OpenStreetMap has none, which is what
 * `needsDarkFilter` exists to answer. Configure only the light one and that is
 * "use my tiles", not "use mine in the daytime and a stranger's at night".
 *
 * The values are passed in rather than read here: they reach the browser from
 * `lib/runtime-config.ts` through `contexts/ConfigContext.tsx`, so that a
 * published image can be pointed at another tile server without a rebuild.
 */
export function tileSource(config: TileConfig = {}): TileSource {
  const light = withApiKey(config.light || DEFAULT_TILE_URL, config.apiKey);
  return {
    light,
    dark: config.dark ? withApiKey(config.dark, config.apiKey) : light,
    attribution: config.attribution || DEFAULT_TILE_ATTRIBUTION,
  };
}

/**
 * Whether the dark theme's tiles have to be darkened by the app, because the
 * provider has no dark variant of its own.
 *
 * True exactly when the two templates are the same string, which is what
 * `tileSource` leaves behind for a provider that offers one set of tiles. The
 * renderers answer it with a CSS `invert(1) hue-rotate(180deg)` over the tile
 * layer alone - a real dark basemap where one exists is always better, and an
 * operator who configures one turns this off by doing so. See DECISIONS.md.
 */
export function needsDarkFilter(source: TileSource): boolean {
  return source.dark === source.light;
}

/**
 * The origins the tile templates load from, for the CSP `img-src` in
 * `proxy.ts`.
 *
 * Shared with the renderer on purpose: a tile host hardcoded on one side and
 * absent from the other fails as a blocked request rather than a visibly wrong
 * URL, which is a far worse thing to debug.
 *
 * A malformed template yields no origin at all instead of throwing. This runs
 * in middleware, in the request path, so a typo'd env var would otherwise take
 * the whole site down over an optional map.
 */
export function tileOrigins(source: TileSource): string[] {
  const origins = [source.light, source.dark].flatMap((template) => {
    try {
      const { origin, protocol } = new URL(template);
      // `new URL` only throws when there is no parseable scheme at all. A typo
      // like "htp://" parses happily as a non-special scheme and yields the
      // opaque origin "null", which reaches `img-src` as the literal token
      // `null` - discarded by browsers as an invalid source with nothing said
      // about why. Treated as malformed so it takes the diagnostic below.
      if (protocol !== "http:" && protocol !== "https:")
        throw new Error(protocol);
      return [origin];
    } catch {
      // Failing closed keeps middleware up, but it also means every tile is
      // then blocked by a CSP that simply never named the host - and the
      // console says only that, not which variable caused it. Naming it here is
      // the difference between a two-minute fix and an afternoon.
      //
      // Said in production too, unlike the dev-only warnings elsewhere: the
      // variable is read at runtime now, so a running instance is exactly where
      // a mistyped one shows up, and `proxy.ts` derives this once per process
      // rather than per request - so it is one line in the log, not a flood.
      console.warn(
        `[map-tiles] Ignoring malformed tile URL template: ${template}. ` +
          "Set MAP_TILE_URL to an absolute URL, or the map's tiles will be " +
          "blocked by the Content-Security-Policy.",
      );
      return [];
    }
  });
  return [...new Set(origins)];
}
