"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { Fish } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { ListSearch } from "@/components/ui/list-search";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { SpeciesCardSkeleton } from "@/components/species/species-card";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";

export interface SpeciesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  /** The life list's cards. Empty while the first page is in flight. */
  cards?: ReactNode[];
  /** What the search box holds. Empty on arrival. */
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
// column of. Lives here so the page reads the figure from the frame it renders
// rather than repeating it.
export const SPECIES_PER_PAGE = 24;

// Everything /species draws before its cards exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function SpeciesPageFrame({
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
}: SpeciesPageFrameProps) {
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
        title="Marine Life"
        description="Everything you have logged seeing, and when you saw it"
      />

      <div className={HERO_BODY}>
        <Card>
          {/* The count and the box that changes it, on one line, as every other
              list card draws them - and under `sm`, where they do not both fit,
              the count and the button the box folds behind. */}
          <ListCardHeader title="Life List" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="species"
              plural="species"
              isNarrowed={isCountNarrowed}
            />
            <ListSearch
              id="species-search"
              label="Search your species by name"
              toggleLabel="Search your species"
              placeholder="Search by name..."
              value={search}
              onChange={onSearchChange}
            />
          </ListCardHeader>
          <CardContent>
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
              <ul
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 max-sm:gap-2.5"
                // Busy on the outside, hidden on each placeholder within - the
                // split `ListRowsSkeleton` documents. Announcing two dozen empty
                // boxes tells a screen reader nothing.
                aria-busy={cards.length === 0 || undefined}
              >
                {cards.length === 0
                  ? Array.from({ length: itemsPerPage }, (_, card) => (
                      <SpeciesCardSkeleton key={card} />
                    ))
                  : cards}
              </ul>
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
    </div>
  );
}
