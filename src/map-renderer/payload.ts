// What `POST /render` accepts: one tile of the Web Mercator grid, in a theme,
// labelled in English and optionally one more language.
//
// Nothing of any record: the API stores a tile once for every account whose
// map shows it, so the renderer is never told whose map that is. Anything
// beyond these keys is refused rather than ignored - the API stores what it is
// handed under exactly these coordinates, and a field this side read but the
// API left out of the key would be a tile stored under the wrong name.

import { MAX_FIT_ZOOM } from "@/lib/basemap";

export type Theme = "light" | "dark";

/**
 * The languages a tile's labels can carry beside English: every `name:xx` the
 * basemap's vector tiles hold except English itself and the script variants.
 * Mirrored in the API (`opendiving-api` `services/map_tiles.py`), which falls
 * back to English alone for anything else - so the tiles it stores stay
 * bounded whatever language a client asks in.
 */
export const LABEL_LANGUAGES = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "br",
  "bs",
  "ca",
  "co",
  "cs",
  "cy",
  "da",
  "de",
  "el",
  "eo",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fr",
  "fy",
  "ga",
  "gd",
  "he",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "ka",
  "kk",
  "kn",
  "ko",
  "ku",
  "la",
  "lb",
  "lt",
  "lv",
  "mk",
  "ml",
  "mt",
  "nl",
  "no",
  "oc",
  "pa",
  "pl",
  "pnb",
  "pt",
  "rm",
  "ro",
  "ru",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "ta",
  "te",
  "th",
  "tok",
  "tr",
  "uk",
  "ur",
  "vi",
  "zh",
] as const;

export type LabelLanguage = (typeof LABEL_LANGUAGES)[number];

export interface TilePayload {
  kind: "tile";
  theme: Theme;
  z: number;
  x: number;
  y: number;
  /** The second line of each label; absent, a label is its English line. */
  language?: LabelLanguage;
}

/** A body that breaks the shape `POST /render` takes: the 400. */
export class PayloadError extends Error {}

const KEYS = ["kind", "theme", "z", "x", "y"] as const;
const OPTIONAL_KEYS = ["language"] as const;

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
    (key) => !([...KEYS, ...OPTIONAL_KEYS] as readonly string[]).includes(key),
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
  const payload: TilePayload = {
    kind: "tile",
    theme,
    z,
    x: within(body.x, last, "x"),
    y: within(body.y, last, "y"),
  };
  // Present means one of the list: the API sends no key for English alone, so
  // a `null` or an unknown code is a client this side does not understand.
  if ("language" in body) {
    const { language } = body;
    if (!(LABEL_LANGUAGES as readonly unknown[]).includes(language)) {
      throw new PayloadError("language must be one of the label languages");
    }
    payload.language = language as LabelLanguage;
  }
  return payload;
}
