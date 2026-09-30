// A place, between the geocoder and the two forms that record one. Both the
// dive site form and a trip part's row fill the same object from the same
// response, so the mapping is written once here rather than slightly
// differently in each of them.

import type { GeocodeResult } from "@/lib/api/geocoding";
import type { LocationFormValue } from "@/lib/validations/location";

/**
 * A geocoder result as a place.
 *
 * `name` is the API's composed short form - the place and its country, "Ko Tao,
 * Thailand" - because that is the place as a person writes it. A trip part
 * renames it with the region as well, in `tripPartLocation`. `full_name` is the
 * API's fuller label, "Ko Tao, Ko Tao Subdistrict, Ko Pha-ngan, Surat Thani
 * Province, Thailand": administrative levels nobody writes in a dive log, kept
 * because an export should carry the fullest form the source held, and shown
 * nowhere.
 *
 * The centre and the box are the *place's*, which is what a forward search
 * answers with. A reverse geocode must not go through here: the coordinates it
 * returns are the host's own position, so adopting them would file the pin a
 * diver dropped as the centre of the town around it.
 */
export function geocodeResultToLocation(
  result: GeocodeResult,
): LocationFormValue {
  return {
    name: result.location,
    full_name: result.display_name,
    latitude: result.latitude,
    longitude: result.longitude,
    bbox_south: result.bbox_south,
    bbox_north: result.bbox_north,
    bbox_west: result.bbox_west,
    bbox_east: result.bbox_east,
  };
}

/**
 * Where a place sits, as one string: `region, country` where both are known,
 * whichever one is where only one is, and `null` where neither is.
 *
 * The one composition behind both halves of the dive site search, so a catalog
 * row and a geocoder row with the same region and country read the same words.
 */
export function formatPlaceContext(
  region?: string | null,
  country?: string | null,
): string | null {
  const parts = [region, country].filter(
    (part): part is string => !!part?.trim(),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * A geocoder result as both place pickers show it: the place's own name, and
 * where it is as `region, country` - "Moalboal" and "Cebu, Philippines", read
 * together as "Moalboal, Cebu, Philippines". Composed as a catalog row's place
 * context is, so the two halves of the dive site menu read alike.
 *
 * A result that matched an address has no name of its own, so the short form
 * the API composes stands in. A context part the name already says is dropped -
 * the country row "Philippines" gets no context at all - which
 * `diveSitePlaceContext` does not do, because it also writes a catalog pick's
 * Location and that must stay what it is.
 */
export function geocodeResultLabel(result: GeocodeResult): {
  name: string;
  context: string | null;
} {
  const name = result.name ?? result.location;
  const region = unrepeated(result.region, name);
  const country = unrepeated(result.country, name, region);
  return { name, context: formatPlaceContext(region, country) };
}

/**
 * `part`, unless it only repeats a comma-separated part of one of `labels` -
 * compared whole and case-insensitively, so "Cebu" repeats "Moalboal, Cebu" but
 * not "Cebu City". `null` for a repeat and for a blank.
 *
 * A menu row joins its name and hint with ", ", so a hint part the name already
 * holds reads twice: the country row "Philippines" would otherwise say
 * "Philippines, Philippines".
 */
export function unrepeated(
  part: string | null | undefined,
  ...labels: (string | null | undefined)[]
): string | null {
  const trimmed = part?.trim();
  if (!trimmed) return null;
  const said = labels.flatMap((label) =>
    (label ?? "").split(",").map((each) => each.trim().toLowerCase()),
  );
  return said.includes(trimmed.toLowerCase()) ? null : trimmed;
}
