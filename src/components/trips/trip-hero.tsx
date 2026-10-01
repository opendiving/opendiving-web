"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Trip } from "@/lib/api/trips";
import { LocationsMap } from "@/components/map/locations-map-lazy";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTripSpan, tripPartLocations } from "@/lib/trip-parts";
import { TripLocationsLabel } from "@/components/trips/trip-locations-label";
import { formatTripLocationNames } from "@/lib/trip-locations";
import { tripFigures } from "@/lib/trip-figures";
import { useUnits } from "@/hooks/useUnits";
import { cn } from "@/lib/utils";

// The band's frame, shared with its skeleton so the page lands without moving:
// a constant height per breakpoint - about a third of a laptop's viewport, less
// on a phone - that details taller than it, a name wrapping onto three lines,
// grow from the top, where `pt-24` keeps a band of map above them.
const FRAME =
  "relative isolate flex min-h-72 flex-col justify-end pt-24 sm:min-h-80 lg:min-h-88";

// The page's column, so the details line up with the body under them.
const COLUMN = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

// This page has room for the month spelled out, unlike a trip card.
const LONG_DATE: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

interface TripHeroProps {
  trip: Trip;
  // Edit and the menu, in the band's top-right corner as a card's menu is.
  actions?: ReactNode;
}

// The trip page's heading: the trip card drawn the width of the window, its
// map across the whole band and the name, dates, places and figures over the
// map's faded foot. Not a `BackdropCard`, which is a list item under a
// stretched link with a hover colour of its own; this is a page surface, and it
// fades into the page.
export function TripHero({ trip, actions }: TripHeroProps) {
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
  const figures = tripFigures(trip, units);

  // How much of the map lies under the details, so its places centre between
  // the credit and the name - read as the ref attaches and followed after
  // that, as a card does it.
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
    <div
      className={cn(
        FRAME,
        // The map fades into the page's own colour, and the text's and the
        // actions' glows are drawn in it.
        "bg-background [--backdrop-fade:hsl(var(--background))]",
      )}
    >
      {/* Out of flow, so the lazy map's placeholder takes no room of its own.
          The whole world for a trip with no place on the map yet, as its card
          shows. */}
      <div className="absolute inset-0">
        <LocationsMap
          locations={mappedLocations}
          showWhenEmpty
          subject={`the places of ${trip.name}`}
          className="h-full rounded-none border-0 sm:h-full"
          backdrop
          coveredBottom={detailsHeight}
          snapshot
          sideFade
        />
      </div>
      {/* At the column's right edge rather than the window's, where a wide
          screen would put them far from everything else. Above the details
          and the map, with the credit. */}
      {actions && (
        <div className="absolute inset-x-0 top-2 z-10">
          <div className={cn(COLUMN, "flex justify-end gap-1")}>{actions}</div>
        </div>
      )}
      {/* Above the map by a flex item's z-index, as a card's details are.
          Every line is lifted off what the map still shows beneath it by a glow
          in the page's colour: two soft layers close together, since more of
          them - or wider ones - draw each layer's edge as a visible ring. */}
      <div
        ref={detailsRef}
        className="z-[1] [text-shadow:0_0_2px_var(--backdrop-fade),0_0_5px_var(--backdrop-fade)]"
      >
        <div className={cn(COLUMN, "pb-5")}>
          <h1 className="text-3xl font-bold">{trip.name}</h1>
          {/* One line, as the trip card's. */}
          {(dates || placeNames) && (
            <p className="mt-1 text-muted-foreground">
              {dates}
              {dates && placeNames ? " · " : null}
              <TripLocationsLabel locations={locations} />
            </p>
          )}
          {/* Every figure the trip has, at the dive page's size. A value never
              breaks, so "30 m" is one figure. */}
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {figures.map(({ label, value }) => (
              <div key={label}>
                <dt className="mb-1 text-sm font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="whitespace-nowrap text-2xl font-bold">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

// The band's place while the trip loads, at the band's own height: one box
// where the map will be, and the heading's bar inside the `h1` so the header
// is the same height before and after the trip lands. The bars are a step
// lighter than the box they lie on, which is the one place a bar is drawn on
// a bar.
export function TripHeroSkeleton() {
  const bar = "bg-background/60";
  return (
    <div className={FRAME}>
      <Skeleton className="absolute inset-0 rounded-none" />
      <div className={cn(COLUMN, "relative z-[1] pb-5")}>
        <h1 className="text-3xl font-bold">
          <Skeleton className={cn("h-9 w-64", bar)} />
        </h1>
        <p className="mt-1">
          <Skeleton className={cn("h-6 w-44", bar)} />
        </p>
        <div className="mt-4 flex gap-x-8">
          {[0, 1, 2].map((figure) => (
            <div key={figure}>
              <Skeleton className={cn("mb-1 h-5 w-16", bar)} />
              <Skeleton className={cn("h-8 w-12", bar)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
