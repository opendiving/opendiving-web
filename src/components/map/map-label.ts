import { formatTripLocationNames } from "@/lib/trip-locations";
import type { PlacedLocation } from "@/lib/map-picture";

/**
 * What a screen reader is told a map is of: a live map's, and a card's picture,
 * which was drawn from positions alone and so is labelled from the record.
 *
 * Every place has a name, but nothing stops one being blank, and "Map of "
 * reads as a bug to anyone hearing it - hence the caller's `subject` as the
 * fallback. `formatTripLocationNames` is the same joining rule the trip's own
 * header uses, and it drops the blanks.
 *
 * Uncapped, unlike every surface that is looked at: a cap withholds names from a
 * reader who cannot see the pins, which is the one reader this label exists for.
 * The separator is shared with those surfaces, because it is about telling one
 * place from the next and withholds nothing.
 *
 * The empty world says what it is rather than borrowing the label of the places
 * it doesn't have: "Map of the trip's locations" over a blank world is wrong in
 * exactly the place nobody looking at the screen can see it.
 */
export function mapLabel(placed: PlacedLocation[], subject: string): string {
  if (placed.length === 0) return `Map of the world, awaiting ${subject}`;
  return `Map of ${formatTripLocationNames(placed) ?? subject}`;
}
