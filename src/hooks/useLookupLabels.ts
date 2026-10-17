"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The records a picker or a page has seen, by uuid - its own search results,
 * whatever it created, through `remember` - and a read for each of `wanted` it holds
 * none for.
 *
 * Each uuid is read once, failed or not, so a record deleted since is not asked for
 * on every render. No cancellation: under StrictMode the only read in flight is the
 * discarded mount's, and dropping its result would drop the label for good. Merging
 * into a uuid-keyed map is idempotent, so a late arrival is always safe to apply.
 *
 * `lookupByUuid` must keep its identity across renders: a module-level function,
 * not an inline one.
 */
export function useLookupLabels<T extends { uuid: string }>(
  lookupByUuid: (uuids: string[]) => Promise<T[]>,
  wanted: readonly (string | null | undefined)[],
): { records: Record<string, T>; remember: (...rows: T[]) => void } {
  const [records, setRecords] = useState<Record<string, T>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  const remember = useCallback((...rows: T[]) => {
    if (rows.length === 0) return;
    setRecords((previous) => {
      const next = { ...previous };
      for (const row of rows) next[row.uuid] = row;
      return next;
    });
  }, []);

  // A string rather than the array, so a caller building its list inline does not
  // re-run the effect on every render.
  const wantedKey = [
    ...new Set(wanted.filter((uuid): uuid is string => !!uuid)),
  ].join(",");

  useEffect(() => {
    if (!wantedKey) return;
    const missing = wantedKey
      .split(",")
      .filter((uuid) => !records[uuid] && !requestedRef.current.has(uuid));
    if (missing.length === 0) return;
    for (const uuid of missing) requestedRef.current.add(uuid);

    lookupByUuid(missing)
      .then((rows) => remember(...rows))
      .catch((error) => console.error("Failed to look up records:", error));
  }, [wantedKey, records, lookupByUuid, remember]);

  return { records, remember };
}

/**
 * A `lookupByUuid` made of one read per record, for a kind whose lookup cannot be
 * narrowed to uuids. A read that fails leaves its record out, alone.
 */
export function readEach<T extends { uuid: string }>(
  read: (uuid: string) => Promise<T>,
): (uuids: string[]) => Promise<T[]> {
  return async (uuids) => {
    const settled = await Promise.allSettled(uuids.map((uuid) => read(uuid)));
    return settled.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];
      console.error("Failed to read a record:", result.reason);
      return [];
    });
  };
}
