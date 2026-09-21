// A place, between the geocoder and the two forms that record one. Both the
// dive site form and a trip part's row fill the same object from the same
// response, so the mapping is written once here rather than slightly
// differently in each of them.

import type { GeocodeResult } from "@/lib/api/geocoding";
import type { LocationFormValue } from "@/lib/validations/location";

/**
 * A geocoder result as a place.
 *
 * `name` is the API's composed short form - the place and its country, "Dahab,
 * Egypt" - because that is the place as a person writes it, and it is what
 * every surface renders. `full_name` is the provider's own label, "Dahab, South
 * Sinai, 45214, Egypt": a postcode and an administrative level nobody writes in
 * a dive log, kept because an export should carry the fullest form the source
 * held, and shown nowhere.
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

interface LabelledPlace {
  name?: string | null;
  full_name?: string | null;
}

/**
 * A place's fuller label with the leading repeat of its own name taken off, or
 * `undefined` when that leaves nothing.
 *
 * For a surface that shows a name and a label beside it, where the label starts
 * with the name: "Dahab" and "Dahab, Egypt" read together as "Dahab, Dahab,
 * Egypt". Only the leading parts the name itself repeats are dropped, so a site
 * named "Blue Hole" keeps every word of "Dahab, Egypt" - what goes is a
 * duplicate, not context, and the context is the whole reason the label is on
 * screen.
 *
 * Nothing renders a stored place's `full_name`, so the one caller left is the
 * dive site place search, which composes both arguments from a `GeocodeResult`:
 * the row's own bare name against the API's composed form, which is what
 * separates two same-named results in the menu.
 *
 * `undefined` rather than "" so a caller can drop the element entirely with
 * `&&` - a place whose label says no more than its name gets no second line
 * rather than an empty one.
 */
export function formatLocationContext(
  place: LabelledPlace,
): string | undefined {
  const label = labelParts(place.full_name);
  const name = labelParts(place.name);

  // Aligned part by part, not "does the label contain the name": "Dahab" is a
  // repeat at the front of "Dahab, South Sinai" and a genuine part of "Blue
  // Hole, Dahab, South Sinai".
  let repeated = 0;
  while (
    repeated < name.length &&
    repeated < label.length &&
    label[repeated].toLowerCase() === name[repeated].toLowerCase()
  ) {
    repeated++;
  }

  const rest = label.slice(repeated);
  return rest.length > 0 ? rest.join(", ") : undefined;
}

// A comma-separated label as its parts, blanks dropped - which is also what
// makes a missing label an empty list rather than [""].
function labelParts(label?: string | null): string[] {
  return (label ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
