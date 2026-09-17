"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { speciesAPI, SpeciesLifeListEntry } from "@/lib/api/species";
import {
  speciesDisplayName,
  speciesNameWithRank,
  speciesSeenRange,
} from "@/lib/species";
import { PageSpinner } from "@/components/ui/page-spinner";
import {
  SPECIES_PER_PAGE,
  SpeciesPageFrame,
} from "@/components/species/species-page-frame";
import { SpeciesThumbnail } from "@/components/species/species-thumbnail";

// Matches the courses list and the pickers: long enough that typing a name is
// one request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

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
  // makes `useInfiniteResource` throw away every page it has loaded and read the
  // new query from the first - rows of the unfiltered list are not rows of the
  // filtered one, however many of them are already on screen.
  const {
    items: species,
    isLoading: isLoadingSpecies,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
  } = useInfiniteResource<SpeciesLifeListEntry>(fetchSpecies, {
    keyOf: (entry) => entry.uuid,
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
    <SpeciesPageFrame
      isLoading={isLoadingSpecies}
      totalCount={totalCount}
      itemsPerPage={itemsPerPage}
      search={searchInput}
      onSearchChange={setSearchInput}
      isSearching={isSearching}
      isLoadingMore={isLoadingMore}
      loadFailed={loadFailed}
      hasMore={hasMore}
      onLoadMore={loadMore}
      cards={species.map((entry) => (
        <LifeListCard key={entry.uuid} entry={entry} />
      ))}
    />
  );
}
