"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useUnits } from "@/hooks/useUnits";
import {
  parseEntryUnits,
  readStoredEntryUnits,
  subscribeToEntryUnits,
  toggleDimension,
  writeEntryUnits,
} from "@/lib/entry-units";
import type { EntryDimension, UnitSystem } from "@/lib/units";

export interface EntryUnits {
  /** The system this dimension's boxes display and parse in, right now. */
  entryUnits: (dimension: EntryDimension) => UnitSystem;
  /** Flips one dimension to the other system, remembered on this device. */
  toggleEntryUnits: (dimension: EntryDimension) => void;
}

/**
 * Which system each measurement is *entered* in - the override, or the account.
 *
 * The entry counterpart to `useUnits`, which stays the answer for everything a
 * saved dive renders as. Components call this once and hand the result down to
 * their labels and their `UnitNumberInput`s, exactly as they did with `useUnits`.
 *
 * Every consumer is subscribed to the same store, so the gear-set dialog that
 * opens from inside the dive form and the form behind it never disagree about
 * weight. There is no local copy of the record and no write-through effect:
 * writes happen only when a toggle is pressed, which is what keeps a mount from
 * erasing what a previous visit stored.
 */
export function useEntryUnits(): EntryUnits {
  const accountUnits = useUnits();
  const raw = useSyncExternalStore(
    subscribeToEntryUnits,
    readStoredEntryUnits,
    // Never reached: every page that can mount a toggle returns a spinner while
    // auth is loading, so no consumer renders during prerender or hydration.
    // Kept as the defensive answer to `localStorage` not existing on the server.
    () => null,
  );
  const overrides = useMemo(() => parseEntryUnits(raw), [raw]);

  const entryUnits = useCallback(
    (dimension: EntryDimension) => overrides[dimension] ?? accountUnits,
    [overrides, accountUnits],
  );

  const toggleEntryUnits = useCallback(
    (dimension: EntryDimension) => {
      // Derived from a fresh read rather than from `overrides` above, which is
      // this render's parse: two toggles pressed inside one React batch would
      // both compute from the same pre-click record and the second would silently
      // undo the first. Safe to read-then-write because the write refreshes the
      // cache synchronously. (`chart-series-view`'s legend hit this for real -
      // see DECISIONS.md - and solved it with an updater, which needs state this
      // deliberately doesn't keep.)
      const stored = parseEntryUnits(readStoredEntryUnits());
      writeEntryUnits(toggleDimension(stored, dimension, accountUnits));
    },
    [accountUnits],
  );

  return { entryUnits, toggleEntryUnits };
}
