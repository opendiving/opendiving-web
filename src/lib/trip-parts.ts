// A trip is a sequence of parts, and the two things every surface wants from
// that sequence are the span it covers and the places it went. Both are derived
// here rather than at each call site, because a list cell, a page subtitle and a
// dashboard card disagreeing about where a trip was is invisible until someone
// holds two of them side by side.

import type { Location } from "@/lib/api/location";
import type { TripPart } from "@/lib/api/trips";
import { formatTripDateRange } from "@/lib/date-time";

export interface TripSpan {
  start?: string;
  end?: string;
}

/**
 * A trip's span: the earliest `start_date` and the latest `end_date` across its
 * parts.
 *
 * Each end is taken independently, matching the API's own derivation. A trip
 * whose only dated part carries an end and no start has an end and no start -
 * what the data says, rather than an invented range. A trip with no parts, or
 * none carrying dates, has neither, which is a state the app has never had
 * before: every caller has to answer for it rather than format an absence.
 *
 * Dates are bare `YYYY-MM-DD`, so they compare as strings - no `Date` is
 * constructed here, which is the same reason `formatDateOnly` splits them
 * (DECISIONS.md, "Bare `YYYY-MM-DD` dates must not go through
 * `new Date(dateString)`").
 */
export function tripSpan(parts?: TripPart[] | null): TripSpan {
  let start: string | undefined;
  let end: string | undefined;
  for (const part of parts ?? []) {
    if (part.start_date && (start === undefined || part.start_date < start)) {
      start = part.start_date;
    }
    if (part.end_date && (end === undefined || part.end_date > end)) {
      end = part.end_date;
    }
  }
  return { start, end };
}

/**
 * A trip's span, formatted the way every surface shows it, or `undefined` when
 * its parts carry no dates at all.
 *
 * `formatTripDateRange` takes two dates and is shared with the courses pages,
 * so the reduction happens here and its signature is left alone. `undefined`
 * rather than "" for the same reason it gives: a table wants "-" where a
 * subtitle wants to disappear.
 */
export function formatTripSpan(
  parts?: TripPart[] | null,
  options?: Intl.DateTimeFormatOptions,
): string | undefined {
  const { start, end } = tripSpan(parts);
  return formatTripDateRange(start, end, options);
}

/**
 * The places a trip went, in the diver's order, skipping the parts that have
 * none.
 *
 * What the label helpers and the maps take: both were written against a flat
 * list of locations and still are, because a dive site's page and a dive's
 * sidebar hand them theirs (`formatTripLocationNames`,
 * `components/map/locations-map.tsx`). A placeless part contributes nothing
 * here rather than an unnamed gap.
 */
export function tripPartLocations(parts?: TripPart[] | null): Location[] {
  return (parts ?? [])
    .map((part) => part.location)
    .filter((location): location is Location => !!location);
}
