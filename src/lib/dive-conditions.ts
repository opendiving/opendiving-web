import type { Dive, TideState } from "@/lib/api/dives";

/** The dive's own fields a fetch of its conditions can fill. */
export const FETCHED_FIELDS = ["air_temperature", "weather", "waves"] as const;

export type FetchedField = (typeof FETCHED_FIELDS)[number];

/** What a filled field's mark says on hover, on the card and in the forms. */
export const FETCHED_MARK_TITLE =
  "Filled in from weather data. Choosing another value replaces it.";

/**
 * The dive's fields the fetch filled that still hold the value it wrote, with that
 * value.
 *
 * Compared with the field rather than read off `filled` alone, so a mark never
 * claims a value the diver has since replaced by a route the API has not yet
 * reconciled.
 */
export function fetchedFields(
  dive: Pick<Dive, "conditions" | FetchedField>,
): Partial<Record<FetchedField, number | string>> {
  const filled = dive.conditions?.filled;
  if (!filled) return {};
  const fields: Partial<Record<FetchedField, number | string>> = {};
  for (const field of FETCHED_FIELDS) {
    const written = filled[field];
    if (written != null && dive[field] === written) fields[field] = written;
  }
  return fields;
}

/**
 * The fields a weather service filled, on the stored dive or in a form's preview,
 * each with the value it wrote, and the credit its licence asks for wherever one is
 * shown - what a dive form marks.
 */
export interface FetchedMarks {
  values: Readonly<Record<string, unknown>>;
  attribution: string;
}

/** The dive's `FetchedMarks`, or none where no field holds a fetched value. */
export function fetchedMarks(
  dive: Pick<Dive, "conditions" | FetchedField>,
): FetchedMarks | undefined {
  const values = fetchedFields(dive);
  if (!dive.conditions || Object.keys(values).length === 0) return undefined;
  return { values, attribution: dive.conditions.attribution };
}

export const TIDE_STATE_LABELS: Record<TideState, string> = {
  high: "High",
  low: "Low",
  rising: "Rising",
  falling: "Falling",
};

const COMPASS_POINTS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

/** A bearing in degrees as the nearest of the sixteen compass points. */
export function compassPoint(degrees: number): string {
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[index];
}
