"use client";

import { type ReactNode } from "react";
import { Fish } from "lucide-react";
import type { AdminSpeciesFilter } from "@/lib/api/admin";

import { Card, CardContent } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/count-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ListCardHeader,
  useIsEmptyList,
} from "@/components/ui/list-card-header";
import { ListSearch } from "@/components/ui/list-search";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { Skeleton } from "@/components/ui/skeleton";
import { HERO_BODY, IndexHero } from "@/components/ui/map-hero";
import { cn } from "@/lib/utils";

// Fills two, three and four grid columns evenly.
export const SPECIES_CATALOG_PER_PAGE = 24;

export const SPECIES_FILTERS: { value: AdminSpeciesFilter; label: string }[] = [
  { value: "with_photo", label: "With photo" },
  { value: "without_photo", label: "Without photo" },
  { value: "hidden", label: "Hidden" },
  { value: "pinned", label: "Pinned" },
  { value: "narrow", label: "Below 500 px" },
];

export interface SpeciesCatalogFrameProps {
  isLoading: boolean;
  totalCount: number;
  /** Whether the query that answered `totalCount` narrowed the catalog. */
  isCountNarrowed?: boolean;
  itemsPerPage?: number;
  /** The catalog's cards. Empty while the first page is in flight. */
  cards?: ReactNode[];
  /** What the search box holds. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** The chip that is on, or null for the whole catalog. */
  filter?: AdminSpeciesFilter | null;
  onFilterChange?: (filter: AdminSpeciesFilter | null) => void;
  /** True when a search term or a chip has been asked for. */
  isNarrowed?: boolean;
  isLoadingMore?: boolean;
  loadFailed?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

const noop = () => {};

function CatalogCardSkeleton() {
  return (
    <div
      className="rounded-lg border bg-card overflow-hidden animate-skeleton-reveal motion-reduce:animate-none"
      aria-hidden
    >
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="p-3 space-y-1">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-28 mt-2" />
      </div>
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        pressed
          ? "border-transparent bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// Everything /admin/species draws before the catalog exists, kept apart from the data
// render so the page's first render is this frame. Every data-varying prop is optional,
// and the defaults are that first render.
export function SpeciesCatalogFrame({
  isLoading,
  totalCount,
  isCountNarrowed = false,
  itemsPerPage = SPECIES_CATALOG_PER_PAGE,
  cards = [],
  search = "",
  onSearchChange = noop,
  filter = null,
  onFilterChange = noop,
  isNarrowed = false,
  isLoadingMore = false,
  loadFailed = false,
  hasMore = false,
  onLoadMore = noop,
}: SpeciesCatalogFrameProps) {
  const isEmptyList = useIsEmptyList({
    isLoading,
    count: cards.length,
    isNarrowed: isNarrowed || search.length > 0 || filter !== null,
  });

  return (
    <div>
      <IndexHero
        title="Species"
        subtitle="Every species in this instance's catalog, and the photo each one shows."
      />

      <div className={HERO_BODY}>
        <Card>
          <ListCardHeader title="Catalog" isEmpty={isEmptyList}>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="species"
              plural="species"
              isNarrowed={isCountNarrowed}
            />
            <ListSearch
              id="admin-species-search"
              label="Search the catalog by name"
              toggleLabel="Search the catalog"
              placeholder="Search by name..."
              value={search}
              onChange={onSearchChange}
            />
          </ListCardHeader>
          <CardContent>
            {!isEmptyList && (
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label="Show"
              >
                <Chip
                  pressed={filter === null}
                  onClick={() => onFilterChange(null)}
                >
                  All
                </Chip>
                {SPECIES_FILTERS.map(({ value, label }) => (
                  <Chip
                    key={value}
                    pressed={filter === value}
                    onClick={() => onFilterChange(value)}
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            )}

            {!isLoading && cards.length === 0 ? (
              isEmptyList ? (
                <EmptyState
                  icon={Fish}
                  title="No species yet"
                  description="A species joins the catalog the first time anyone on this instance records it."
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No species match.
                </div>
              )
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
                aria-busy={cards.length === 0 || undefined}
              >
                {cards.length === 0
                  ? Array.from({ length: itemsPerPage }, (_, card) => (
                      <CatalogCardSkeleton key={card} />
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
    </div>
  );
}
