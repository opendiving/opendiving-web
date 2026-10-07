"use client";

import { type ReactNode } from "react";
import { Luggage, Plus } from "lucide-react";
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
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";

export interface TripsPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  /** One `TripCard` per trip - list items, for the list this frame draws. */
  cards?: ReactNode[];
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

// Everything /trips draws before its cards exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function TripsPageFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
  itemsPerPage,
  cards = [],
  search = "",
  onSearchChange = noop,
  isSearching = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
  onNew = noop,
}: TripsPageFrameProps) {
  // Nothing to count and nothing to search. A term in flight and one still in the
  // box waiting for the debounce both count as narrowing, and `useIsEmptyList`
  // holds that reading across the commit where neither is true yet the cards are
  // still the search's.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: cards.length,
    isNarrowed: isSearching || search.length > 0,
  });

  return (
    <div>
      <IndexHero
        title="Trips"
        subtitle="Group your dives into trips and liveaboards"
        actions={
          <Button variant="ghost" size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New trip
          </Button>
        }
      />

      <div className={HERO_BODY}>
        <Card>
          {/* The count and the box that changes it, on one line - and under
              `sm`, where they do not both fit, the count and the button the box
              folds behind. */}
          <ListCardHeader title="Trip List" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="trip"
              total
              isNarrowed={isCountNarrowed}
            />
            <ListSearch
              id="trip-search"
              label="Search trips by name or location"
              toggleLabel="Search trips"
              placeholder="Search by name or location..."
              value={search}
              onChange={onSearchChange}
            />
          </ListCardHeader>
          {/* The card is the list's header - its count and its search - and
              what it says when there is nothing to list. The trips themselves
              are cards of their own, so they sit below it rather than in it. */}
          {!isLoading && cards.length === 0 && (
            <CardContent>
              {/* A searched list with nothing in it is a different statement
                  from an empty one, so it keeps its one line: no icon, no
                  heading, and pointedly no "add your first trip", which would
                  be answering a question nobody asked. */}
              {isSearching ? (
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
              )}
            </CardContent>
          )}
        </Card>

        {(isLoading || cards.length > 0) && (
          // One trip to a row below `lg`, two above: every card on screen holds
          // a map, and a browser keeps only so many of those per page - see
          // `BackdropCard`.
          <ul
            className="mt-6 grid gap-4 lg:grid-cols-2"
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
          itemLabel="trips"
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  );
}
