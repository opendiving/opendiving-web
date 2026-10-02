"use client";

import type { ReactNode } from "react";
import { Luggage } from "lucide-react";
import { Trip } from "@/lib/api/trips";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { MapHero } from "@/components/ui/map-hero";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { tripFigures } from "@/lib/trip-figures";
import { useUnits } from "@/hooks/useUnits";

// This page has room for the month spelled out, unlike a trip card.
const LONG_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

// The trip page's heading: the trip card drawn the width of the window.
export function TripHero({
  trip,
  actions,
}: {
  trip: Trip;
  actions?: ReactNode;
}) {
  const locations = tripPartLocations(trip.parts);
  const mappedLocations = locations.filter(
    (location) => location.latitude != null && location.longitude != null,
  );
  // Only when some part of the trip carries a date; deliberately no fall back
  // to the trip's creation date.
  const dates = formatTripSpan(trip.parts, LONG_DATE);
  // Whether there is a place to name, which is what decides the separator.
  const placeNames = formatTripLocationNames(locations);
  const units = useUnits();

  return (
    <MapHero
      backHref="/trips"
      backLabel="Back to trips"
      icon={Luggage}
      actions={actions}
      title={trip.name}
      // One line, as the trip card's.
      subtitle={
        (dates || placeNames) && (
          <>
            {dates}
            {dates && placeNames ? " · " : null}
            <TripLocationsLabel locations={locations} />
          </>
        )
      }
      figures={tripFigures(trip, units)}
      mapCredit
      // The whole world for a trip with no place on the map yet, as its card
      // shows.
      backdrop={({ map }) => (
        <LocationsMap
          locations={mappedLocations}
          showWhenEmpty
          subject={`the places of ${trip.name}`}
          {...map}
        />
      )}
    />
  );
}
