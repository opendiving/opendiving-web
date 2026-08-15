// Web-Mercator slippy-map arithmetic for the hand-rolled map picker
// (`components/sites/map-picker.tsx`), in the spirit of `lib/chart-scale.ts`:
// the maths lives here, pure and tested, and the component only renders what it
// returns.
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
// Carto's basemaps stop at 20; 18 is street level and plenty for pinning an
// entry point, without inviting a zoom that returns blank tiles.
export const MAX_ZOOM = 18;

export interface LatLon {
  latitude: number;
  longitude: number;
}

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

/**
 * A tile URL from a `{z}/{x}/{y}` template.
 */
export function tileUrl(
  template: string,
  x: number,
  y: number,
  zoom: number,
): string {
  return template
    .replace(/\{z\}/g, String(zoom))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

// Carto's Positron/Dark Matter, which are OpenStreetMap data restyled. Two
// reasons to prefer them over OSM's own standard tiles: there is a dark variant
// that matches the app's theme, and the OSMF tile policy explicitly discourages
// pointing a broad user base at their servers by default.
//
// Deliberately the bare host rather than the documented `{s}.basemaps...`
// subdomain rotation: sharding is a workaround for HTTP/1.1 connection limits
// that HTTP/2 made pointless, and one fixed host is one exact CSP `img-src`
// source instead of a wildcard.
export const DEFAULT_TILE_URL =
  "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png";
export const DEFAULT_DARK_TILE_URL =
  "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png";
// A licence condition of the data, not a nicety - rendered over the map itself.
// Written in the markdown link syntax `parseAttribution` understands, so the
// credit can point at the licence rather than merely naming it.
export const DEFAULT_TILE_ATTRIBUTION =
  "[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) " +
  "[© CARTO](https://carto.com/attributions)";

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

/**
 * The configured tile source, or the keyless Carto default.
 *
 * What an unset `NEXT_PUBLIC_MAP_TILE_URL_DARK` falls back to depends on
 * whether the light one was configured, and the two cases mean different
 * things. Configure neither and you get Carto's own matched pair. Configure
 * only the light one - a self-hoster pointing at their own tile server - and
 * that is "use my tiles", not "use mine in the daytime and a stranger's at
 * night", so it is used for both.
 */
export function tileSource(): TileSource {
  const configuredLight = process.env.NEXT_PUBLIC_MAP_TILE_URL;
  const light = configuredLight || DEFAULT_TILE_URL;
  return {
    light,
    dark:
      process.env.NEXT_PUBLIC_MAP_TILE_URL_DARK ||
      (configuredLight ? light : DEFAULT_DARK_TILE_URL),
    attribution:
      process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION,
  };
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
 * in middleware, on every request, so a typo'd env var would otherwise take the
 * whole site down over an optional map.
 */
export function tileOrigins(source: TileSource = tileSource()): string[] {
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
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[map-tiles] Ignoring malformed tile URL template: ${template}. ` +
            "Set NEXT_PUBLIC_MAP_TILE_URL to an absolute URL, or the map's " +
            "tiles will be blocked by the Content-Security-Policy.",
        );
      }
      return [];
    }
  });
  return [...new Set(origins)];
}
