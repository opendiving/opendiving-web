"use client";

import { type ReactNode } from "react";
import { MapPin, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { IndexPageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
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

export interface SitesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
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
  /** Opens the new-site dialog. */
  onNew?: () => void;
}

const noop = () => {};

// Everything /sites draws before its rows exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function SitesPageFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
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
}: SitesPageFrameProps) {
  // Nothing to count and nothing to search. A term in flight and one still in the
  // box waiting for the debounce both count as narrowing, and `useIsEmptyList`
  // holds that reading across the commit where neither is true yet the rows are
  // still the search's.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed: isSearching || search.length > 0,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6">
      <IndexPageHeader
        className="mb-6"
        title="Dive Sites"
        description="Keep track of the dive sites you've visited"
        action={
          <Button onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New dive site
          </Button>
        }
      />

      <Card>
        {/* The count and the box that changes it, on one line - and under
            `sm`, where they do not both fit, the count and the button the box
            folds behind. */}
        <ListCardHeader title="Dive Site List" isEmpty={isEmptyList}>
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="dive site"
            total
            isNarrowed={isCountNarrowed}
          />
          <ListSearch
            id="dive-site-search"
            label="Search dive sites by name or location"
            toggleLabel="Search dive sites"
            placeholder="Search by name or location..."
            value={search}
            onChange={onSearchChange}
          />
        </ListCardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            // A searched list with nothing in it is a different statement from
            // an empty one, so it keeps its one line: no icon, no heading, and
            // pointedly no "add your first dive site", which would be answering
            // a question nobody asked.
            isSearching ? (
              <div className="text-center py-12 text-muted-foreground">
                No dive sites match that name or location.
              </div>
            ) : (
              <EmptyState
                icon={MapPin}
                title="No dive sites yet"
                description="Add your first dive site to start tracking your favorite spots!"
                action={
                  <Button onClick={onNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add your first dive site
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
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={3} rows={itemsPerPage} />
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
            itemLabel="dive sites"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
