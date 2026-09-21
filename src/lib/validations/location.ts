import { z } from "zod";

// Coordinates here are plain numbers, not the regex-validated strings the dive
// site form uses for the site's own pin (DECISIONS.md): nobody types a
// locality's centre. It arrives whole from a geocoder result the diver picked,
// or it is absent because the place was typed in by hand - there is no
// half-entered "-" state to be tolerant of. The bounds are the API's, so a
// nonsense object is caught before the round trip.
const nullableNumber = (limit: number) =>
  z.number().min(-limit).max(limit).nullish();

// The API's own ceilings, exported because the fields that build a place have
// to enforce them as they go rather than leave them to submit. A place sits
// inside a form value under one `FormField`, and `FormMessage` renders
// `String(error.message)` - which, for an error react-hook-form reports at
// `parts.0.location.name`, is the word "undefined" in red. The diver would be
// told nothing, by a form that had also stopped saving.
export const MAX_LOCATION_NAME_LENGTH = 255;
export const MAX_LOCATION_FULL_NAME_LENGTH = 512;

/**
 * One place as either form holds it - a dive site's locality and a trip part's
 * are the same object, so they are the same schema.
 *
 * `name` is the only member that is always there: a place typed in by hand,
 * because the geocoder had nothing for it, has a name and nothing else.
 * `full_name` is the fullest form a lookup returned, stored for the export and
 * rendered nowhere.
 */
export const locationSchema = z.object({
  name: z
    .string()
    .min(1, "Location name is required")
    .max(
      MAX_LOCATION_NAME_LENGTH,
      `Location name cannot exceed ${MAX_LOCATION_NAME_LENGTH} characters`,
    ),
  full_name: z
    .string()
    .max(
      MAX_LOCATION_FULL_NAME_LENGTH,
      `Location description cannot exceed ${MAX_LOCATION_FULL_NAME_LENGTH} characters`,
    )
    .nullish(),
  latitude: nullableNumber(90),
  longitude: nullableNumber(180),
  bbox_south: nullableNumber(90),
  bbox_north: nullableNumber(90),
  bbox_west: nullableNumber(180),
  bbox_east: nullableNumber(180),
});

// One place as a form holds it: self-describing, so a picker never has to
// resolve an id back into something to show.
export type LocationFormValue = z.input<typeof locationSchema>;
