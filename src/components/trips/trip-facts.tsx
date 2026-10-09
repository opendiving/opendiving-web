import type { ReactNode } from "react";
import type { Trip } from "@/lib/api/trips";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";

/**
 * The line under a trip's name, on its card and its page's hero alike: its
 * dates, only where some part of the trip carries one - deliberately no fall
 * back to its creation date - and its places. For a mouse the places are lifted
 * over a card's link for their hover hint, and only as far as their own text
 * reaches. A finger's tap on a card means the trip, so for it they stay under
 * the link, and the trip's page answers the tap instead.
 */
export function tripFacts(trip: Trip): ReactNode[] {
  const locations = tripPartLocations(trip.parts);
  return [
    formatTripSpan(trip.parts),
    formatTripLocationNames(locations) && (
      <TripLocationsLabel
        locations={locations}
        className="relative z-10 touch:static"
      />
    ),
  ].filter(Boolean);
}
