"use client";

import { type ReactNode, type Ref } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";

export interface DivesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  /** The log's rows. Empty while the first page is in flight. */
  rows?: ReactNode[];
  /**
   * The numbering card above the list card. It draws nothing until its own
   * request lands, and nothing at all for a log already numbered consecutively
   * in date order, so leaving it out is the page's own first render.
   */
  numbering?: ReactNode;
  /**
   * Attached to the page's `h1`, which is `tabIndex={-1}` so it can be given
   * focus when something between it and the list removes itself.
   */
  headingRef?: Ref<HTMLHeadingElement>;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const noop = () => {};

// Everything /dives draws before its rows exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function DivesPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  rows = [],
  numbering,
  headingRef,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: DivesPageFrameProps) {
  // An unstarted logbook. Nothing narrows this list, so an empty one is the
  // whole story.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed: false,
  });

  // Spaced by the container rather than by a margin on each block: the
  // numbering card is absent more often than not, and a gap it carried itself
  // would be left behind on the pages where it draws nothing.
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold">
            Dives
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage and track your diving activities
          </p>
        </div>
        <Button asChild>
          <Link href="/dives/new">
            <Plus className="h-4 w-4 mr-2" />
            Log new dive
          </Link>
        </Button>
      </div>

      {numbering}

      <Card>
        <ListCardHeader title="Dive Log" isEmpty={isEmptyList}>
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="total dive"
          />
        </ListCardHeader>
        <CardContent>
          {!isLoading && rows.length === 0 ? (
            <EmptyState
              icon={DiveIcon}
              title="No dives logged yet"
              description="Start by adding your first dive!"
              action={
                <Button asChild>
                  <Link href="/dives/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Log your first dive
                  </Link>
                </Button>
              }
            />
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
                  <TableHead>Dive</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Max Depth</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRowsSkeleton columns={6} rows={itemsPerPage} />
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
            itemLabel="dives"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
