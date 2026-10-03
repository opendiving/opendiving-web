"use client";

import type { ReactNode } from "react";
import { Luggage } from "lucide-react";
import { Trip } from "@/lib/api/trips";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { UnplacedBackdrop } from "@/components/ui/backdrop-card";
import { MapHero } from "@/components/ui/map-hero";
import { tripPartLocations } from "@/lib/trip-parts";
import { tripFacts } from "@/components/trips/trip-facts";
import { FactsLine } from "@/components/ui/icon-fact";
import { tripFigures } from "@/lib/trip-figures";
import { useUnits } from "@/hooks/useUnits";
import type { ReturnTarget } from "@/lib/return-to";

// The trip page's heading: the trip card drawn the width of the window.
export function TripHero({
  trip,
  back,
  actions,
}: {
  trip: Trip;
  back: ReturnTarget;
  actions?: ReactNode;
}) {
  const locations = tripPartLocations(trip.parts);
  const facts = tripFacts(trip);
  const units = useUnits();

  return (
    <MapHero
      backHref={back.href}
      backLabel={back.label}
      icon={Luggage}
      actions={actions}
      title={trip.name}
      subtitle={facts.length > 0 && <FactsLine facts={facts} />}
      figures={tripFigures(trip, units)}
      mapCredit
      // The whole world for a trip with no place on the map yet, as its card
      // shows, and the card's water where this instance draws no map.
      backdrop={({ map, covered }) => (
        <MapBackdrop
          locations={locations}
          showWhenEmpty
          subject={`the places of ${trip.name}`}
          {...map}
          water={
            <UnplacedBackdrop
              coveredBottom={covered.bottom}
              coveredTop={covered.top}
              icon={Luggage}
            />
          }
        />
      )}
    />
  );
}
