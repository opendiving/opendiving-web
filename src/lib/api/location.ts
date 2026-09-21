/**
 * A place, as the geocoder described it when the diver picked it - or as they
 * typed it.
 *
 * One object with one pair of names, carried by a dive site and by a part of a
 * trip alike. It lives in its own module because both hosts reference it and
 * neither owns it: putting it in either one would make the other import a
 * sibling resource's type for a shape that is not about that resource at all.
 *
 * A value object, not a resource: it has no uuid, it belongs to exactly one
 * host, and it is a snapshot of what the geocoder said at the time rather than
 * a row in a shared gazetteer. So a write replaces the stored one wholesale,
 * and clearing it is an explicit `null`.
 *
 * **Two names, and only the short one is ever rendered.** `name` is the place
 * as a person writes it - the name alone ("Moalboal"), or the name with its
 * country ("Dahab, Egypt"). `full_name` is the fullest written form the lookup
 * returned ("Dahab, South Sinai Governorate, Egypt"); it is stored so an export
 * carries what the source held, and no surface in this app shows it. Nothing
 * binds the two: a lookup asked about a local name often answers with the
 * district around it, so "Sipadan Island Park" may carry "Sabah, Malaysia" -
 * shorter, and not containing it.
 *
 * **A locality's position is not its host's.** A dive site carries its own pin
 * as well, and the two are different facts - the entry point against the town
 * the geocoder resolved. Nothing fills either from the other.
 */
export interface Location {
  name: string;
  full_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  // The place's extent, when the provider gave one. All four or none: a box is
  // only meaningful whole, and it needs a position. West may exceed east - a
  // box straddling the antimeridian is not malformed.
  bbox_south?: number | null;
  bbox_north?: number | null;
  bbox_west?: number | null;
  bbox_east?: number | null;
}
