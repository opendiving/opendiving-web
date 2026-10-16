"use client";

import { useState, type ReactNode } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { ListSearch } from "@/components/ui/list-search";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  CoursesFilters,
  hasCourseFilters,
  NO_COURSE_FILTERS,
  type CourseListFilters,
} from "@/components/courses/courses-filters";
import type { CertificationAgency } from "@/lib/api/certifications";
import type { CourseStatus } from "@/lib/api/courses";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";

export interface CoursesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  rows?: ReactNode[];
  /** What the search box holds. Empty on arrival. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** The date, agency and status the list is narrowed by, if any. */
  filters?: CourseListFilters;
  onFiltersChange?: (filters: CourseListFilters) => void;
  /** Whether a search *term* is in effect, which is not what the box holds. */
  isSearching?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-course dialog. */
  onNew?: () => void;
  /**
   * Fired each time the filter panel is opened. The page reads the agencies and
   * statuses in use off the back of it - the panel is shut on arrival, so most
   * visits need no such request at all.
   */
  onFiltersOpened?: () => void;
  /** What the two selects offer; the full vocabulary when not given. */
  agencies?: readonly CertificationAgency[];
  statuses?: readonly CourseStatus[];
}

const noop = () => {};

// Everything /courses draws before its rows exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function CoursesPageFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
  itemsPerPage,
  rows = [],
  search = "",
  onSearchChange = noop,
  filters = NO_COURSE_FILTERS,
  onFiltersChange = noop,
  isSearching = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
  onFiltersOpened = noop,
  agencies,
  statuses,
}: CoursesPageFrameProps) {
  const [isPanelOpen, setPanelOpen] = useState(false);
  // A term in flight, one still in the box waiting for the debounce that will
  // make it one, or a filter: any of the three is narrowing the list.
  const isNarrowed =
    isSearching || search.length > 0 || hasCourseFilters(filters);
  // Nothing to count, and nothing the panel could usefully narrow. Sticky across
  // the commit in which a cleared term or filter has been dropped but the rows
  // it selected are still on screen - see `useIsEmptyList`.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed,
  });
  return (
    <div>
      <IndexHero
        title="Courses"
        description="The training you did, with the dives and cards it produced"
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New course
          </Button>
        }
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title="Course List" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="course"
              total
              isNarrowed={isCountNarrowed}
            />
            <ListSearch
              id="course-search"
              label="Search courses by name"
              toggleLabel="Search and filter courses"
              placeholder="Search by name..."
              value={search}
              onChange={onSearchChange}
              filters={{
                controls: "course-filters",
                isOpen: isPanelOpen,
                onOpenChange: (open) => {
                  if (open) onFiltersOpened();
                  setPanelOpen(open);
                },
                onClear: () => onFiltersChange(NO_COURSE_FILTERS),
                isChanged: hasCourseFilters(filters),
                label: "Filter courses",
              }}
            />
          </ListCardHeader>
          <CardContent>
            {/* Hidden rather than unmounted, so `aria-controls` points at
                something - nothing in here has to survive a shut, which is what
                empties it. But it goes entirely with the button that opens it,
                since an empty list leaves nothing to open it with. */}
            {!isEmptyList && (
              <div id="course-filters" hidden={!isPanelOpen}>
                <CoursesFilters
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                  agencies={agencies}
                  statuses={statuses}
                />
              </div>
            )}

            {!isLoading && rows.length === 0 ? (
              // A narrowed list with nothing in it is a different statement from
              // an empty logbook, so it keeps its one line: no icon, no heading,
              // and pointedly no "add your first course", which would be
              // answering a question nobody asked. Which sentence depends on what
              // is narrowing it: a diver who only typed a name is told about the
              // name.
              isSearching || hasCourseFilters(filters) ? (
                <div className="text-center py-12 text-muted-foreground">
                  {hasCourseFilters(filters)
                    ? "No courses match those filters."
                    : "No courses match that name."}
                </div>
              ) : (
                <EmptyState
                  icon={GraduationCap}
                  title="No courses yet"
                  description="Add the training you have done to group its dives and cards."
                  action={
                    <Button onClick={onNew}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add your first course
                    </Button>
                  }
                />
              )
            ) : (
              <Table
                // Busy on the outside, hidden on each placeholder row within - the
                // split `ListRowsSkeleton` documents, applied here because the rows
                // themselves are `aria-hidden` and would otherwise leave a reader
                // with a table that is silently empty rather than one that is
                // loading.
                aria-busy={rows.length === 0 || undefined}
              >
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
                  {rows.length === 0 && (
                    <TableRowsSkeleton columns={5} rows={itemsPerPage} />
                  )}
                  {rows}
                </TableBody>
              </Table>
            )}

            <LoadMoreTrigger
              hasMore={hasMore}
              isLoading={isLoadingMore}
              hasFailed={loadFailed}
              loadedCount={rows.length}
              totalCount={totalCount}
              itemsPerPage={itemsPerPage}
              itemLabel="courses"
              onLoadMore={onLoadMore}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
