// Which of a chart's series the diver last chose to see, kept across visits.
//
// The counterpart to `gas-use-view.ts`, and deliberately a separate entry: that
// one remembers *where* on the timeline you were looking, this one remembers
// *what* you had plotted. Same storage for the same reasons - `localStorage`,
// because a remembered view has to survive the tab closing; not the URL, because
// it has to work from the bare `/dashboard` and `/dives/{uuid}` that the nav
// links point at and people bookmark.
//
// Generic over the series keys because two charts want it and their keys have
// nothing in common: the profile chart plots depth, the deco ceiling,
// temperature, tank pressure and the six channels a computer's own
// decompression arithmetic produces; the gas chart plots dives/trend/average.
// What is shared is the shape - a set of keys, re-validated on the way in
// against the ones the chart actually has.
//
// What's stored is a view preference: a handful of series names the chart itself
// defines. No dive data, nothing fetched.
//
// **A superseded key is left in storage rather than cleaned up**, which is the
// precedent for the next bump: see "Adding a channel needs a
// remembered-selection key bump; removing one does not" in DECISIONS.md. Forty
// inert bytes against a list of dead key names that would have to be carried,
// kept correct, and grown on every future bump - in code whose whole job is to
// be forgotten.

// Versioned, and now on its fourth: `-v2` when the deco ceiling became a fourth
// channel, `-v3` when the event markers gained a toggle of their own, `-v4` when
// the six deco readouts arrived.
// `parseSeriesVisibility` filters a stored selection down to the keys this build
// plots, which is exactly right for a key that has *gone* and exactly wrong for
// one that has arrived: every selection written before the deco readouts names
// only the four original channels and the markers, all of them still available,
// so it would restore cleanly and leave the new channels switched off - hiding a
// feature behind legend entries sitting right there claiming the diver had
// turned them off themselves.
//
// Bumping the key drops those selections and opens on everything plotted, which
// is what a first visit already does. The cost is one diver's hidden temperature
// line coming back once; the alternative is a feature that is invisible to
// precisely the people who have used the chart before.
//
// **The general rule, three times applied now: adding a key to a
// `parseSeriesVisibility` list needs a key bump; removing one does not.**
export const DIVE_PROFILE_SERIES_KEY = "opendiving:dive-profile-series-v4";
export const GAS_USE_SERIES_KEY = "opendiving:gas-use-series";

// The stored entry, raw and unparsed.
//
// Deliberately returns the string rather than a parsed array: this is the
// snapshot the charts hand to `useSyncExternalStore`, which compares snapshots
// with `Object.is` and loops forever if handed a freshly built array each call.
// A string compares by value, so parsing happens once, downstream.
export function readStoredSeries(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    // Storage can be unavailable (Safari private mode, storage disabled) - and
    // where it is missing entirely, reaching through it is a `TypeError` rather
    // than a storage error. Opening with everything plotted is a fine outcome,
    // not an error case.
    return null;
  }
}

// A stored entry as a selection, or null when there isn't one worth restoring -
// which the charts read as "plot everything".
//
// Filtered through `allowed` rather than validated against it: a key this build
// no longer plots is stale, not corrupt, and dropping it leaves the rest of a
// perfectly good selection intact.
export function parseSeriesVisibility<Key extends string>(
  raw: string | null,
  allowed: readonly Key[],
): Key[] | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const keys = allowed.filter((key) => parsed.includes(key));

    // An empty selection is a legitimate thing to store - every series can be
    // hidden - but an entry naming *only* things this chart has never heard of
    // is a stale build's, and restoring it as "hide everything" would open on a
    // blank plot for no reason the diver could account for.
    return keys.length > 0 || parsed.length === 0 ? keys : null;
  } catch {
    return null;
  }
}

export function writeSeriesVisibility(
  storageKey: string,
  visible: readonly string[],
): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(visible));
  } catch {
    // As above - and losing the remembered selection costs a click, not data.
  }
}

// A selection with `key` flipped, in the chart's own order rather than in the
// order the toggles were clicked. That keeps the stored entry stable across
// equivalent selections, and means nothing downstream has to sort it before
// deciding what to draw.
export function toggleSeries<Key extends string>(
  visible: readonly Key[],
  key: Key,
  order: readonly Key[],
): Key[] {
  const next = new Set<Key>(visible);
  if (!next.delete(key)) next.add(key);

  return order.filter((candidate) => next.has(candidate));
}

// The subscribe half of `useSyncExternalStore`, which deliberately never fires.
//
// A remembered selection is read once, when the chart mounts, and then left
// alone: a second tab hiding *its* temperature line should not yank the curve
// out from under whoever is reading this one. Module-level so the reference is
// stable - an inline arrow would make React tear down and re-subscribe on every
// render.
//
// Lives here rather than in `gas-use-view.ts`, where it started, because three
// remembered-view readers now want it and none of them is about gas.
export function subscribeToNothing(): () => void {
  return () => {};
}
