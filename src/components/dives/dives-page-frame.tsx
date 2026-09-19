"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
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
   * The numbering line above the table. It draws nothing until its own request
   * lands, so leaving it out is the page's own first render.
   */
  numbering?: ReactNode;
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
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: DivesPageFrameProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dives</h1>
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

      <Card>
        <CardHeader className="items-start">
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="total dive"
          />
        </CardHeader>
        <CardContent>
          {numbering}

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
                  <TableHead>#</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Dive Site</TableHead>
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
