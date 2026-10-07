"use client";

import Link from "next/link";
import { Luggage } from "lucide-react";
import { Trip } from "@/lib/api/trips";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  UnplacedBackdrop,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { MapBackdrop } from "@/components/map/map-backdrop";
import { tripPartLocations } from "@/lib/trip-parts";
import { tripFacts } from "@/components/trips/trip-facts";
import { FactsLine } from "@/components/ui/icon-fact";
import { tripFigures } from "@/lib/trip-figures";
import { useUnits } from "@/hooks/useUnits";
import { useWithReturnTo } from "@/hooks/useReturnTo";
import { Edit } from "lucide-react";

interface TripCardProps {
  trip: Trip;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One trip as a card, on /trips and in Home's recent trips: a map of
// its places as the backdrop - the whole world for a trip with no place on one
// yet, and the map's water where this instance draws no map - and
// what its dives add up to, as far as three figures carry it. The trip's page
// draws the same card the width of the window (`TripHero`).
export function TripCard({
  trip,
  onEdit,
  onDelete,
  isDeleting,
}: TripCardProps) {
  const locations = tripPartLocations(trip.parts);
  const facts = tripFacts(trip);
  const units = useUnits();
  const withReturnTo = useWithReturnTo();
  // The first three of what the trip adds up to, which `tripFigures` orders so
  // that a trip with species shows those over its depth.
  const figures: BackdropCardFigure[] = tripFigures(trip, units).slice(0, 3);

  return (
    <BackdropCard
      actionsLabel={`Actions for ${trip.name}`}
      actions={
        <>
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </>
      }
      backdrop={(coveredBottom) => (
        <MapBackdrop
          locations={locations}
          subject={`the places of ${trip.name}`}
          showWhenEmpty
          coveredBottom={coveredBottom}
          water={
            <UnplacedBackdrop coveredBottom={coveredBottom} icon={Luggage} />
          }
        />
      )}
    >
      <Link
        href={withReturnTo(`/trips/${trip.uuid}`)}
        className={BACKDROP_CARD_LINK}
      >
        {trip.name}
      </Link>
      {facts.length > 0 && (
        <div className="text-xs">
          <FactsLine facts={facts} />
        </div>
      )}
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
