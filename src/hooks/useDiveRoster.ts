"use client";

import { useMemo } from "react";
import { coursesAPI } from "@/lib/api/courses";
import { tripsAPI } from "@/lib/api/trips";
import { useLookupLabels } from "@/hooks/useLookupLabels";

export interface DiveRoster {
  /** The trip's people, then the course's, each once. */
  people: string[];
  /** The course's contact, when it names one. */
  contacts: string[];
}

const lookupTrips = (uuids: string[]) => tripsAPI.lookupTripsByUuid(uuids);
const lookupCourses = (uuids: string[]) =>
  coursesAPI.lookupCoursesByUuid(uuids);

/**
 * Who the dive form's pickers list first: the people on the dive's trip and
 * course, and the course's contact. Derived from the uuids the form holds rather
 * than from a pick, since a trip also arrives by the last-dive prefill, a URL or
 * the dive being edited. Each lookup row is read once per uuid; a cleared field
 * drops its share of the roster at once.
 */
export function useDiveRoster(
  tripUuid: string | null | undefined,
  courseUuid: string | null | undefined,
): DiveRoster {
  const trips = useLookupLabels(lookupTrips, [tripUuid]).records;
  const courses = useLookupLabels(lookupCourses, [courseUuid]).records;

  const trip = tripUuid ? trips[tripUuid] : undefined;
  const course = courseUuid ? courses[courseUuid] : undefined;

  return useMemo(
    () => ({
      people: [
        ...new Set(
          [...(trip?.people ?? []), ...(course?.people ?? [])].map(
            (reference) => reference.person_uuid,
          ),
        ),
      ],
      contacts: course?.contact_uuid ? [course.contact_uuid] : [],
    }),
    [trip, course],
  );
}
