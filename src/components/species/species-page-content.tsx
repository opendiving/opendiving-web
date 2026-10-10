"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { speciesAPI, SpeciesLifeListEntry } from "@/lib/api/species";
import { speciesSeenOn } from "@/lib/species";
import { PageSpinner } from "@/components/ui/page-spinner";
import {
  SPECIES_PER_PAGE,
  SpeciesPageFrame,
} from "@/components/species/species-page-frame";
import { SpeciesCard } from "@/components/species/species-card";

// Matches the courses list and the pickers: long enough that typing a name is
// one request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The life list: every species this diver has ever logged.
 *
 * Reached from the main nav and from Home's Species Seen tile.
 *
 * The empty state is announced rather than hidden: every other list in the app
 * says when it is empty, and a menu entry that appears unbidden after a first
 * sighting is a worse surprise than a page that explains itself. It has two
 * arms, as the courses list does - "you have logged none yet" carries an action,
 * "your search matched nothing" deliberately does not, because offering to log a
 * dive answers a question nobody asked.
 */
export function SpeciesPageContent() {
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
      speciesAPI.getLifeList(page, perPage, {
        search: search || undefined,
      }),
    [search],
  );

  // Changing the search term changes this callback's identity, which is what
  // makes `useInfiniteResource` throw away every page it has loaded and read the
  // new query from the first - rows of the unfiltered list are not rows of the
  // filtered one, however many of them are already on screen.
  const {
    items: species,
    isLoading: isLoadingSpecies,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
  } = useInfiniteResource<SpeciesLifeListEntry>(fetchSpecies, {
    keyOf: (entry) => entry.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0,
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
    <SpeciesPageFrame
      isLoading={isLoadingSpecies}
      totalCount={totalCount}
      isCountNarrowed={isCountNarrowed}
      itemsPerPage={itemsPerPage}
      search={searchInput}
      onSearchChange={setSearchInput}
      isSearching={isSearching}
      isLoadingMore={isLoadingMore}
      loadFailed={loadFailed}
      hasMore={hasMore}
      onLoadMore={loadMore}
      cards={species.map((entry) => (
        <SpeciesCard
          key={entry.uuid}
          species={entry}
          figures={[
            { label: "Dives", value: entry.dive_count },
            { label: "Dive sites", value: entry.dive_site_count },
            { label: "Last seen", value: speciesSeenOn(entry.last_seen) },
          ]}
        />
      ))}
    />
  );
}
