"use client";

import { useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { ChevronDown, Plus, SlidersHorizontal, Upload, X } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { IndexPageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { IconTooltip } from "@/components/ui/tooltip";
import {
  DivesFilters,
  diveFiltersChanged,
  hasDiveFilters,
  NO_DIVE_FILTERS,
  type DiveListFilters,
} from "@/components/dives/dives-filters";
import type { Tag } from "@/lib/api/tags";
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
  /** The tag, the type and the order the list is read in. */
  filters?: DiveListFilters;
  onFiltersChange?: (filters: DiveListFilters) => void;
  /**
   * Fired each time the filter panel is opened. The page reads the diver's tags
   * off the back of it - the panel is shut on arrival, so most visits need no
   * such request at all.
   */
  onFiltersOpened?: () => void;
  /** What the tag select offers. */
  tags?: readonly Tag[];
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
  filters = NO_DIVE_FILTERS,
  onFiltersChange = noop,
  onFiltersOpened = noop,
  tags,
}: DivesPageFrameProps) {
  const [isPanelOpen, setPanelOpen] = useState(false);
  const isNarrowed = hasDiveFilters(filters);
  // An unstarted logbook, rather than one filtered down to nothing - see
  // `useIsEmptyList`.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: rows.length,
    isNarrowed,
  });

  // Spaced by the container rather than by a margin on each block: the
  // numbering card is absent more often than not, and a gap it carried itself
  // would be left behind on the pages where it draws nothing.
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 space-y-6">
      <IndexPageHeader
        title="Dives"
        description="Manage and track your diving activities"
        headingRef={headingRef}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/import">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dives/new">
                <Plus className="h-4 w-4 mr-2" />
                Log new dive
              </Link>
            </Button>
          </div>
        }
      />

      {numbering}

      <Card>
        <ListCardHeader title="Dive Log" isEmpty={isEmptyList}>
          <CountBadge
            count={totalCount}
            isLoading={isLoading}
            label="total dive"
          />
          {/* The courses list's panel, and for its reason: shutting it takes the
              filters with it, so a folded row never narrows the list unseen, and
              the button's name says so while there is something to lose - the
              sort included, which a shut panel would otherwise keep applying. */}
          <IconTooltip
            label={
              !isPanelOpen
                ? "Filter and sort dives"
                : diveFiltersChanged(filters)
                  ? "Close filters, clearing them"
                  : "Close filters"
            }
          >
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              aria-expanded={isPanelOpen}
              aria-controls="dive-filters"
              onClick={() => {
                if (isPanelOpen) {
                  onFiltersChange(NO_DIVE_FILTERS);
                } else {
                  onFiltersOpened();
                }
                setPanelOpen((open) => !open);
              }}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {isPanelOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </IconTooltip>
        </ListCardHeader>
        <CardContent>
          {/* Hidden rather than unmounted, so `aria-controls` points at
              something, and gone with the button that opens it for a list with
              nothing in it to narrow. */}
          {!isEmptyList && (
            <div id="dive-filters" hidden={!isPanelOpen}>
              <DivesFilters
                filters={filters}
                onFiltersChange={onFiltersChange}
                tags={tags}
              />
            </div>
          )}

          {!isLoading && rows.length === 0 && isNarrowed ? (
            // A list filtered to nothing is not an empty logbook, so it keeps one
            // line and no "log your first dive" - see "One `EmptyState`, and the
            // filtered list is not one" in DECISIONS.md.
            <div className="text-center py-12 text-muted-foreground">
              No dives match those filters.
            </div>
          ) : !isLoading && rows.length === 0 ? (
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
