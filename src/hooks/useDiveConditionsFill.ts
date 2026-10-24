"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useWatch,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import { divesAPI, type ConditionsLookupQuery } from "@/lib/api/dives";
import { getApiErrorStatus } from "@/lib/api/error";
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
 * a hidden field is left alone. On the edit form the stored fill describes the
 * inputs the dive opened with, so until they change only empty fields are asked
 * about.
 *
 * A preview only: what it writes is withheld on submit (`withhold`), and the
 * API's worker writes the same values after the save.
 */
export function useDiveConditionsFill<TFieldValues extends FieldValues>({
  form,
  visibility,
  enabled,
  stored,
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

  // Null until a lookup lands, and the stored fill is what the form marks until then.
  const [answered, setAnswered] = useState<{
    marks: FetchedMarks | undefined;
  } | null>(null);
  // The value a fetch put in each field, and the inputs those values describe.
  const ownedRef = useRef<Owned>({});
  const describedRef = useRef<string | null | undefined>(undefined);
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
    if (!query || !inputs) return;

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
    }

    const fillable = (field: FetchedField) => {
      if (!visibilityRef.current.isVisible(field)) return false;
      const value = holds(field);
      if (!isNonEmptyFieldValue(value)) return true;
      return (
        inputs !== describedRef.current && value === ownedRef.current[field]
      );
    };
    if (!FETCHED_FIELDS.some(fillable)) return;

    const timer = setTimeout(async () => {
      let answer;
      try {
        answer = await divesAPI.lookupConditions(query);
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
        const value = answer.filled[field];
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
            ? { values: owned, attribution: answer.attribution }
            : undefined,
      });
    }, LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `query` is `inputs` parsed, and `stored` is read once, when the form opens.
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
