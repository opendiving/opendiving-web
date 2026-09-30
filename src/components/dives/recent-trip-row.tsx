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
import { Calendar, Edit, Fish, MapPin } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { cn } from "@/lib/utils";

// What the trip's dives add up to, beside its name, with the dashboard's own
// icons for dives and species. Nothing for a trip with no dives yet - three
// zeros say less than no line at all - or from an API that sends no counts.
function TripCounts({ trip }: { trip: Trip }) {
  if (!trip.dive_count) return null;
  const sites = trip.dive_site_count ?? 0;
  const species = trip.species_count ?? 0;
  const counts = [
    {
      icon: DiveIcon,
      value: trip.dive_count,
      label: trip.dive_count === 1 ? "dive" : "dives",
    },
    {
      icon: MapPin,
      value: sites,
      label: sites === 1 ? "dive site" : "dive sites",
    },
    { icon: Fish, value: species, label: "species" },
  ];

  // One sentence for a screen reader, which would otherwise run the three
  // together as "12 dives1 dive site".
  return (
    <div className="ml-auto flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
      <span className="sr-only">
        {counts.map(({ value, label }) => `${value} ${label}`).join(", ")}
      </span>
      {counts.map(({ icon: Icon, value, label }) => (
        <span key={label} aria-hidden className="flex items-center gap-1">
          <Icon className="h-4 w-4" />
          {value}
        </span>
      ))}
    </div>
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

  // How much of the map the details cover, so its places are centred in what
  // is left above them. Read as the ref attaches and followed after that, as
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
        // The map's own height, with the trip's details at the foot of it,
        // where the map has faded out beneath them.
        hasMap && "min-h-40 justify-end sm:min-h-48",
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
      {/* Named per row, as the trips table's actions are. Over a map it wears
          the credit's chip and sits as far in from the corner, so the two read
          as a pair. */}
      <div className="absolute right-1 top-1 z-10">
        <ItemActionsMenu
          label={`Actions for ${trip.name}`}
          variant="ghost"
          size="sm"
          className={
            hasMap ? "bg-background/80 hover:bg-background" : undefined
          }
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
          lifted higher. */}
      <div ref={detailsRef} className="z-[1] p-3">
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
          <TripCounts trip={trip} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <TripLocationsLabel
            locations={locations}
            className="relative z-10 min-w-0"
          />
          {/* `ml-auto` keeps the dates on the right when there is no place to
              push them there, and when they wrap. */}
          {dates && (
            <div className="ml-auto flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {dates}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
