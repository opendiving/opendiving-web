"use client";

import { useCallback, useRef, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useTags } from "@/hooks/useTags";
import { divesAPI, Dive } from "@/lib/api/dives";
import { DELETE_DIVE_CONFIRMATION } from "@/lib/dive-recordings";
import { DiveCard } from "@/components/dives/dive-card";
import { DiveNumberingCard } from "@/components/dives/dive-numbering-card";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import {
  hasDiveFilters,
  NO_DIVE_FILTERS,
  type DiveListFilters,
} from "@/components/dives/dives-filters";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";

export function DivesPageContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // Bumped whenever the log changes, to re-describe its numbering: deleting a
  // dive leaves the number it held unused, which brings out the card above the
  // list to say so.
  const [numberingToken, setNumberingToken] = useState(0);
  const reloadNumbering = useCallback(
    () => setNumberingToken((n) => n + 1),
    [],
  );

  // Where focus goes when the numbering card removes itself from under it: the
  // card holds the button the renumber dialog just handed focus back to.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useCallback(() => headingRef.current?.focus(), []);

  // No debounce: each control commits a whole value at once.
  const [filters, setFilters] = useState<DiveListFilters>(NO_DIVE_FILTERS);
  // Latched by the filter panel's first open, since nothing before that needs
  // the diver's tags.
  const [wantsTags, setWantsTags] = useState(false);
  const { tags } = useTags(!!user && wantsTags);

  // Changing a filter changes this callback's identity, which is what makes
  // `useInfiniteResource` throw every loaded page away and read the new query
  // from the first - rows of one order are not rows of another.
  const fetchDives = useCallback(
    (page: number, perPage: number) =>
      divesAPI.getDives(page, perPage, filters),
    [filters],
  );

  const {
    items: dives,
    isLoading: isLoadingDives,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
  } = useInfiniteResource<Dive>(fetchDives, {
    enabled: !!user,
    isNarrowed: hasDiveFilters(filters),
    errorMessage: "Failed to load dives. Please try again.",
    keyOf: (dive) => dive.uuid,
  });

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete: requestDeleteDive,
    cancelDelete: cancelDeleteDive,
    confirmDelete: confirmDeleteDive,
  } = useDeleteResource(divesAPI.deleteDive, {
    confirmMessage: DELETE_DIVE_CONFIRMATION,
    successMessage: "Dive deleted successfully.",
    errorMessage: "Failed to delete dive. Please try again.",
    // The card goes locally rather than by re-reading: a diver who has scrolled
    // several pages in should not have the list collapse back to the first one
    // under them. The numbering above the list is re-read, because the number
    // the deleted dive held is now a gap and that card says so.
    onDeleted: (id) => {
      removeItem(id);
      reloadNumbering();
    },
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <>
      <DivesPageFrame
        isLoading={isLoadingDives}
        totalCount={totalCount}
        isCountNarrowed={isCountNarrowed}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        filters={filters}
        onFiltersChange={setFilters}
        onFiltersOpened={() => setWantsTags(true)}
        tags={tags ?? undefined}
        headingRef={headingRef}
        numbering={
          <DiveNumberingCard
            enabled={!!user}
            reloadToken={numberingToken}
            onRenumbered={reload}
            onVanished={focusHeading}
          />
        }
        cards={dives.map((dive) => (
          <DiveCard
            key={dive.uuid}
            dive={dive}
            onDelete={() => requestDeleteDive(dive.uuid)}
            isDeleting={deletingId === dive.uuid}
          />
        ))}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDeleteDive()}
        title="Delete dive"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDeleteDive}
      />
    </>
  );
}
