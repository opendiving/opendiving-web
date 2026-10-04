"use client";

import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { coursesAPI } from "@/lib/api/courses";
import type { PersonReference } from "@/lib/api/people";
import { tripsAPI } from "@/lib/api/trips";
import type { DiveFormVisibility } from "@/hooks/useDiveFormVisibility";
import { mergePeople } from "@/lib/people";
import type { DiveCreateInput } from "@/lib/validations/dive";

export interface UseDivePickPrefillOptions {
  form: UseFormReturn<DiveCreateInput>;
  visibility: Pick<DiveFormVisibility, "autofill" | "overwrite">;
  /** The last dive's people, once the last-dive prefill has read them. */
  lastDivePeople: readonly PersonReference[];
}

/** A record by uuid, or null for none or a failed read - the pick still lands. */
async function read<T>(
  uuid: string | null | undefined,
  get: (uuid: string) => Promise<T>,
): Promise<T | null> {
  if (!uuid) return null;
  try {
    return await get(uuid);
  } catch (error) {
    console.error("Failed to read a pick for the prefill:", error);
    return null;
  }
}

/**
 * What the new-dive form fills in when the diver picks a course or a trip: the
 * course's dive center where the diver has not chosen one, and the people - the
 * course's, then the trip's, then the last dive's, each once. Clearing either pick
 * changes nothing.
 *
 * People are the diver's per person rather than per field: whoever they added,
 * removed or gave another role stays that way through every later pick. Their
 * edits are read off the field's own changes and laid over the merge, which is
 * why the merge may then be written over the whole field.
 *
 * The new form only: the edit form never changes a stored value on a pick.
 */
export function useDivePickPrefill({
  form,
  visibility,
  lastDivePeople,
}: UseDivePickPrefillOptions): void {
  const visibilityRef = useRef(visibility);
  const lastDivePeopleRef = useRef(lastDivePeople);
  useEffect(() => {
    visibilityRef.current = visibility;
    lastDivePeopleRef.current = lastDivePeople;
  });

  useEffect(() => {
    let cancelled = false;
    // The diver's own word on single people: who they put on the dive or gave a
    // role, and who they took off.
    const chosen = new Map<string, PersonReference>();
    const removed = new Set<string>();
    let seen: readonly PersonReference[] = form.getValues("people") ?? [];
    // The course whose dive center is still to be written, until a reply for it
    // lands - a trip picked meanwhile supersedes the people, not the center.
    let pendingContactCourse: string | null = null;
    let latest = 0;

    const recordEdit = (next: readonly PersonReference[]) => {
      const before = new Map(seen.map((ref) => [ref.person_uuid, ref]));
      const after = new Set(next.map((ref) => ref.person_uuid));
      for (const ref of next) {
        if (before.get(ref.person_uuid)?.role === ref.role) continue;
        chosen.set(ref.person_uuid, ref);
        removed.delete(ref.person_uuid);
      }
      for (const uuid of before.keys()) {
        if (after.has(uuid)) continue;
        removed.add(uuid);
        chosen.delete(uuid);
      }
    };

    const applyPick = async () => {
      const request = ++latest;
      const { course_uuid, trip_uuid } = form.getValues();
      const [course, trip] = await Promise.all([
        read(course_uuid, coursesAPI.getCourse),
        read(trip_uuid, tripsAPI.getTrip),
      ]);
      if (cancelled || request !== latest) return;
      const { autofill, overwrite } = visibilityRef.current;

      if (course && course.uuid === pendingContactCourse) {
        pendingContactCourse = null;
        if (course.contact_uuid) autofill("contact_uuid", course.contact_uuid);
      }

      const merged = mergePeople(
        mergePeople(course?.people ?? [], trip?.people ?? []),
        lastDivePeopleRef.current,
      )
        .filter((ref) => !removed.has(ref.person_uuid))
        .map((ref) => chosen.get(ref.person_uuid) ?? ref);
      overwrite("people", mergePeople(merged, [...chosen.values()]));
    };

    const subscription = form.watch((_values, { name, type }) => {
      if (name === "people" || name === undefined) {
        const next = form.getValues("people") ?? [];
        if (name === "people" && type === "change") recordEdit(next);
        seen = next;
      }
      // `type` is set only by a field's own `onChange` - the diver's pick, never
      // a write from the prefill or this hook.
      if (type !== "change") return;
      if (name === "course_uuid") {
        pendingContactCourse = form.getValues("course_uuid") ?? null;
        if (pendingContactCourse) void applyPick();
      } else if (name === "trip_uuid" && form.getValues("trip_uuid")) {
        void applyPick();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [form]);
}
