"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useCourseFilterOptions } from "@/hooks/useCourseFilterOptions";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { coursesAPI, Course } from "@/lib/api/courses";
import { CoursesPageFrame } from "@/components/courses/courses-page-frame";
import { CourseCard } from "@/components/courses/course-card";
import {
  hasCourseFilters,
  NO_COURSE_FILTERS,
  type CourseListFilters,
} from "@/components/courses/courses-filters";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CourseDialog } from "@/components/courses/course-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { PageSpinner } from "@/components/ui/page-spinner";

export function CoursesPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const {
    input: searchInput,
    setInput: setSearchInput,
    term: search,
  } = useDebouncedSearch();
  // No debounce twin: each of these commits a whole value at once, so what is
  // held and what has been asked for are the same thing.
  const [filters, setFilters] = useState<CourseListFilters>(NO_COURSE_FILTERS);
  // Latched by the filter panel's first open, since nothing before that needs
  // to know which agencies and statuses the diver's courses use.
  const [wantsFilterOptions, setWantsFilterOptions] = useState(false);
  const {
    agencies,
    statuses,
    reload: reloadFilterOptions,
  } = useCourseFilterOptions(!!user && wantsFilterOptions);

  // Straight through, empties and all: `getCourses` drops an unset filter from
  // the query string itself, so there is no per-field conversion here to fall
  // out of step with the controls.
  const fetchCourses = useCallback(
    (page: number, perPage: number) =>
      coursesAPI.getCourses(page, perPage, { search, ...filters }),
    [search, filters],
  );

  // Changing the search term or any filter changes this callback's identity,
  // which is what makes `useInfiniteResource` throw away every page it has
  // loaded and read the new query from the first - rows of the unfiltered list
  // are not rows of the filtered one, however many are already on screen.
  const {
    items: courses,
    isLoading: isLoadingCourses,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Course>(fetchCourses, {
    keyOf: (course) => course.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0 || hasCourseFilters(filters),
    errorMessage: "Failed to load courses. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(coursesAPI.deleteCourse, {
    // No "move its dives somewhere else" offer, unlike a trip: a trip groups a
    // whole holiday's dives and moving them is a real operation, while a deleted
    // course simply unlinks - the dives and cards survive without it.
    confirmMessage:
      "Are you sure you want to delete this course? The dives and certifications on it are kept, but they will no longer name it.",
    successMessage: "Course deleted successfully.",
    errorMessage: "Failed to delete course. Please try again.",
    // The row goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them.
    onDeleted: (uuid: string) => {
      removeItem(uuid);
      reloadFilterOptions();
    },
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const isSearching = search.length > 0;

  return (
    <>
      <CoursesPageFrame
        isLoading={isLoadingCourses}
        totalCount={totalCount}
        isCountNarrowed={isCountNarrowed}
        itemsPerPage={itemsPerPage}
        search={searchInput}
        onSearchChange={setSearchInput}
        filters={filters}
        onFiltersChange={setFilters}
        isSearching={isSearching}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onNew={() => openCreate("course")}
        onFiltersOpened={() => setWantsFilterOptions(true)}
        agencies={agencies}
        statuses={statuses}
        cards={courses.map((course) => (
          <CourseCard
            key={course.uuid}
            course={course}
            onEdit={() => setEditingCourse(course)}
            onDelete={() => requestDelete(course.uuid)}
            isDeleting={deletingId === course.uuid}
          />
        ))}
      />

      <CourseDialog
        open={editingCourse !== null}
        onOpenChange={(open) => !open && setEditingCourse(null)}
        course={editingCourse}
        // The vocabulary too, not just the row: an edit naming a new agency is
        // what adds that agency to the filter.
        onSaved={(course) => {
          applySaved(course);
          reloadFilterOptions();
        }}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete course"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </>
  );
}
