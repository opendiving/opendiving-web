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
  // A name is all a location is guaranteed to have, so a blank one is unusable
  // rather than merely unhelpful - dropping it beats rendering ", , Bohol".
  const names = (locations ?? [])
    .map((location) => location.name?.trim())
    .filter((name): name is string => !!name);
  if (names.length === 0) return undefined;

  const limit = max !== undefined && max > 0 ? max : names.length;
  const shown = names.slice(0, limit).join(", ");
  const hidden = names.length - Math.min(limit, names.length);
  return hidden > 0 ? `${shown} +${hidden}` : shown;
}
