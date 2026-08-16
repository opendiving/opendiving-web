import { ReactNode } from "react";
import { TripLocation } from "@/lib/api/trips";
import {
  formatTripLocationNames,
  formatTripLocationNamesHint,
} from "@/lib/trip-locations";

// How many names a compact surface shows before the rest become "+N". Two fits a
// table cell and still names more than one place, which is the whole reason a trip
// carries a list.
const SHOWN_LOCATIONS = 2;

export interface TripLocationsLabelProps {
  locations?: TripLocation[] | null;
  className?: string;
  // What to render for a trip with no usable locations. A table wants "-"; a
  // dashboard subtitle wants to disappear, which is the default.
  fallback?: ReactNode;
}

// Renders a trip's locations as "Moalboal, Bohol +2", with every name in full as a
// hover hint whenever the "+N" is holding some of them back.
//
// One component rather than the same three lines at each call site, because the label
// and its hint have to be computed against the same limit: a hint built with a
// different `max` would either repeat the cell under the cursor or withhold a name the
// "+N" says is there, and nothing about either call site would look wrong.
export function TripLocationsLabel({
  locations,
  className,
  fallback = null,
}: TripLocationsLabelProps) {
  const names = formatTripLocationNames(locations, { max: SHOWN_LOCATIONS });
  if (!names) return <>{fallback}</>;

  return (
    <span
      className={className}
      title={formatTripLocationNamesHint(locations, { max: SHOWN_LOCATIONS })}
    >
      {names}
    </span>
  );
}
