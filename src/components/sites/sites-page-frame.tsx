"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Search, X } from "lucide-react";
import { DiveSiteIcon } from "@/components/icons/dive-site-icon";
import { EmptyState } from "@/components/ui/empty-state";

import { Button } from "@/components/ui/button";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { BackdropCardSkeleton } from "@/components/ui/backdrop-card";
import { IconTooltip } from "@/components/ui/tooltip";
import { useEffectOnChange } from "@/hooks/useEffectOnChange";
import {
  NO_SITE_FILTERS,
  SitesFilters,
  siteFiltersChanged,
  type DiveSiteListFilters,
} from "@/components/sites/sites-filters";
import type { Tag } from "@/lib/api/tags";

export interface SitesPageFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the list. */
  isCountNarrowed?: boolean;
  itemsPerPage: number;
  /** One `DiveSiteCard` per site - list items, for the list this frame draws. */
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
  /** Opens the new-site dialog. */
  onNew?: () => void;
  /** The tag and the order the list is read in. */
  filters?: DiveSiteListFilters;
  onFiltersChange?: (filters: DiveSiteListFilters) => void;
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

// Everything /sites draws before its cards exist, kept apart from the data render so
// the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function SitesPageFrame({
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
  filters = NO_SITE_FILTERS,
  onFiltersChange = noop,
  onFiltersOpened = noop,
  tags,
}: SitesPageFrameProps) {
  const [isPanelOpen, setPanelOpen] = useState(false);
  const isFiltered = Boolean(filters.tagUuid);
  // Nothing to count and nothing to search. A term in flight and one still in the
  // box waiting for the debounce both count as narrowing, as a tag does, and
  // `useIsEmptyList` holds that reading across the commit where none is true yet
  // the cards are still the narrowed list's.
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: cards.length,
    isNarrowed: isSearching || search.length > 0 || isFiltered,
  });
  const searchRef = useRef<HTMLInputElement>(null);

  // The cursor goes in the box as the panel opens, for the course list's
  // reasons: in an effect, since the box has no layout until the panel's
  // `hidden` lifts, and only on a change, so a route revisited with the panel
  // open does not pull up a phone's keyboard unasked.
  useEffectOnChange(() => {
    if (isPanelOpen) searchRef.current?.focus();
  }, [isPanelOpen]);

  return (
    <div>
      <IndexHero
        title="Dive Sites"
        subtitle="Keep track of the dive sites you've visited"
        actions={
          <Button size="sm" onClick={onNew}>
            <Plus className="h-4 w-4 mr-2" />
            New dive site
          </Button>
        }
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title="Dive Site List" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="dive site"
              total
              isNarrowed={isCountNarrowed}
            />
            {/* The course list's panel, and for its reason: shutting it takes
                the search, the tag and the order with it, so a folded row never
                narrows or reorders the list unseen. */}
            <IconTooltip
              label={
                !isPanelOpen
                  ? "Search, filter and sort dive sites"
                  : search.length > 0 || siteFiltersChanged(filters)
                    ? "Close search and filters, clearing them"
                    : "Close search and filters"
              }
            >
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                aria-expanded={isPanelOpen}
                aria-controls="site-filters"
                onClick={() => {
                  if (isPanelOpen) {
                    onSearchChange("");
                    onFiltersChange(NO_SITE_FILTERS);
                  } else {
                    onFiltersOpened();
                  }
                  setPanelOpen((open) => !open);
                }}
              >
                <Search className="h-4 w-4" />
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
            <CardContent id="site-filters" hidden={!isPanelOpen}>
              <SitesFilters
                search={search}
                onSearchChange={onSearchChange}
                filters={filters}
                onFiltersChange={onFiltersChange}
                tags={tags}
                searchRef={searchRef}
              />
            </CardContent>
          )}
          {/* The card is the list's header - its count, its search and its
              filters - and what it says when there is nothing to list. The
              sites themselves are cards of their own, so they sit below it
              rather than in it. */}
          {!isLoading && cards.length === 0 && (
            <CardContent>
              {/* A narrowed list with nothing in it is a different statement
                  from an empty one, so it keeps its one line: no icon, no
                  heading, and pointedly no "add your first dive site", which
                  would be answering a question nobody asked. */}
              {isSearching || isFiltered ? (
                <div className="text-center py-12 text-muted-foreground">
                  {isFiltered
                    ? "No dive sites match those filters."
                    : "No dive sites match that name or location."}
                </div>
              ) : (
                <EmptyState
                  icon={DiveSiteIcon}
                  title="No dive sites yet"
                  description="Add your first dive site to start tracking your favorite spots!"
                  action={
                    <Button onClick={onNew}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add your first dive site
                    </Button>
                  }
                />
              )}
            </CardContent>
          )}
        </Card>

        {(isLoading || cards.length > 0) && (
          // One site to a row below `lg`, two above, as /trips and /dives: a
          // card may hold a map, and a browser keeps only so many of those per
          // page - see `BackdropCard`.
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
          itemLabel="dive sites"
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  );
}
