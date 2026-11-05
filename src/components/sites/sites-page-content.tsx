"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDebouncedSearch } from "@/hooks/useDebouncedSearch";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { useTags } from "@/hooks/useTags";
import { diveSitesAPI, DiveSite, isCommonsSite } from "@/lib/api/dive-sites";
import {
  NO_SITE_FILTERS,
  type DiveSiteListFilters,
} from "@/components/sites/sites-filters";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { DiveSiteCard } from "@/components/sites/dive-site-card";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { CommonsSiteDialog } from "@/components/sites/commons-site-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { useQuickCreate } from "@/components/layout/quick-create";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";
const REMOVED_MESSAGE = "Removed from your sites.";

// How many of the diver's own sites are also Commons records, on every instance: the
// old catalogue left such copies wherever it was used. The one row asked for is what
// the count comes with.
function useCommonsMatchCount(enabled: boolean, refreshOn: number): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    diveSitesAPI
      .getDiveSites(1, 1, { commonsMatch: true })
      .then(({ total_count }) => {
        if (active) setCount(total_count);
      })
      .catch((error: unknown) => {
        console.error("Couldn't count the sites in the Commons.", error);
      });
    return () => {
      active = false;
    };
  }, [enabled, refreshOn]);
  return count;
}

function CommonsMatchNotice({
  count,
  isListing,
  onToggle,
}: {
  count: number;
  isListing: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3 text-sm max-sm:mb-2.5">
      <p className="min-w-0 flex-1">
        {count === 1
          ? "1 of your sites is in OpenDiving Commons, and can be replaced with the Commons site."
          : `${count} of your sites are in OpenDiving Commons, and can be replaced with the Commons sites.`}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onToggle}>
        {isListing ? "Show all sites" : count === 1 ? "Show it" : "Show them"}
      </Button>
    </div>
  );
}

export function SitesPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const openCreate = useQuickCreate();
  const [editingSite, setEditingSite] = useState<DiveSite | null>(null);

  const {
    input: searchInput,
    setInput: setSearchInput,
    term: search,
  } = useDebouncedSearch();
  const [filters, setFilters] = useState<DiveSiteListFilters>(NO_SITE_FILTERS);
  // The tags are read the first time the filter panel opens, not on arrival.
  const [wantsTags, setWantsTags] = useState(false);
  const { tags } = useTags(!!user && wantsTags);

  const { config } = useInstanceConfig();
  const [deletions, setDeletions] = useState(0);
  const matchCount = useCommonsMatchCount(!!user, deletions);
  const [wantsMatches, setWantsMatches] = useState(false);
  const listingMatches = wantsMatches && matchCount > 0;

  // One term against the name, the other names and the location, which is the
  // same query the dive form's site picker runs, narrowed by the tag and put in
  // the panel's order.
  const fetchDiveSites = useCallback(
    (page: number, perPage: number) =>
      diveSitesAPI.getDiveSites(page, perPage, {
        search: search || undefined,
        tagUuid: filters.tagUuid || undefined,
        sort: filters.sort,
        commonsMatch: listingMatches,
      }),
    [search, filters, listingMatches],
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
    isNarrowed: search.length > 0 || Boolean(filters.tagUuid) || listingMatches,
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
    onDeleted: (id, movedDivesTo) => {
      setDeletions((count) => count + 1);
      if (movedDivesTo) reload();
      else removeItem(id);
    },
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  const editingCommons = !!editingSite && isCommonsSite(editingSite);
  const pendingSite = diveSites.find((site) => site.uuid === pendingId);
  const removingCommons = !!pendingSite && isCommonsSite(pendingSite);
  const removedMessage = removingCommons ? REMOVED_MESSAGE : DELETED_MESSAGE;
  const closeEditing = (open: boolean) => !open && setEditingSite(null);

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
        actions={
          config?.commons_primary === true && (
            <ButtonLink variant="ghost" size="sm" href="/sites/proposals">
              Your proposals
            </ButtonLink>
          )
        }
        notice={
          matchCount > 0 && (
            <CommonsMatchNotice
              count={matchCount}
              isListing={listingMatches}
              onToggle={() => setWantsMatches(!listingMatches)}
            />
          )
        }
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
        open={editingSite !== null && !editingCommons}
        onOpenChange={closeEditing}
        diveSite={editingSite}
        onSaved={applySaved}
      />

      <CommonsSiteDialog
        open={editingCommons}
        onOpenChange={closeEditing}
        site={editingSite}
        onSaved={applySaved}
      />

      <DeleteWithReassignDialog
        kind={removingCommons ? "saved-commons-site" : "dive-site"}
        targetId={pendingId}
        isDeleting={deletingId === pendingId}
        onCancel={cancelDeleteDiveSite}
        onConfirm={(moveDivesTo, name) =>
          confirmDeleteDiveSite(
            moveDivesTo,
            name
              ? `${removedMessage} Its dives moved to ${name}.`
              : removedMessage,
          )
        }
      />
    </>
  );
}
