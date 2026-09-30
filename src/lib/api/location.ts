/**
 * A place, as the geocoder described it when the diver picked it - or as they
 * typed it.
 *
 * One object with one name, carried by a dive site and by a part of a trip
 * alike. It lives in its own module because both hosts reference it and
 * neither owns it: putting it in either one would make the other import a
 * sibling resource's type for a shape that is not about that resource at all.
 *
 * A value object, not a resource: it has no uuid, it belongs to exactly one
 * host, and it is a snapshot of what the geocoder said at the time rather than
 * a row in a shared gazetteer. So a write replaces the stored one wholesale,
 * and clearing it is an explicit `null`.
 *
 * **One name.** `name` is the place as a person writes it - the name alone
 * ("Moalboal"), or extended outward through its region to its country ("Dahab,
 * South Sinai, Egypt"), which is what a geocoded pick saves. A place is not an
 * address: where it has coordinates, its town, region and country can be looked
 * up again.
 *
 * **A locality's position is not its host's.** A dive site carries its own pin
 * as well, and the two are different facts - the entry point against the town
 * the geocoder resolved. Nothing fills either from the other.
 */
export interface Location {
  name: string;
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
