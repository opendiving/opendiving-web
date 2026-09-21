import { ReactNode } from "react";
import { Location } from "@/lib/api/location";
import {
  formatTripLocationNames,
  formatTripLocationNamesHint,
} from "@/lib/trip-locations";

// How many names a compact surface shows before the rest become "+N". One,
// because a place's own name carries its country now - two of "Dahab, Egypt"
// do not fit a table cell, and the hover hint is what keeps the count honest.
//
// Exported because the trip page's subtitle joins the same names without
// rendering this component, and the two agreeing is the invariant: every
// surface that joins a trip's places for a reader shows the same number of
// them.
export const SHOWN_LOCATIONS = 1;

export interface TripLocationsLabelProps {
  locations?: Location[] | null;
  className?: string;
  // What to render for a trip with no usable locations. A table wants "-"; a
  // dashboard subtitle wants to disappear, which is the default.
  fallback?: ReactNode;
}

// Renders a trip's locations as "Dahab, Egypt +2", with every name in full as a
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
