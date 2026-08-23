// Which units the diver *types* each measurement in, remembered per device.
//
// A separate question from the account's `units` preference, which stays the
// display authority for every saved dive, chart and stat. This one only governs
// the boxes in the dive form and the gear-set dialog: a diver who thinks in
// metres and rents an SPG reading psi flips pressure to psi and leaves the rest
// alone. Form state is metric either way - `UnitNumberInput` converts at the
// edge and nothing downstream of it learns which system was on.
//
// `localStorage`, like the remembered chart views next to it: a rented psi SPG
// lasts a whole trip, so the choice has to survive the tab closing. Not the user
// row, because that would be 5-6 new NOT NULL columns on the hottest record, an
// API change and export coverage, all for an entry convenience.
//
// **Two things here depart from `chart-series-view.ts`, which this otherwise
// copies.**
//
// It is genuinely subscribed rather than reading `subscribeToNothing`. Those
// keys are each read by one component, so nothing can disagree with anything;
// this one has concurrent readers that share a dimension - the gear-set dialog
// opens from *inside* the dive form and both render a weight box - and two
// unsubscribed readers would show different units for the same dimension and
// last-writer-wins each other's flips.
//
// And the raw snapshot is cached in module state rather than read from storage
// per call, because `getSnapshot` runs on every render of every consumer and two
// of those sit on the form's hottest path (`MixtureSetWarning` re-renders per
// keystroke). The cache is keyed on the identity of the `Storage` it was primed
// from: in production that object never changes, and under Vitest swapping it is
// exactly what `useStorage(memoryStorage())` does per test - so a fresh store
// re-primes and one test's write cannot serve as the next one's stale read.
//
// The key carries no version suffix, and for a different reason than the chart
// keys' `-vN`. There, a filtered key set makes a newly-added channel read as
// deliberately switched off. Here absence already means the right thing - no
// override, follow the account - so a dimension added later starts correct under
// the old key.

import {
  ENTRY_DIMENSIONS,
  UNIT_SYSTEMS,
  type EntryDimension,
  type UnitSystem,
} from "@/lib/units";

export const ENTRY_UNITS_KEY = "opendiving:entry-units";

/** The dimensions the diver has moved off their account preference, and where to. */
export type EntryUnitOverrides = Partial<Record<EntryDimension, UnitSystem>>;

// The raw entry, and the `Storage` it was read out of. `primed` is separate from
// `primedFrom` because `undefined` is a real answer - a browser that hands out no
// storage at all - and must not read as "never looked".
let snapshot: string | null = null;
let primed = false;
let primedFrom: Storage | undefined;

const listeners = new Set<() => void>();

// Storage can be unavailable (Safari private mode, storage disabled) - and where
// it is missing entirely, reaching through it is a `TypeError` rather than a
// storage error. Entering in account units is a fine outcome, not an error case.
function currentStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function cache(raw: string | null): void {
  snapshot = raw;
  primedFrom = currentStorage();
  primed = true;
}

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * The stored entry, raw and unparsed.
 *
 * Deliberately returns the string rather than a parsed record: this is the
 * snapshot handed to `useSyncExternalStore`, which compares with `Object.is` and
 * would loop forever on a freshly built object each call. A string compares by
 * value, so parsing happens once, downstream.
 */
export function readStoredEntryUnits(): string | null {
  const storage = currentStorage();
  if (primed && storage === primedFrom) return snapshot;

  primedFrom = storage;
  primed = true;
  try {
    snapshot = storage?.getItem(ENTRY_UNITS_KEY) ?? null;
  } catch {
    snapshot = null;
  }
  return snapshot;
}

/**
 * A stored entry as a set of overrides, filtered rather than rejected.
 *
 * Anything unrecognized is dropped and the rest kept: an unknown dimension is a
 * stale build's, not corruption, and a dimension with no usable value simply has
 * no override - which is the same state a diver who never touched a toggle is in.
 * A non-object entry yields no overrides at all.
 */
export function parseEntryUnits(raw: string | null): EntryUnitOverrides {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const record = parsed as Record<string, unknown>;
    const overrides: EntryUnitOverrides = {};
    for (const dimension of ENTRY_DIMENSIONS) {
      const value = record[dimension];
      if (UNIT_SYSTEMS.includes(value as UnitSystem)) {
        overrides[dimension] = value as UnitSystem;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

/**
 * Stores the overrides, refreshes the cache and tells every consumer.
 *
 * An empty record removes the key rather than writing `{}`: no overrides is the
 * natural state, and leaving an entry behind for it would be a stored value that
 * means the same as no stored value.
 *
 * The cache takes what was *asked for* rather than re-reading, so a browser that
 * refused the write still flips the boxes for this session - the choice is not
 * remembered, which is the honest outcome, but the toggle is not dead either.
 */
export function writeEntryUnits(overrides: EntryUnitOverrides): void {
  const raw =
    Object.keys(overrides).length === 0 ? null : JSON.stringify(overrides);

  try {
    if (raw === null) {
      window.localStorage.removeItem(ENTRY_UNITS_KEY);
    } else {
      window.localStorage.setItem(ENTRY_UNITS_KEY, raw);
    }
  } catch {
    // As above - losing the remembered choice costs a click, not data.
  }

  cache(raw);
  notify();
}

/**
 * Forgets every override. Called from `signOut`.
 *
 * The entry override is view state like the remembered chart selections, and
 * unlike them it is cleared on the way out, because what it changes is what a box
 * *parses* rather than what it shows. A second diver at a shared browser who
 * never touched a toggle would meet a psi-labelled pressure field, type 200
 * meaning bar, and commit 13.79 bar - inside the API's range CHECK and
 * indistinguishable from real data afterwards.
 */
export function clearEntryUnits(): void {
  try {
    window.localStorage.removeItem(ENTRY_UNITS_KEY);
  } catch {
    // As above.
  }

  cache(null);
  notify();
}

/**
 * The subscribe half of `useSyncExternalStore`, and a real one.
 *
 * Cross-tab `storage` events stay unhandled, like every sibling key here: what
 * this exists for is the readers in *this* document that share a dimension.
 */
export function subscribeToEntryUnits(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The overrides with `dimension` flipped to the other system.
 *
 * Flipping *to* the account's own system removes the key rather than storing a
 * value equal to it: no-override is the natural state, so an account-level change
 * in settings then carries every unoverridden dimension with it. What an override
 * records is the absolute system ("my SPG reads psi"), not "flipped" - that fact
 * does not change when the diver re-themes their account.
 */
export function toggleDimension(
  overrides: EntryUnitOverrides,
  dimension: EntryDimension,
  accountUnits: UnitSystem,
): EntryUnitOverrides {
  const current = overrides[dimension] ?? accountUnits;
  const next: UnitSystem = current === "metric" ? "imperial" : "metric";

  const result = { ...overrides };
  if (next === accountUnits) {
    delete result[dimension];
  } else {
    result[dimension] = next;
  }
  return result;
}
