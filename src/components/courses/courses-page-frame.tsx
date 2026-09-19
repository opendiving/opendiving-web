"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Plus,
  Search,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import { IconTooltip } from "@/components/ui/tooltip";
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
  const isNarrowed = search.length > 0 || hasCourseFilters(filters);
  const searchRef = useRef<HTMLInputElement>(null);

  // Typing is what the diver came for, and pressing a magnifier to then reach
  // for the box is a click nobody wanted. In an effect rather than at the press,
  // because the panel is `hidden` until this render commits and a box with no
  // layout box cannot take focus - and `useEffectOnChange`, because coming back
  // to a route left with the panel open re-creates the effect without anybody
  // having pressed anything, and a phone answers that with its keyboard.
  useEffectOnChange(() => {
    if (isPanelOpen) searchRef.current?.focus();
  }, [isPanelOpen]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Courses</h1>
          <p className="text-muted-foreground mt-2">
            The training you did, with the dives and cards it produced
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New course
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="total course"
            />
            {/* The button says what it opens, and the dot says the shut panel
                is still narrowing the list - a collapsed row that silently
                hides half the courses is the one failure this costs. */}
            <IconTooltip
              label={
                isNarrowed
                  ? "Search and filter courses, narrowing the list"
                  : "Search and filter courses"
              }
            >
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                aria-expanded={isPanelOpen}
                aria-controls="course-filters"
                onClick={() => {
                  setPanelOpen((open) => !open);
                  if (!isPanelOpen) onFiltersOpened();
                }}
              >
                {/* The chevron carries which way the panel will move, which the
                    magnifier alone cannot say. It points at the panel: down to
                    the row it is about to open, up to fold it back into the
                    header. */}
                <span className="relative flex">
                  <Search className="h-4 w-4" />
                  {isNarrowed && !isPanelOpen && (
                    <span
                      aria-hidden
                      className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-teal"
                    />
                  )}
                </span>
                {isPanelOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </IconTooltip>
          </div>
        </CardHeader>
        <CardContent>
          {/* Hidden rather than unmounted, so `aria-controls` points at
              something and a half-typed date survives a shut. */}
          <div id="course-filters" hidden={!isPanelOpen}>
            <CoursesFilters
              search={search}
              onSearchChange={onSearchChange}
              filters={filters}
              onFiltersChange={onFiltersChange}
              agencies={agencies}
              statuses={statuses}
              searchRef={searchRef}
            />
          </div>

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
  );
}
