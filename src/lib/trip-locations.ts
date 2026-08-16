// Where a trip went, as one line of text. Every compact surface - the trips
// table, the dashboard's recent-trips card, a detail page subtitle - shows the
// same thing, so it is composed once here rather than joined slightly
// differently in each of them.

interface NamedLocation {
  name: string;
}

export interface FormatTripLocationNamesOptions {
  // Show at most this many names, and count the rest as "+N". Omit to show all.
  max?: number;
}

/**
 * The trip's locations as "Moalboal, Bohol +2", or `undefined` when there are
 * none.
 *
 * `undefined` rather than "" so callers can pick their own placeholder - the
 * table wants "-", a subtitle wants to disappear - with `??`/`||` instead of a
 * length check.
 */
export function formatTripLocationNames(
  locations?: NamedLocation[] | null,
  { max }: FormatTripLocationNamesOptions = {},
): string | undefined {
  const names = usableNames(locations);
  if (names.length === 0) return undefined;

  const limit = resolveLimit(names.length, max);
  const shown = names.slice(0, limit).join(", ");
  const hidden = names.length - Math.min(limit, names.length);
  return hidden > 0 ? `${shown} +${hidden}` : shown;
}

/**
 * Every name in full, for the `title` beside a compacted label - or `undefined`
 * when that label already shows them all.
 *
 * `undefined` rather than the label itself, so the same `max` that produced the
 * "+N" decides whether there is anything left to reveal: a tooltip repeating
 * the text under the cursor is worse than no tooltip at all.
 */
export function formatTripLocationNamesHint(
  locations?: NamedLocation[] | null,
  { max }: FormatTripLocationNamesOptions = {},
): string | undefined {
  const names = usableNames(locations);
  const limit = resolveLimit(names.length, max);
  if (names.length <= limit) return undefined;
  return names.join(", ");
}

// How many names are on screen. Shared rather than repeated in both functions:
// the label and the hint disagreeing about it is the whole failure the hint's
// `undefined` exists to avoid, and it would look right at either call site.
function resolveLimit(count: number, max?: number): number {
  return max !== undefined && max > 0 ? max : count;
}

// A name is all a location is guaranteed to have, so a blank one is unusable
// rather than merely unhelpful - dropping it beats rendering ", , Bohol".
function usableNames(locations?: NamedLocation[] | null): string[] {
  return (locations ?? [])
    .map((location) => location.name?.trim())
    .filter((name): name is string => !!name);
}
