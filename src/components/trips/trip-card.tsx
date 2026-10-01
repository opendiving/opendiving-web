"use client";

import Link from "next/link";
import { Trip } from "@/lib/api/trips";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DeleteMenuItem } from "@/components/ui/item-actions-menu";
import {
  BACKDROP_CARD_LINK,
  BackdropCard,
  BackdropCardFigures,
  type BackdropCardFigure,
} from "@/components/ui/backdrop-card";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";
import { Edit } from "lucide-react";

interface TripCardProps {
  trip: Trip;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One trip as a card, on /trips and in the dashboard's recent trips: its map as
// the backdrop - the whole world for a trip with no place on one yet - and what
// its dives add up to: their count and their sites' at zero too, their species
// only once there are some, and their deepest point where there are none.
export function TripCard({
  trip,
  onEdit,
  onDelete,
  isDeleting,
}: TripCardProps) {
  const locations = tripPartLocations(trip.parts);
  const mappedLocations = locations.filter(
    (location) => location.latitude != null && location.longitude != null,
  );
  // Only when some part of the trip carries a date; deliberately no fall back
  // to the trip's creation date.
  const dates = formatTripSpan(trip.parts);
  // Whether there is a place to name, which is what decides the separator.
  const placeNames = formatTripLocationNames(locations);
  const units = useUnits();
  const figures: BackdropCardFigure[] = [
    { label: "Dives", value: trip.dive_count },
    { label: "Dive Sites", value: trip.dive_site_count },
  ];
  if (trip.species_count > 0) {
    figures.push({ label: "Species Seen", value: trip.species_count });
  }
  // Whole units, as a dive card rounds its depths.
  if (figures.length < 3 && trip.max_depth != null) {
    figures.push({
      label: "Max Depth",
      value: formatDepth(trip.max_depth, units, { decimals: 0 }),
    });
  }

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
        // The whole world for a trip with no place on the map yet, so every
        // card in a list has a map and no two layouts sit side by side.
        <LocationsMap
          locations={mappedLocations}
          showWhenEmpty
          subject={`the places of ${trip.name}`}
          className="h-full rounded-[inherit] border-0 sm:h-full"
          backdrop
          coveredBottom={coveredBottom}
          snapshot
        />
      )}
    >
      <Link href={`/trips/${trip.uuid}`} className={BACKDROP_CARD_LINK}>
        {trip.name}
      </Link>
      {/* One line, as the trip page's subtitle joins the same two. The place
          is lifted over the link for its hover hint, and only as far as its
          own text reaches. */}
      {(dates || placeNames) && (
        <div className="text-xs">
          {dates}
          {dates && placeNames ? " · " : null}
          <TripLocationsLabel locations={locations} className="relative z-10" />
        </div>
      )}
      <BackdropCardFigures figures={figures} />
    </BackdropCard>
  );
}
