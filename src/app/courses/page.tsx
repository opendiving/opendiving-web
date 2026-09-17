"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { coursesAPI, Course } from "@/lib/api/courses";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import { courseStatusBadgeVariant, courseStatusLabel } from "@/lib/course";
import { formatTripDateRange } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CoursesPageFrame } from "@/components/courses/courses-page-frame";
import {
  NO_COURSE_FILTERS,
  type CourseListFilters,
} from "@/components/courses/courses-filters";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CourseDialog } from "@/components/courses/course-dialog";
import { Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// How long to wait after the last keystroke before asking the server, matching
// the pickers' own debounce: long enough that typing a course name is one
// request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

export default function CoursesPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a course = editing it; `undefined` = creating.
  const [editingCourse, setEditingCourse] = useState<Course | null | undefined>(
    null,
  );
  // What the box holds, and what has actually been asked for. Splitting them is
  // what keeps the debounce off the input's own responsiveness.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  // No debounce twin: each of these commits a whole value at once, so what is
  // held and what has been asked for are the same thing.
  const [filters, setFilters] = useState<CourseListFilters>(NO_COURSE_FILTERS);

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

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
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Course>(fetchCourses, {
    keyOf: (course) => course.uuid,
    enabled: !!user,
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
    onDeleted: removeItem,
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
        onNew={() => setEditingCourse(undefined)}
        rows={courses.map((course) => (
          <TableRow key={course.uuid}>
            <TableCell className="font-medium">
              <Link
                href={`/courses/${course.uuid}`}
                className="hover:underline"
              >
                {course.name}
              </Link>
            </TableCell>
            {/* A course need not name an agency, so this cell gets the
                        same dash the Dates one does rather than a gap that
                        reads as a rendering fault. */}
            <TableCell>
              {certificationAgencyLabel(course.agency, course.agency_other) ?? (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              {formatTripDateRange(
                course.start_date ?? undefined,
                course.end_date ?? undefined,
              ) ?? <span className="text-muted-foreground">-</span>}
            </TableCell>
            {/* A status column, so the chips get one width the way the
                        gear table's Service column does - `min-w-24` is the same
                        6rem, and clears "Not passed" at 88px, the widest of the
                        six labels. Only the layout is shared: these variants are
                        still the older `default`/`secondary`/`warning` scale, not
                        the brand fills gear and certifications moved to.

                        `whitespace-nowrap` earns more here than it does there.
                        `courseStatusLabel` falls back to the raw wire value for a
                        status this build doesn't know, so the label is not drawn
                        from a fixed set of six and can be arbitrarily long. */}
            <TableCell>
              <Badge
                variant={courseStatusBadgeVariant(course.status)}
                className="min-w-24 justify-center whitespace-nowrap"
              >
                {courseStatusLabel(course.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              {/* Named per row, not per action: ten identical "Edit"s
                          tell a screen reader's controls list nothing about
                          which course. See DECISIONS.md, "Ten rows of 'Edit'
                          name nothing". */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`View ${course.name}`}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/courses/${course.uuid}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Edit ${course.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingCourse(course)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete ${course.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => requestDelete(course.uuid)}
                    disabled={deletingId === course.uuid}
                  >
                    {deletingId === course.uuid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </IconTooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      />

      <CourseDialog
        open={editingCourse !== null}
        onOpenChange={(open) => !open && setEditingCourse(null)}
        course={editingCourse}
        onSaved={applySaved}
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
