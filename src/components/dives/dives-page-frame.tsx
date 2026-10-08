"use client";

import { useState, type ReactNode, type Ref } from "react";
import Link from "next/link";
import { ChevronDown, CloudUpload, Funnel, Plus, X } from "lucide-react";
import { DiveIcon } from "@/components/logo";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";
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
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";

export interface DivesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  /** One `DiveCard` per dive - list items, for the list this frame draws. */
  cards?: ReactNode[];
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

// Everything /dives draws before its cards exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function DivesPageFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
  itemsPerPage,
  cards = [],
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
    count: cards.length,
    isNarrowed,
  });

  // Spaced by the container rather than by a margin on each block: the
  // numbering card is absent more often than not, and a gap it carried itself
  // would be left behind on the pages where it draws nothing.
  return (
    <div>
      <IndexHero
        title="Dives"
        description="Manage and track your diving activities"
        headingRef={headingRef}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/import">
                <CloudUpload className="h-4 w-4 mr-2" />
                Import
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dives/new">
                <Plus className="h-4 w-4 mr-2" />
                Log new dive
              </Link>
            </Button>
          </>
        }
      />

      <div className={cn(HERO_BODY, "space-y-6 max-sm:space-y-2.5")}>
        {numbering}

        <Card>
          <ListCardHeader title="Dive Log" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="dive"
              total
              isNarrowed={isCountNarrowed}
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
                <Funnel className="h-4 w-4" />
                {isPanelOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </IconTooltip>
          </ListCardHeader>
          {/* Hidden rather than unmounted, so `aria-controls` points at
              something, and gone with the button that opens it for a list with
              nothing in it to narrow. */}
          {!isEmptyList && (
            <CardContent id="dive-filters" hidden={!isPanelOpen}>
              <DivesFilters
                filters={filters}
                onFiltersChange={onFiltersChange}
                tags={tags}
              />
            </CardContent>
          )}
          {/* The card is the list's header - its count and its filters - and
              what it says when there is nothing to list. The dives themselves
              are cards of their own, so they sit below it rather than in it. */}
          {!isLoading && cards.length === 0 && (
            <CardContent>
              {isNarrowed ? (
                // A list filtered to nothing is not an empty logbook, so it
                // keeps one line and no "log your first dive" - see "One
                // `EmptyState`, and the filtered list is not one" in
                // DECISIONS.md.
                <div className="text-center py-12 text-muted-foreground">
                  No dives match those filters.
                </div>
              ) : (
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
              )}
            </CardContent>
          )}
        </Card>

        {(isLoading || cards.length > 0) && (
          // One dive to a row below `lg`, two above, as /trips: a card may hold
          // a map, and a browser keeps only so many of those per page - see
          // `BackdropCard`.
          <ul
            className="grid gap-4 max-sm:gap-2.5 lg:grid-cols-2"
            // Busy on the outside, hidden on each placeholder within - the split
            // `ListRowsSkeleton` documents, so a reader meets a list that is
            // loading rather than one that is silently empty.
            aria-busy={cards.length === 0 || undefined}
          >
            {cards.length === 0 &&
              Array.from({ length: itemsPerPage }, (_, index) => (
                <BackdropCardSkeleton key={index} />
              ))}
            {cards}
          </ul>
        )}

        <LoadMoreTrigger
          hasMore={hasMore}
          isLoading={isLoadingMore}
          hasFailed={loadFailed}
          loadedCount={cards.length}
          totalCount={totalCount}
          itemsPerPage={itemsPerPage}
          itemLabel="dives"
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  );
}
