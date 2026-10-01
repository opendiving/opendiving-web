"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useTags } from "@/hooks/useTags";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import {
  NO_SITE_FILTERS,
  type DiveSiteListFilters,
} from "@/components/sites/sites-filters";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { DiveSiteCard } from "@/components/sites/dive-site-card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";

// How long to wait after the last keystroke before asking the server, matching
// the courses list and the pickers: long enough that typing a site name is one
// request rather than ten, short enough not to feel laggy.
const SEARCH_DEBOUNCE_MS = 250;

export function SitesPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingSite, setEditingSite] = useState<DiveSite | null>(null);

  // What the box holds, and what has actually been asked for. Splitting them is
  // what keeps the debounce off the input's own responsiveness.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DiveSiteListFilters>(NO_SITE_FILTERS);
  // The tags are read the first time the filter panel opens, not on arrival.
  const [wantsTags, setWantsTags] = useState(false);
  const { tags } = useTags(!!user && wantsTags);

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // One term against the name, the other names and the location, which is the
  // same query the dive form's site picker runs, narrowed by the tag and put in
  // the panel's order.
  const fetchDiveSites = useCallback(
    (page: number, perPage: number) =>
      diveSitesAPI.getDiveSites(page, perPage, {
        search: search || undefined,
        tagUuid: filters.tagUuid || undefined,
        sort: filters.sort,
      }),
    [search, filters],
  );

  // Changing the search term, the tag or the order changes this callback's
  // identity, which is what makes `useInfiniteResource` throw away every page it
  // has loaded and read the new query from the first - rows of one query are not
  // rows of another, however many of them are already on screen.
  const {
    items: diveSites,
    isLoading: isLoadingDiveSites,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
    applySaved,
  } = useInfiniteResource<DiveSite>(fetchDiveSites, {
    keyOf: (site) => site.uuid,
    enabled: !!user,
    isNarrowed: search.length > 0 || Boolean(filters.tagUuid),
    errorMessage: "Failed to load dive sites. Please try again.",
  });

  const {
    deletingId,
    pendingId,
    requestDelete: requestDeleteDiveSite,
    cancelDelete: cancelDeleteDiveSite,
    confirmDelete: confirmDeleteDiveSite,
  } = useDeleteResource(diveSitesAPI.deleteDiveSite, {
    successMessage: DELETED_MESSAGE,
    errorMessage: "Failed to delete dive site. Please try again.",
    // The card goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them. Unless its dives moved to
    // another site, whose card then counts them - that is a delete that
    // changes another card, and only a re-read shows it.
    onDeleted: (id, movedDivesTo) => (movedDivesTo ? reload() : removeItem(id)),
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <>
      <SitesPageFrame
        isLoading={isLoadingDiveSites}
        totalCount={totalCount}
        isCountNarrowed={isCountNarrowed}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        search={searchInput}
        onSearchChange={setSearchInput}
        isSearching={search.length > 0}
        onNew={() => openCreate("site")}
        filters={filters}
        onFiltersChange={setFilters}
        onFiltersOpened={() => setWantsTags(true)}
        tags={tags ?? undefined}
        cards={diveSites.map((diveSite) => (
          <DiveSiteCard
            key={diveSite.uuid}
            site={diveSite}
            onEdit={() => setEditingSite(diveSite)}
            onDelete={() => requestDeleteDiveSite(diveSite.uuid)}
            isDeleting={deletingId === diveSite.uuid}
          />
        ))}
      />

      <DiveSiteDialog
        open={editingSite !== null}
        onOpenChange={(open) => !open && setEditingSite(null)}
        diveSite={editingSite}
        onSaved={applySaved}
      />

      <DeleteWithReassignDialog
        kind="dive-site"
        targetId={pendingId}
        isDeleting={deletingId === pendingId}
        onCancel={cancelDeleteDiveSite}
        onConfirm={(moveDivesTo, name) =>
          confirmDeleteDiveSite(
            moveDivesTo,
            name ? `${DELETED_MESSAGE} Its dives moved to ${name}.` : undefined,
          )
        }
      />
    </>
  );
}
