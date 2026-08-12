"use client";

import { useEffect, useRef, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { divesAPI, DiveNumberSuggestion } from "@/lib/api/dives";
import { DiveCreateInput } from "@/lib/validations/dive";

// How long the start time has to stop changing before a suggestion is fetched.
// The date/time field emits on every keystroke, and this is a hint, not
// something the diver is waiting on.
const SUGGESTION_DEBOUNCE_MS = 400;

/**
 * Keeps a new dive's number in step with the date it's being logged for, until
 * the diver types a number themselves.
 *
 * The number follows the *date*, not the log's high-water mark. Logging today's
 * dive, the two agree. Back-filling a 2019 dive into a log that reaches #212,
 * they don't: this suggests #12, where that dive actually sits. The rule lives
 * in the API (`services/dive_numbering.py`), which is also why this refetches
 * when the date changes rather than deriving anything locally - importing a
 * dive-computer file rewrites `start_time` to whenever the dive really was, and
 * the number has to follow it there.
 *
 * Create-only, deliberately. On the edit form, silently renumbering a dive
 * because its date was corrected is the automatic renumbering the app avoids
 * everywhere else - an existing number may be written in a paper logbook, or on
 * the back of a photo.
 */
export function useSuggestedDiveNumber(
  form: UseFormReturn<DiveCreateInput>,
  // False while the page has no signed-in user yet; the endpoint is
  // authenticated and reads the caller's own log.
  enabled: boolean,
): DiveNumberSuggestion | null {
  const [suggestion, setSuggestion] = useState<DiveNumberSuggestion | null>(
    null,
  );
  const startTime = form.watch("start_time");
  // Bumped per request so a slow response for an earlier date can't land on top
  // of the one the diver is actually looking at.
  const latestRequest = useRef(0);

  useEffect(() => {
    if (!enabled || !startTime) return;
    // The diver has typed a number of their own; the date no longer drives it.
    // `getFieldState` isn't reactive, which suits this: it's a guard read at the
    // moment of writing, not something to re-run the effect on.
    if (form.getFieldState("dive_number").isDirty) return;

    const requestId = ++latestRequest.current;

    const timer = setTimeout(async () => {
      try {
        const next = await divesAPI.getNextDiveNumber(startTime);
        // Re-checked after the await, not just before it: the diver may have
        // typed a number of their own while this was in flight, and overwriting
        // it is the one thing this hook must never do.
        if (requestId !== latestRequest.current) return;
        if (form.getFieldState("dive_number").isDirty) return;

        setSuggestion(next);
        // `resetField` rather than `setValue`, so the suggestion lands as the
        // field's new *default* rather than as an edit of the old one.
        //
        // `setValue` without `shouldDirty` looks like the right call and isn't:
        // react-hook-form recomputes `dirtyFields` by comparing values against
        // `defaultValues` on the next change to any field, so a suggestion
        // written over the default would show up as dirty the moment the diver
        // touches the date - which is precisely when this needs to run again.
        // The suggestion would land once and then silently stop following the
        // date. Writing the default keeps "dirty" meaning what this hook reads
        // it as: the diver typed a number.
        form.resetField("dive_number", { defaultValue: next.dive_number });
      } catch (error) {
        // Non-fatal by design: the field keeps whatever it has and the diver can
        // type a number. A dive log that refuses to open its form because a
        // suggestion endpoint is down would be a much worse failure.
        console.error("Failed to suggest a dive number:", error);
      }
    }, SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [enabled, startTime, form]);

  return suggestion;
}
