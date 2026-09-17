"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComboboxSearchResult,
  CreatableCombobox,
} from "@/components/ui/creatable-combobox";
import type { FormControlSlotProps } from "@/components/ui/form";
import { coursesAPI, Course } from "@/lib/api/courses";
import { CourseDialog } from "@/components/courses/course-dialog";

// How many courses the dropdown asks for at a time. Enough to scroll through
// before typing, far short of the API's 100 cap.
const COURSES_PER_SEARCH = 25;

export interface CourseComboboxProps extends FormControlSlotProps {
  value?: string | null;
  // `null`, not `undefined`, for "no course" - and the distinction is
  // load-bearing on the dive edit form, which builds its PATCH body by skipping
  // fields that are `undefined`. Clearing the picker has to be a value the diver
  // *chose*, not an absent one, or the course is dropped from the request and
  // silently survives the save. `CreatableCombobox` speaks `undefined`, so it is
  // normalized here rather than changing that shared component for its other
  // consumers - the same shape as `TripCombobox`.
  onChange: (courseId: string | null) => void;
  // Fired with the whole course whenever the diver picks one - from the menu,
  // from a committed exact-match, or straight out of the inline "Add course..."
  // dialog. `onChange` carries only the uuid, which is all the dive form wants;
  // the certification form prefills its own fields from the course and would
  // otherwise have to re-fetch a record this component already holds.
  //
  // Not fired for a cleared selection: clearing says "no logged course", not
  // "those facts are wrong". Nor for the lookup of an incoming `value`, which is
  // the form seeding itself rather than the diver choosing.
  onCourseSelected?: (course: Course) => void;
  disabled?: boolean;
}

// Picks (or creates) the training course a dive was part of, or the one a
// certification came out of. The dropdown searches server-side rather than
// fetching the user's whole course list - see DECISIONS.md.
export function CourseCombobox({
  value,
  onChange,
  onCourseSelected,
  disabled,
  ...slotProps
}: CourseComboboxProps) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  // Every course this picker has seen - its own search results, whatever it
  // created, and a lookup for a `value` that arrived from the form. Without it
  // the input would sit empty on a dive that already has a course, since the
  // browser never holds the full list to look the name up in.
  //
  // Whole records rather than the uuid->name map this used to be: every site
  // that writes here already has the full `Course` in hand, and keeping it is
  // what lets `onCourseSelected` answer without a request of its own.
  const [courses, setCourses] = useState<Record<string, Course>>({});
  // Fired-for uuids, so a failed lookup isn't retried on every render.
  const requestedRef = useRef<Set<string>>(new Set());

  const remember = useCallback(
    (course: Course) =>
      setCourses((prev) => ({ ...prev, [course.uuid]: course })),
    [],
  );

  // No cancellation flag on this one, deliberately. `requestedRef` means the
  // request fires exactly once per uuid, so under StrictMode's mount/unmount/
  // remount the *only* in-flight lookup belongs to the discarded first mount -
  // ignoring its result on cleanup would drop the name for good. Writing to a
  // uuid-keyed map is idempotent, so a late arrival is always safe to apply.
  useEffect(() => {
    if (!value || courses[value] || requestedRef.current.has(value)) return;
    requestedRef.current.add(value);

    coursesAPI
      .getCourse(value)
      .then(remember)
      .catch((error) => console.error("Failed to fetch course:", error));
  }, [value, courses, remember]);

  const searchCourses = useCallback(
    async (query: string): Promise<ComboboxSearchResult> => {
      const response = await coursesAPI.getCourses(1, COURSES_PER_SEARCH, {
        search: query,
      });
      response.data.forEach(remember);
      return {
        items: response.data.map((course) => ({
          id: course.uuid,
          name: course.name,
        })),
        hasMore: response.has_more,
      };
    },
    [remember],
  );

  // The picker's one way in: `CreatableCombobox` reports a pick, a committed
  // exact match and a clear through the same callback, so the full-record
  // notification is derived here rather than at four call sites.
  const handleChange = (courseId: string | undefined) => {
    onChange(courseId ?? null);
    if (!courseId) return;
    const course = courses[courseId];
    if (course) onCourseSelected?.(course);
  };

  const handleCreated = (newCourse: Course) => {
    remember(newCourse);
    onChange(newCourse.uuid);
    onCourseSelected?.(newCourse);
  };

  return (
    <>
      <CreatableCombobox
        {...slotProps}
        onSearch={searchCourses}
        value={value ?? undefined}
        selectedItem={
          value && courses[value]
            ? { id: value, name: courses[value].name }
            : undefined
        }
        onChange={handleChange}
        disabled={disabled}
        placeholder="Select a course..."
        noItemsLabel="No courses yet."
        noMatchesLabel="No courses match."
        addNewLabel="Add course..."
        onAddNew={() => setShowNewDialog(true)}
      />

      {/* Its own mount rather than the app-wide quick-create one, for the same
          reason the other pickers keep theirs: this needs the created course
          handed back so it can select it, which "create something and go look at
          it" cannot do. In the certification dialog that puts a dialog inside a
          dialog - see DECISIONS.md on why that holds. */}
      <CourseDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onSaved={handleCreated}
      />
    </>
  );
}
