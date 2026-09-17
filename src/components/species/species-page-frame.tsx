"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Fish, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { Input } from "@/components/ui/input";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkeletonHold } from "@/hooks/useSkeletonHold";

export interface SpeciesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  itemsPerPage: number;
  /** The life list's cards. Empty while the first page is in flight. */
  cards?: ReactNode[];
  /** What the search box holds. Empty on arrival, which is the fallback's case. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** True when the empty state is a filtered list rather than an empty life list. */
  isSearching?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const noop = () => {};

// A grid rather than the list pages' table, and more per page than their ten.
// These rows are photographs, so they tile where a table would leave most of
// each row empty, and a life list is a thing to look at rather than to scan a
// column of. Lives here so the page and its fallback draw the same number of
// placeholders without either one naming the figure.
export const SPECIES_PER_PAGE = 24;

// A card-shaped placeholder for one species, sized like the real one so the
// grid does not move when the page lands.
//
// The bars match `LifeListCard`'s four lines: the `h-36` photo band, the name,
// the italic binomial under it, and the two `text-xs` lines. `animate-skeleton-
// reveal` goes on the bordered box rather than only on the bars, because the
// border is a real one and would otherwise paint instantly - a grid of empty
// ruled boxes is the exact flash the delay exists to prevent.
function LifeListCardSkeleton() {
  const hold = useSkeletonHold();
  return (
    <div
      className="rounded-lg border bg-card overflow-hidden animate-skeleton-reveal motion-reduce:animate-none"
      style={hold}
      aria-hidden
    >
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="p-3 space-y-1">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-16 mt-2" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  );
}

// Everything /species draws before its cards exist, rendered by the page and by
// the route fallback alike so the two cannot describe the screen differently.
export function SpeciesPageFrame({
  isLoading,
  totalCount,
  itemsPerPage,
  cards = [],
  search = "",
  onSearchChange = noop,
  isSearching = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: SpeciesPageFrameProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Species</h1>
        <p className="text-muted-foreground mt-2">
          Everything you have logged seeing, and when you saw it
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span>Life List</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="species"
              plural="species"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="species-search" className="sr-only">
              Search your species by name
            </label>
            <Input
              id="species-search"
              type="search"
              className="pl-9"
              placeholder="Search by name..."
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          {!isLoading && cards.length === 0 ? (
            // A filtered list with nothing in it is a different statement from
            // an empty life list, so it keeps its one line: no icon, no
            // heading, and pointedly no "log your first dive", which would be
            // answering a question nobody asked.
            isSearching ? (
              <div className="text-center py-12 text-muted-foreground">
                No species match that name.
              </div>
            ) : (
              <EmptyState
                icon={Fish}
                title="No species yet"
                description="Record what you saw on a dive and it will appear here."
                action={
                  <Button asChild>
                    <Link href="/dives">
                      <Fish className="h-4 w-4 mr-2" />
                      Go to your dives
                    </Link>
                  </Button>
                }
              />
            )
          ) : (
            // Placeholders inside the real grid rather than a spinner in place
            // of it, and chosen by the card count inside the container the way
            // the list pages pick their skeleton rows - one layout, not three.
            // `itemsPerPage` rather than a fixed number: the page size is known
            // before the first response, so the grid can be drawn at the size it
            // is about to be.
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              // Busy on the outside, hidden on each placeholder within - the
              // split `ListRowsSkeleton` documents. Announcing two dozen empty
              // boxes tells a screen reader nothing.
              aria-busy={cards.length === 0 || undefined}
            >
              {cards.length === 0
                ? Array.from({ length: itemsPerPage }, (_, card) => (
                    <LifeListCardSkeleton key={card} />
                  ))
                : cards}
            </div>
          )}

          <LoadMoreTrigger
            hasMore={hasMore}
            isLoading={isLoadingMore}
            hasFailed={loadFailed}
            loadedCount={cards.length}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            itemLabel="species"
            onLoadMore={onLoadMore}
          />
        </CardContent>
      </Card>
    </div>
  );
}
