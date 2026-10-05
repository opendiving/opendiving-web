"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coursesAPI, type CourseLookupItem } from "@/lib/api/courses";
import { tripsAPI, type TripLookupItem } from "@/lib/api/trips";

export interface DiveRoster {
  // The trip's people, then the course's, each once.
  people: string[];
  // The course's contact, when it names one.
  contacts: string[];
}

// Who the dive form's pickers list first: the people on the dive's trip and
// course, and the course's contact. Derived from the uuids the form holds rather
// than from a pick, since a trip also arrives by the last-dive prefill, a URL or
// the dive being edited. Each lookup row is read once per uuid; a cleared field
// drops its share of the roster at once.
export function useDiveRoster(
  tripUuid: string | null | undefined,
  courseUuid: string | null | undefined,
): DiveRoster {
  const [trips, setTrips] = useState<Record<string, TripLookupItem>>({});
  const [courses, setCourses] = useState<Record<string, CourseLookupItem>>({});
  // No cancellation, for the reason `TripCombobox` gives: each read fires once
  // per uuid, and a uuid-keyed map takes a late arrival safely.
  const requestedTripsRef = useRef<Set<string>>(new Set());
  const requestedCoursesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tripUuid || requestedTripsRef.current.has(tripUuid)) return;
    requestedTripsRef.current.add(tripUuid);
    tripsAPI
      .lookupTripsByUuid([tripUuid])
      .then(([trip]) => {
        if (trip) setTrips((prev) => ({ ...prev, [trip.uuid]: trip }));
      })
      .catch((error) => console.error("Failed to fetch trip:", error));
  }, [tripUuid]);

  useEffect(() => {
    if (!courseUuid || requestedCoursesRef.current.has(courseUuid)) return;
    requestedCoursesRef.current.add(courseUuid);
    coursesAPI
      .lookupCoursesByUuid([courseUuid])
      .then(([course]) => {
        if (course) setCourses((prev) => ({ ...prev, [course.uuid]: course }));
      })
      .catch((error) => console.error("Failed to fetch course:", error));
  }, [courseUuid]);

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
