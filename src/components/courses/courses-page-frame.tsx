"use client";

import { type ReactNode } from "react";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { Input } from "@/components/ui/input";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
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
  /** What the search box holds. Empty on arrival, which is the fallback's case. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** True when the empty state is a filtered list rather than an empty logbook. */
  isSearching?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-course dialog. Absent in the fallback, which has none to open. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /courses draws before its rows exist, rendered by the page and by
// the route fallback alike so the two cannot describe the screen differently.
export function CoursesPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  rows = [],
  search = "",
  onSearchChange = noop,
  isSearching = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: CoursesPageFrameProps) {
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
              isLoading={isLoading}
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
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          {!isLoading && rows.length === 0 ? (
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
                  <Button onClick={onNew}>
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
