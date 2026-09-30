"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Trip } from "@/lib/api/trips";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { Edit } from "lucide-react";
import { cn } from "@/lib/utils";

// What the trip's dives add up to, laid out as the dive page lays out its
// duration and depths, a size down. On every trip, zeros included, and zeros
// too from an API that sends no counts yet.
function TripCounts({ trip }: { trip: Trip }) {
  const counts = [
    { label: "Dives", value: trip.dive_count ?? 0 },
    { label: "Dive Sites", value: trip.dive_site_count ?? 0 },
    { label: "Species Seen", value: trip.species_count ?? 0 },
  ];

  return (
    <dl className="mt-3 grid grid-cols-3 gap-4">
      {counts.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs font-medium">{label}</dt>
          <dd className="text-base font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface RecentTripRowProps {
  trip: Trip;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

// One trip on the dashboard's recent trips card: its map as the backdrop when
// it has a place on one, its details over the foot of it, and its actions in
// the corner.
export function RecentTripRow({
  trip,
  onEdit,
  onDelete,
  isDeleting,
}: RecentTripRowProps) {
  const locations = tripPartLocations(trip.parts);
  const mappedLocations = locations.filter(
    (location) => location.latitude != null && location.longitude != null,
  );
  const hasMap = mappedLocations.length > 0;
  // Only when some part of the trip carries a date; deliberately no fall back
  // to the trip's creation date.
  const dates = formatTripSpan(trip.parts);

  // How much of the map lies under the details, from the trip's name down, so
  // its places centre between the card's top and the name. Read as the ref attaches and followed after that, as
  // `useChartWidth` does: a name that wraps grows the block.
  const [detailsHeight, setDetailsHeight] = useState(0);
  const detailsRef = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    setDetailsHeight(element.offsetHeight);
    const observer = new ResizeObserver(() =>
      setDetailsHeight(element.offsetHeight),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    // The trip's link is stretched over the whole row rather than wrapping it:
    // a button inside an anchor is invalid, and so is the map's attribution
    // link. What has to stay reachable - the actions, the attribution, the
    // locations' hover hint - is lifted above it; `isolate` keeps those lifts
    // inside the row.
    <li
      className={cn(
        "relative isolate flex flex-col rounded-lg border hover:bg-muted transition-colors",
        // A fixed band of map above the trip's name, with the details over its
        // faded foot: however tall they grow, the map shows as much of itself.
        // The details' own top padding is part of the band, so what they
        // measure starts at the name.
        hasMap && "pt-27 sm:pt-33",
      )}
    >
      {hasMap && (
        // Out of flow, so the lazy map's placeholder takes no room of its own.
        // The radius is the row's less the border it sits inside, and the map
        // clips to it itself: in Firefox a rounded clip from further up does
        // not reach it.
        <div className="absolute inset-0 rounded-[calc(var(--radius)-1px)]">
          <LocationsMap
            locations={mappedLocations}
            subject={`the places of ${trip.name}`}
            className="h-full rounded-[inherit] border-0 sm:h-full"
            backdrop
            coveredBottom={detailsHeight}
          />
        </div>
      )}
      {/* Named per row, as the trips table's actions are. It sits as far in
          from the corner as the credit does, and over a map its hover takes the
          credit's chip rather than a colour the map would swallow. */}
      <div className="absolute right-1 top-1 z-10">
        <ItemActionsMenu
          label={`Actions for ${trip.name}`}
          variant="ghost"
          size="sm"
          className={hasMap ? "hover:bg-background/80" : undefined}
        >
          <DropdownMenuItem onSelect={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </DropdownMenuItem>
          <DeleteMenuItem onSelect={onDelete} disabled={isDeleting} />
        </ItemActionsMenu>
      </div>
      {/* Above the map by a flex item's z-index rather than by `relative`,
          which would make this the box the link's overlay stretches over and
          leave the map outside it. Under the menu and the credit, which are
          lifted higher. The glow in the card's own colour lifts every line off
          whatever the map still shows beneath it. */}
      <div
        ref={detailsRef}
        className={cn(
          "z-[1] px-3 pb-3 [text-shadow:0_0_3px_hsl(var(--card)),0_0_8px_hsl(var(--card))]",
          !hasMap && "pt-3",
        )}
      >
        {/* Without a map the menu shares this line, so it leaves the menu
            room. */}
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-4 gap-y-1",
            !hasMap && "pr-10",
          )}
        >
          <Link
            href={`/trips/${trip.uuid}`}
            className="min-w-0 font-medium text-foreground after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {trip.name}
          </Link>
        </div>
        {/* `w-fit`, so the place's hover hint is lifted over the link only
            where the text is. */}
        <TripLocationsLabel
          locations={locations}
          className="relative z-10 block w-fit max-w-full text-xs"
        />
        {dates && <div className="text-xs">{dates}</div>}
        <TripCounts trip={trip} />
      </div>
    </li>
  );
}
