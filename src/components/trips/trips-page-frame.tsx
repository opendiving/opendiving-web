"use client";

import { type ReactNode } from "react";
import { Luggage, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { ListSearch } from "@/components/ui/list-search";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";

export interface TripsPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  rows?: ReactNode[];
  /** What the search box holds. Empty on arrival. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Whether a search *term* is in effect, which is not what the box holds. */
  isSearching?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  /** Opens the new-trip dialog. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /trips draws before its rows exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function TripsPageFrame({
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
}: TripsPageFrameProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Trips</h1>
          <p className="text-muted-foreground mt-2">
            Group your dives into trips and liveaboards
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4 mr-2" />
          New trip
        </Button>
      </div>

      <Card>
        <CardHeader>
          {/* Hidden, not dropped: the page's `h1` names the list, but the
              card is still a section of it, and the empty state's `h3` below
              would skip a level without this. */}
          <CardTitle as="h2" className="sr-only">
            Trip List
          </CardTitle>
          {/* The count and the box that changes it, on one line - and under
              `sm`, where they do not both fit, the count and the button the box
              folds behind. `flex-wrap` is what gives the opened box its own
              line. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="total trip"
            />
            <ListSearch
              id="trip-search"
              label="Search trips by name or location"
              toggleLabel="Search trips"
              placeholder="Search by name or location..."
              value={search}
              onChange={onSearchChange}
            />
          </div>
        </CardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            // A searched list with nothing in it is a different statement from
            // an empty one, so it keeps its one line: no icon, no heading, and
            // pointedly no "add your first trip", which would be answering a
            // question nobody asked.
            isSearching ? (
              <div className="text-center py-12 text-muted-foreground">
                No trips match that name or location.
              </div>
            ) : (
              <EmptyState
                icon={Luggage}
                title="No trips yet"
                description="Create your first trip to group your dives!"
                action={
                  <Button onClick={onNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first trip
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
                  <TableHead>Dates</TableHead>
                  <TableHead>Locations</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={4} rows={itemsPerPage} />
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
            itemLabel="trips"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
