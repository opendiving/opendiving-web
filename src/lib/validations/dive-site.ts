import { z } from "zod";
import { notesField } from "./notes";
import { locationSchema } from "./location";

// Latitude/longitude are edited as free-typed, regex-validated strings and
// converted to numbers right before the API call, exactly like the dive form's
// "MM:SS" duration: a `z.preprocess()`/`.transform()` here would collapse the
// `z.input<>`-derived form type and break `useForm()`'s binding (DECISIONS.md).
// "" is the live "empty" value - never `undefined` - so react-hook-form doesn't
// fall back to re-displaying the default when a field is cleared.
const COORDINATE_REGEX = /^-?\d+(?:\.\d+)?$/;

const isSet = (value?: string) => !!value?.trim();

const coordinateField = (limit: number, label: string, example: string) =>
  z
    .string()
    .optional()
    .refine((value) => !isSet(value) || COORDINATE_REGEX.test(value!.trim()), {
      message: `${label} must be a decimal number, e.g. ${example}`,
    })
    .refine(
      (value) => !isSet(value) || Math.abs(Number(value!.trim())) <= limit,
      { message: `${label} must be between -${limit} and ${limit}` },
    );

// One schema for both creating and editing a dive site: `DiveSiteDialog` is the
// only form for either, and it always shows every field, so an update never
// sends a partial object.
export const diveSiteFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "Dive site name is required")
      .max(255, "Dive site name cannot exceed 255 characters"),
    // The whole place, not a text box over its name. The dialog seeds this from
    // the site it was handed and PATCHes it back, so a field holding only the
    // name would drop a picked locality's full name, its centre and its box on
    // every edit of an existing site. `null` is a site with no locality
    // recorded, and sending it explicitly is how a wrong one is corrected.
    location: locationSchema.nullish(),
    latitude: coordinateField(90, "Latitude", "27.8506"),
    longitude: coordinateField(180, "Longitude", "34.3136"),
    notes: notesField().optional(),
  })
  // Both-or-neither, mirroring the API's rule: half a position is not a partial
  // fix, it's meaningless. Two refinements rather than one so the message lands
  // on the field that's actually missing.
  .refine((data) => !isSet(data.longitude) || isSet(data.latitude), {
    message: "Latitude is required when longitude is given",
    path: ["latitude"],
  })
  .refine((data) => !isSet(data.latitude) || isSet(data.longitude), {
    message: "Longitude is required when latitude is given",
    path: ["longitude"],
  });

export type DiveSiteFormInput = z.input<typeof diveSiteFormSchema>;

/**
 * Turns a form coordinate string into what the API wants: a number, or `null`
 * for a coordinate the diver cleared (which the API accepts, and needs, to
 * clear the stored pair).
 */
export function parseFormCoordinate(value?: string): number | null {
  return isSet(value) ? Number(value!.trim()) : null;
}

// `String()` gives the shortest round-tripping representation, so 27.8506 comes
// back as "27.8506" rather than accumulated float noise - but it switches to
// exponent notation below 1e-6 ("5e-7"), which `COORDINATE_REGEX` rejects and
// no diver would recognise. Left alone, a stored value nobody typed would block
// every save of that site, a rename included, so those fall back to fixed
// notation. The fallback caps at 20 *decimal places*, not significant digits,
// so the round-trip is exact for any value needing no more than that - which is
// everything the API can realistically return, since one degree is ~111 km and
// the truncated part is under 1e-20 degrees.
function toDecimalString(value: number): string {
  const text = String(value);
  return text.includes("e") ? value.toFixed(20).replace(/\.?0+$/, "") : text;
}

// The inverse of `parseFormCoordinate`: an API coordinate as the form's string
// value, with "" for a site that has no position.
export function formatCoordinateForForm(value?: number | null): string {
  return value === null || value === undefined ? "" : toDecimalString(value);
}

/**
 * The form's coordinate pair as numbers, or `null` when there isn't a usable
 * one yet.
 *
 * A different question from `parseFormCoordinate`'s. That one asks what the API
 * should be sent, per field, and trusts the resolver to have run first. This
 * one asks whether the map can point at something *right now* - it is read on
 * every keystroke, including the half-typed "-" and the "91" that is on its way
 * to "9.1" - so it validates rather than trusting, and answers for the pair,
 * since half a position is nowhere.
 */
export function parseFormPosition(
  latitude?: string,
  longitude?: string,
): { latitude: number; longitude: number } | null {
  if (!isSet(latitude) || !isSet(longitude)) return null;
  if (!COORDINATE_REGEX.test(latitude!.trim())) return null;
  if (!COORDINATE_REGEX.test(longitude!.trim())) return null;

  const parsed = {
    latitude: Number(latitude!.trim()),
    longitude: Number(longitude!.trim()),
  };
  if (Math.abs(parsed.latitude) > 90) return null;
  if (Math.abs(parsed.longitude) > 180) return null;
  return parsed;
}

// A coordinate pair for display, or `null` when the site has no position.
export function formatCoordinates(
  latitude?: number | null,
  longitude?: number | null,
): string | null {
  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;
  return `${toDecimalString(latitude)}, ${toDecimalString(longitude)}`;
}

// Divers copy a position out of Google Maps as one string ("27.8506, 34.3136")
// far more often than they type two fields, so a paste of that shape is split
// across both inputs instead of landing wholesale in one of them. Comma,
// semicolon or plain whitespace all separate; anything else is left alone for
// the normal per-field validation to reject.
const COORDINATE_PAIR_REGEX =
  /^\s*(-?\d+(?:\.\d+)?)\s*(?:[,;]\s*|\s+)(-?\d+(?:\.\d+)?)\s*$/;

// A bare comma between two dot-less integers is genuinely ambiguous: across
// most of Europe "-16,5" is how you write -16.5, and reading it as the pair
// (-16, 5) moves a Bali site into the Atlantic off Angola without erroring
// anywhere - both halves are in range and the pair is complete. Refusing the
// shape leaves the raw text in the field, where the per-field regex rejects it
// with a message. Nothing else is ambiguous: a decimal point anywhere settles
// it ("27.8506,34.3136"), and so does a space after the comma ("1, 2"), since
// a decimal comma is never followed by one.
const AMBIGUOUS_DECIMAL_COMMA = /^-?\d+,\d+$/;

export function parseCoordinatePair(
  text: string,
): { latitude: string; longitude: string } | null {
  const trimmed = text.trim();
  if (AMBIGUOUS_DECIMAL_COMMA.test(trimmed)) return null;
  const match = COORDINATE_PAIR_REGEX.exec(trimmed);
  if (!match) return null;
  return { latitude: match[1], longitude: match[2] };
}
