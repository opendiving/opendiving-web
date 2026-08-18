/**
 * Reading react-hook-form's `formState.dirtyFields`.
 *
 * A form seeded from an API response submits two kinds of value: edits, and
 * echoes of what it was handed. On a PATCH those are indistinguishable on the
 * wire, and an echo of something the API chose not to render - a soft-deleted
 * trip arriving as `trip_uuid: null`, a gear set's item list arriving without
 * its deleted members - reads on the way back as a deliberate removal. Only the
 * form knows which is which, and `dirtyFields` is where it says so.
 *
 * Extracted from `buildDiveUpdate` when the gear set dialog needed the same
 * answer for `gear_item_uuids`; see "The edit form submits what the diver
 * changed" in DECISIONS.md for the failure it exists to prevent.
 */

/**
 * What react-hook-form hands over as `formState.dirtyFields` for a form of
 * `T`: a field that differs from what the form was seeded with is marked, an
 * untouched one is absent, and only the top-level keys matter to callers.
 *
 * Deliberately not `FieldNamesMarkedBoolean<T>`, which is the library's own
 * type for it. That type says an array field is marked per index
 * (`(boolean | undefined)[]`), and the library does not do that for a
 * *registered* array leaf like `dive_site_uuids` or `gear_item_uuids` - it
 * marks the whole field `true`, so the accurate value doesn't type-check
 * against the declared one. The `.render.test.tsx` files pin the real shapes
 * against a real `useForm`, since a type that disagrees with the library can't
 * be the thing this leans on.
 */
export type DirtyFields<T> = Partial<Readonly<Record<keyof T, unknown>>>;

/**
 * Whether react-hook-form marked anything at or below this node dirty.
 *
 * Recursive because a field array's entry is a map of its own fields: editing
 * one cylinder's end pressure marks `mixtures[1].end_pressure`, and the answer
 * for `mixtures` has to be "yes" - the API replaces the list wholesale, so one
 * changed cylinder means sending all of them.
 */
export function isDirty(marker: unknown): boolean {
  if (marker === true) return true;
  if (Array.isArray(marker)) return marker.some(isDirty);
  if (marker && typeof marker === "object") {
    return Object.values(marker).some(isDirty);
  }
  return false;
}
