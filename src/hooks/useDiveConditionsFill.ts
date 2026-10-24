"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useWatch,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import {
  divesAPI,
  type ConditionsLookup,
  type ConditionsLookupQuery,
} from "@/lib/api/dives";
import { getApiErrorStatus } from "@/lib/api/error";
import { isDateOnlyStartTime } from "@/lib/date-time";
import {
  FETCHED_FIELDS,
  type FetchedField,
  type FetchedMarks,
} from "@/lib/dive-conditions";
import {
  EMPTY_DIVE_FORM_VALUES,
  isNonEmptyFieldValue,
} from "@/lib/dive-form-fields";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";

// How long the inputs have to stop changing before the API is asked. The date
// field emits on every keystroke, and each lookup spends the instance's budget
// with the weather service.
const LOOKUP_DEBOUNCE_MS = 400;

type Owned = Partial<Record<FetchedField, number | string>>;

const NOTHING_FILLED = {
  air_temperature: null,
  weather: null,
  waves: null,
} as const;

/** What `useDiveConditionsFill` takes. */
export interface UseDiveConditionsFillOptions<
  TFieldValues extends FieldValues,
> {
  form: UseFormReturn<TFieldValues>;
  visibility: Pick<DiveFormVisibility, "isVisible" | "overwrite">;
  /** False until the form holds what it opened with - a load, or the last dive. */
  enabled: boolean;
  /** The edit form's stored fill, which describes the inputs the dive opened with. */
  stored?: FetchedMarks;
  /**
   * Whether the edited dive has a fetch of its own. The worker never asks again for
   * the inputs it answered, so at those inputs the fetch is the whole answer: a field
   * it left empty stays empty after a save, and is not previewed.
   */
  fetchedOnOpen?: boolean;
  /** The dive's own entry fix, which a fetch places the dive at over its site's pin. */
  position?: { latitude: number; longitude: number } | null;
}

/** What `useDiveConditionsFill` returns. */
export interface DiveConditionsFill {
  /** The fields a weather service filled, for `DiveForm`'s `fetched`. */
  marks: FetchedMarks | undefined;
  /**
   * The submitted values with every field still holding a fetched value emptied,
   * so the API's own fetch writes it and marks it as fetched. Sent as typed, a
   * previewed value would be stored as the diver's.
   */
  withhold: <T>(data: T) => T;
}

/**
 * Fills a dive form's air temperature, weather and waves with what the API's
 * conditions fetch would write for the form's start time, primary site and water
 * type, and keeps them in step with those inputs.
 *
 * A field is filled while it is empty, and refilled - or emptied, where the new
 * inputs answer nothing - while it still holds the value a fetch put there and the
 * inputs have moved since. A value the diver typed or picked is never replaced, and
 * a hidden field is left alone. On the edit form a stored fetch is the answer for
 * as long as the worker's own inputs (`workerInputs`) stay as the dive opened
 * with, and nothing is asked about them.
 *
 * A preview only: what it writes is withheld on submit (`withhold`), and the
 * API's worker writes the same values after the save. Two moves the form cannot
 * tell from the worker's are read as moved and previewed though the worker
 * answers nothing new: another site whose pin rounds to the same place, and a
 * water type set to the one the site already gives.
 */
