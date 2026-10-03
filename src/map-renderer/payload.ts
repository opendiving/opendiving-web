// What `POST /render` accepts: one tile of the Web Mercator grid, in a theme.
//
// Nothing of any record: the API stores a tile once for every account whose
// map shows it, so the renderer is never told whose map that is. Anything
// beyond these keys is refused rather than ignored - the API stores what it is
// handed under exactly these coordinates, and a field this side read but the
// API left out of the key would be a tile stored under the wrong name.

import { MAX_FIT_ZOOM } from "@/lib/basemap";

export type Theme = "light" | "dark";

export interface TilePayload {
  kind: "tile";
  theme: Theme;
  z: number;
  x: number;
  y: number;
}

/** A body that breaks the shape `POST /render` takes: the 400. */
export class PayloadError extends Error {}

const KEYS = ["kind", "theme", "z", "x", "y"] as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// An integer from 0 to `max`, both included.
function within(value: unknown, max: number, what: string): number {
  if (!Number.isInteger(value)) {
    throw new PayloadError(`${what} must be an integer`);
  }
  const number = value as number;
  if (number < 0 || number > max) {
    throw new PayloadError(`${what} must be from 0 to ${max}`);
  }
  return number;
}

/**
 * The body, checked against the contract, or a thrown `PayloadError`.
 *
 * The zoom stops at `MAX_FIT_ZOOM`, the deepest any of the web's maps is
 * fitted at: the API refuses a deeper one before it gets here, and this side
 * refuses it too, so nothing makes the renderer a street-level tile server.
 */
export function parsePayload(body: unknown): TilePayload {
  if (!isObject(body)) throw new PayloadError("the body must be an object");
  const missing = KEYS.filter((key) => !(key in body));
  const extra = Object.keys(body).filter(
    (key) => !(KEYS as readonly string[]).includes(key),
  );
  if (missing.length > 0) {
    throw new PayloadError(`the body is missing ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    throw new PayloadError(`the body has unexpected ${extra.join(", ")}`);
  }
  if (body.kind !== "tile") throw new PayloadError('kind must be "tile"');
  const { theme } = body;
  if (theme !== "light" && theme !== "dark") {
    throw new PayloadError('theme must be "light" or "dark"');
  }
  const z = within(body.z, MAX_FIT_ZOOM, "z");
  const last = 2 ** z - 1;
  return {
    kind: "tile",
    theme,
    z,
    x: within(body.x, last, "x"),
    y: within(body.y, last, "y"),
  };
}
