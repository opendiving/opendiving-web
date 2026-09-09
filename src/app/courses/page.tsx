"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { coursesAPI, Course } from "@/lib/api/courses";
import { certificationAgencyLabel } from "@/lib/api/certifications";
import { courseStatusBadgeVariant, courseStatusLabel } from "@/lib/course";
import { formatTripDateRange } from "@/lib/date-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CountBadge } from "@/components/ui/count-badge";
import { Input } from "@/components/ui/input";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CourseDialog } from "@/components/courses/course-dialog";
import { Plus, Eye, Edit, Trash2, Loader2, Search } from "lucide-react";
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

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCourses = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return coursesAPI.getCourses(
        user.uuid,
        page,
        perPage,
        search || undefined,
      );
    },
    [user, search],
  );

  // Changing the search term changes this callback's identity, which is what
  // sends `usePaginatedResource` back to page 1 for the new query - a page 3 of
  // the unfiltered list is not a page of the filtered one.
  const {
    items: courses,
    isLoading: isLoadingCourses,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage: fetchCoursesPage,
    refetch,
  } = usePaginatedResource<Course>(fetchCourses, {
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
    onDeleted: refetch,
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const isSearching = search.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="text-muted-foreground mt-2">
            The training you did, with the dives and cards it produced
          </p>
        </div>
        <Button onClick={() => setEditingCourse(undefined)}>
          <Plus className="h-4 w-4 mr-2" />
          New Course
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span>Course List</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoadingCourses}
              label="total course"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="course-search" className="sr-only">
              Search courses by name
            </label>
            <Input
              id="course-search"
              type="search"
              className="pl-9"
              placeholder="Search by name..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          {!isLoadingCourses && courses.length === 0 ? (
            <div className="text-center py-12">
              {isSearching ? (
                // A filtered list with nothing in it is a different statement
                // from an empty logbook, and offering "add your first course"
                // here would be answering a question nobody asked.
                <div className="text-muted-foreground">
                  No courses match that name.
                </div>
              ) : (
                <>
                  <div className="text-muted-foreground mb-4">
                    No courses yet. Add the training you have done to group its
                    dives and cards.
                  </div>
                  <Button onClick={() => setEditingCourse(undefined)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Course
                  </Button>
                </>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.length === 0 && (
                  <TableRowsSkeleton columns={5} rows={itemsPerPage} />
                )}
                {courses.map((course) => (
                  <TableRow key={course.uuid}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/courses/${course.uuid}`}
                        className="hover:underline"
                      >
                        {course.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {certificationAgencyLabel(
                        course.agency,
                        course.agency_other,
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
              </TableBody>
            </Table>
          )}

          <PaginationFooter
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoading={isLoadingCourses}
            itemLabel="courses"
            onPageChange={fetchCoursesPage}
          />
        </CardContent>
      </Card>

      <CourseDialog
        userId={user?.uuid ?? ""}
        open={editingCourse !== null}
        onOpenChange={(open) => !open && setEditingCourse(null)}
        course={editingCourse}
        onSaved={refetch}
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
    </div>
  );
}