export function useDiveConditionsFill<TFieldValues extends FieldValues>({
  form,
  visibility,
  enabled,
  stored,
  fetchedOnOpen = false,
  position,
}: UseDiveConditionsFillOptions<TFieldValues>): DiveConditionsFill {
  const { control, getValues } = form;
  const startTime = useWatch({
    control,
    name: "start_time" as Path<TFieldValues>,
  }) as string | undefined;
  const siteUuids = useWatch({
    control,
    name: "dive_site_uuids" as Path<TFieldValues>,
  }) as string[] | undefined;
  const water = useWatch({
    control,
    name: "water_type" as Path<TFieldValues>,
  }) as string | null | undefined;

  const query: ConditionsLookupQuery | null =
    startTime && !Number.isNaN(new Date(startTime).getTime())
      ? {
          start_time: startTime,
          ...(siteUuids?.[0] ? { dive_site_uuid: siteUuids[0] } : {}),
          ...(position
            ? { latitude: position.latitude, longitude: position.longitude }
            : {}),
          ...(water ? { water_type: water } : {}),
        }
      : null;
  const inputs = query ? JSON.stringify(query) : null;
  // What the worker answers a stored dive again on a change of: the place is the
  // entry fix where there is one, and the site only where there is not.
  const workerInputs = query
    ? JSON.stringify([
        query.start_time,
        position ? null : (query.dive_site_uuid ?? null),
        query.water_type ?? null,
      ])
    : null;
  // What the API would answer with nothing for, so it is not asked: no place to
  // ask about, or no hour of the day.
  const answerable =
    !!query &&
    (query.dive_site_uuid !== undefined || query.latitude !== undefined) &&
    !isDateOnlyStartTime(query.start_time);

  // Null until a lookup lands, and the stored fill is what the form marks until then.
  const [answered, setAnswered] = useState<{
    marks: FetchedMarks | undefined;
  } | null>(null);
  // The value a fetch put in each field, and the inputs those values describe.
  const ownedRef = useRef<Owned>({});
  const attributionRef = useRef("");
  const describedRef = useRef<string | null | undefined>(undefined);
  const openedRef = useRef<{ workerInputs: string; fill: Owned } | null>(null);
  // Bumped per request, so a reply for earlier inputs never lands.
  const requestRef = useRef(0);
  const visibilityRef = useRef(visibility);
  useEffect(() => {
    visibilityRef.current = visibility;
  });

  const holds = useCallback(
    (field: FetchedField) => getValues(field as Path<TFieldValues>) as unknown,
    [getValues],
  );

  useEffect(() => {
    if (!enabled) return;
    const request = ++requestRef.current;
    if (!query || !inputs || !workerInputs) return;

    // The first inputs the form holds a start time for are the ones it opened with.
    if (describedRef.current === undefined) {
      describedRef.current = inputs;
      const seeded: Owned = {};
      for (const field of FETCHED_FIELDS) {
        const value = stored?.values[field];
        if (typeof value === "number" || typeof value === "string") {
          seeded[field] = value;
        }
      }
      ownedRef.current = seeded;
      attributionRef.current = stored?.attribution ?? "";
      openedRef.current = { workerInputs, fill: seeded };
    }

    // What these inputs answer without asking: nothing where the API would have
    // nothing to say, and the dive's own fetch at the inputs it describes.
    const opened = openedRef.current;
    const known: ConditionsLookup["filled"] | null = !answerable
      ? NOTHING_FILLED
      : fetchedOnOpen && opened?.workerInputs === workerInputs
        ? ({ ...NOTHING_FILLED, ...opened.fill } as ConditionsLookup["filled"])
        : null;

    const fillable = (field: FetchedField) => {
      if (!visibilityRef.current.isVisible(field)) return false;
      const value = holds(field);
      if (!isNonEmptyFieldValue(value)) return true;
      return (
        inputs !== describedRef.current && value === ownedRef.current[field]
      );
    };
    const due = (field: FetchedField) => {
      if (!fillable(field)) return false;
      if (known === null) return true;
      const value = holds(field);
      return isNonEmptyFieldValue(value)
        ? value !== known[field]
        : known[field] != null;
    };
    if (!FETCHED_FIELDS.some(due)) return;

    const timer = setTimeout(async () => {
      let filled = known ?? NOTHING_FILLED;
      try {
        if (known === null) {
          const answer = await divesAPI.lookupConditions(query);
          filled = answer.filled;
          attributionRef.current = answer.attribution;
        }
      } catch (error) {
        // Non-fatal, and the fields keep what they hold. A 404 is an instance that
        // does not fetch conditions, which is not worth a line in the console.
        if (getApiErrorStatus(error) !== 404) {
          console.error("Failed to look up the dive's conditions:", error);
        }
        return;
      }
      if (request !== requestRef.current) return;

      // Re-checked after the await: the diver may have typed in the meantime.
      const owned: Owned = { ...ownedRef.current };
      for (const field of FETCHED_FIELDS) {
        if (!fillable(field)) continue;
        const value = filled[field];
        visibilityRef.current.overwrite(
          field,
          value ?? EMPTY_DIVE_FORM_VALUES[field],
        );
        if (value == null) delete owned[field];
        else owned[field] = value;
      }
      ownedRef.current = owned;
      describedRef.current = inputs;
      setAnswered({
        marks:
          Object.keys(owned).length > 0
            ? { values: owned, attribution: attributionRef.current }
            : undefined,
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `query`, `answerable` and `workerInputs` are `inputs` parsed, and `stored` and `fetchedOnOpen`
    // are read once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, inputs, holds]);

  const withhold = useCallback(<T>(data: T): T => {
    const held = { ...data } as Record<string, unknown>;
    for (const [field, value] of Object.entries(ownedRef.current)) {
      if (held[field] === value) {
        held[field] = EMPTY_DIVE_FORM_VALUES[field as FetchedField];
      }
    }
    return held as T;
  }, []);

  return { marks: answered ? answered.marks : stored, withhold };
}
