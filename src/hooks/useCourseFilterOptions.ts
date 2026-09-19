"use client";

import { useCallback, useEffect, useState } from "react";

import { isAbortError } from "@/lib/api/client";
import {
  CERTIFICATION_AGENCIES,
  type CertificationAgency,
} from "@/lib/api/certifications";
import { COURSE_STATUSES, fetchAllCourses } from "@/lib/api/courses";
import { courseVocabulary, type CourseVocabulary } from "@/lib/course";

// What to offer when the vocabulary is unknown - before the first fetch lands,
// and after one that failed. The whole closed set: a filter listing too much is
// worse than one listing the wrong thing, and far better than one listing
// nothing.
const EVERY_OPTION: CourseVocabulary = {
  agencies: [...CERTIFICATION_AGENCIES] as CertificationAgency[],
  statuses: [...COURSE_STATUSES],
};

export interface CourseFilterOptions extends CourseVocabulary {
  /** Re-reads the vocabulary; a no-op while `enabled` is false. */
  reload: () => void;
}

/**
 * The agencies and statuses to offer in the course filter row, read from the
 * diver's own courses.
 *
 * `enabled` is the diver having asked to filter at all: the row is behind a
 * button, so most visits never need this and the request is not worth making
 * until one does. It is read once and kept - call `reload` after a course is
 * saved or deleted, since training with a new agency widens the vocabulary.
 *
 * A failure is silent. Nothing is broken by it, the diver did not ask for this
 * request, and the fallback is the full set they had before.
 */
export function useCourseFilterOptions(enabled: boolean): CourseFilterOptions {
  const [vocabulary, setVocabulary] = useState<CourseVocabulary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    fetchAllCourses(controller.signal)
      .then((courses) => setVocabulary(courseVocabulary(courses)))
      .catch((error) => {
        if (!isAbortError(error)) {
          console.error("Failed to read the course filter options:", error);
        }
      });

    return () => controller.abort();
  }, [enabled, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { ...(vocabulary ?? EVERY_OPTION), reload };
}
