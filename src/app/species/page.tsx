"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Fish, Search } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { speciesAPI, SpeciesLifeListEntry } from "@/lib/api/species";
import {
  speciesDisplayName,
  speciesNameWithRank,
  speciesSeenRange,
} from "@/lib/species";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/components/ui/count-badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { PageSpinner } from "@/components/ui/page-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";

// Matches the courses list and the pickers: long enough that typing a name is
// one request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

// A grid rather than the list pages' table, and more per page than their ten.
// These rows are photographs, so they tile where a table would leave most of
// each row empty, and a life list is a thing to look at rather than to scan a
// column of.
const SPECIES_PER_PAGE = 24;

// One species the diver has logged, as a card leading to its own page.
//
// The whole card is the link, and the photo inside it is decorative - the names
// under it are what the link is called, so a screen reader announces the species
// once rather than twice.
function LifeListCard({ entry }: { entry: SpeciesLifeListEntry }) {
  const secondary = speciesNameWithRank(entry);
  const displayName = speciesDisplayName(entry);
  const range = speciesSeenRange(entry.first_seen, entry.last_seen);

  return (
    <Link
      href={`/species/${entry.uuid}`}
      className="group rounded-lg border bg-card overflow-hidden transition-colors hover:border-coral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* A fixed-height band whether or not there is a photo, so the cards line
          up in their rows. A species with none shows a muted panel with its name
          below, which reads as deliberate rather than as an image that failed. */}
      <SpeciesThumbnail
        uuid={entry.uuid}
        photoSha256={entry.photo_sha256}
        className="h-36 w-full rounded-none bg-muted"
      />
      <div className="p-3 space-y-1">
        <div className="font-medium leading-tight group-hover:underline">
          {displayName}
        </div>
        {/* Only when it would say something the line above doesn't - for the
            many species with no English name the two are the same string. */}
        {secondary !== displayName && (
          <div className="text-sm italic text-muted-foreground leading-tight">
            {secondary}
          </div>
        )}
        <div className="text-xs text-muted-foreground pt-1">
          {entry.dive_count} {entry.dive_count === 1 ? "dive" : "dives"}
        </div>
        <div className="text-xs text-muted-foreground">{range}</div>
      </div>
    </Link>
  );
}

// A card-shaped placeholder for one species, sized like the real one so the
// grid does not move when the page lands.
//
// The bars match `LifeListCard`'s four lines: the `h-36` photo band, the name,
// the italic binomial under it, and the two `text-xs` lines. `animate-skeleton-
// reveal` goes on the bordered box rather than only on the bars, because the
// border is a real one and would otherwise paint instantly - a grid of empty
// ruled boxes is the exact flash the 150ms delay exists to prevent.
function LifeListCardSkeleton() {
  return (
    <div
      className="rounded-lg border bg-card overflow-hidden animate-skeleton-reveal motion-reduce:animate-none"
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

/**
 * The life list: every species this diver has ever logged.
 *
 * Reached from the account menu and from the dashboard's Species Seen tile,
 * rather than from the main nav - a look-at-my-collection page is not one of the
 * five destinations a diver goes to on every visit, which is the same reason
 * certifications and courses sit there.
 *
 * The empty state is announced rather than hidden: every other list in the app
 * says when it is empty, and a menu entry that appears unbidden after a first
 * sighting is a worse surprise than a page that explains itself. It has two
 * arms, as the courses list does - "you have logged none yet" carries an action,
 * "your search matched nothing" deliberately does not, because offering to log a
 * dive answers a question nobody asked.
 */
export default function SpeciesPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // What the box holds, and what has actually been asked for. Splitting them is
  // what keeps the debounce off the input's own responsiveness.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchSpecies = useCallback(
    (page: number, perPage: number) =>
      speciesAPI.getLifeList(page, perPage, search || undefined),
    [search],
  );

  // Changing the search term changes this callback's identity, which is what
  // sends `usePaginatedResource` back to page 1 for the new query - a page 3 of
  // the unfiltered list is not a page of the filtered one.
  const {
    items: species,
    isLoading: isLoadingSpecies,
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage,
  } = usePaginatedResource<SpeciesLifeListEntry>(fetchSpecies, {
    enabled: !!user,
    itemsPerPage: SPECIES_PER_PAGE,
    errorMessage: "Failed to load your species. Please try again.",
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const isSearching = search.length > 0;

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
              isLoading={isLoadingSpecies}
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
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>

          {!isLoadingSpecies && species.length === 0 ? (
            <div className="text-center py-12">
              {isSearching ? (
                // A filtered list with nothing in it is a different statement
                // from an empty life list, and offering "log your first dive"
                // here would be answering a question nobody asked.
                <div className="text-muted-foreground">
                  No species match that name.
                </div>
              ) : (
                <>
                  <div className="text-muted-foreground mb-4">
                    No species yet. Record what you saw on a dive and it will
                    appear here.
                  </div>
                  <Button asChild>
                    <Link href="/dives">
                      <Fish className="h-4 w-4 mr-2" />
                      Go to Your Dives
                    </Link>
                  </Button>
                </>
              )}
            </div>
          ) : (
            // Placeholders inside the real grid rather than a spinner in place
            // of it, and chosen by `species.length === 0` inside the container
            // the way the list pages pick their skeleton rows - one layout, not
            // three. `itemsPerPage` rather than a fixed number: the page size is
            // known before the first response, so the grid can be drawn at the
            // size it is about to be.
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              // Busy on the outside, hidden on each placeholder within - the
              // split `ListRowsSkeleton` documents. Announcing two dozen empty
              // boxes tells a screen reader nothing.
              aria-busy={species.length === 0 || undefined}
            >
              {species.length === 0
                ? Array.from({ length: itemsPerPage }, (_, card) => (
                    <LifeListCardSkeleton key={card} />
                  ))
                : species.map((entry) => (
                    <LifeListCard key={entry.uuid} entry={entry} />
                  ))}
            </div>
          )}

          <PaginationFooter
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoading={isLoadingSpecies}
            itemLabel="species"
            onPageChange={fetchPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
