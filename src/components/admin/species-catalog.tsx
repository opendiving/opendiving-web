"use client";

import { useCallback, useEffect, useState } from "react";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import {
  adminAPI,
  type AdminSpecies,
  type AdminSpeciesFilter,
} from "@/lib/api/admin";
import { getApiErrorMessage } from "@/lib/api/error";
import { speciesDisplayName } from "@/lib/species";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import {
  SPECIES_CATALOG_PER_PAGE,
  SpeciesCatalogFrame,
} from "@/components/admin/species-catalog-frame";
import {
  SpeciesCatalogCard,
  type SpeciesPhotoAction,
} from "@/components/admin/species-catalog-card";
import { SpeciesPhotoPicker } from "@/components/admin/species-photo-picker";

const SEARCH_DEBOUNCE_MS = 250;

// The API's 503 for pin and re-fetch, worded for either cause it covers - a
// register that did not answer and bytes that would not decode - and used even
// when a gateway's 503 carries no body.
const PHOTO_UNAVAILABLE = "The photo could not be fetched; nothing changed.";

function photoErrorMessage(error: unknown, fallback: string): string {
  if ((error as { response?: { status?: number } })?.response?.status === 503) {
    return PHOTO_UNAVAILABLE;
  }
  return getApiErrorMessage(error, fallback);
}

type Confirming = { species: AdminSpecies; action: "hide" | "refetch" };

/**
 * The species catalog: every species on this instance, newest first, and the
 * operator's three hands on each one's photo.
 *
 * Every action answers with the row as it now stands, which `applySaved` puts in
 * place without reading the list again - so a hidden row stays under a chip it
 * no longer matches until the list is reloaded, which is the scroll position
 * worth keeping.
 */
export function SpeciesCatalog() {
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AdminSpeciesFilter | null>(null);
  const [busy, setBusy] = useState<{
    uuid: string;
    action: SpeciesPhotoAction;
  } | null>(null);
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [replacing, setReplacing] = useState<AdminSpecies | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A new term or chip is a new callback, which is what makes the hook drop the
  // pages it holds and start again from the first.
  const fetchSpecies = useCallback(
    (page: number, perPage: number) =>
      adminAPI.listSpecies(page, perPage, {
        search: search || undefined,
        filter: filter ?? undefined,
      }),
    [search, filter],
  );

  const {
    items: species,
    isLoading,
    isLoadingMore,
    totalCount,
    isCountNarrowed,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    applySaved,
  } = useInfiniteResource<AdminSpecies>(fetchSpecies, {
    keyOf: (row) => row.uuid,
    isNarrowed: search.length > 0 || filter !== null,
    itemsPerPage: SPECIES_CATALOG_PER_PAGE,
    errorMessage: "Failed to load the species catalog. Please try again.",
  });

  const run = async (
    row: AdminSpecies,
    action: SpeciesPhotoAction,
    request: () => Promise<AdminSpecies>,
    done: string,
  ): Promise<boolean> => {
    setBusy({ uuid: row.uuid, action });
    try {
      applySaved(await request());
      toast({ title: "Photo updated", description: done });
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: photoErrorMessage(
          error,
          "Failed to change the photo. Please try again.",
        ),
        variant: "destructive",
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const hide = (row: AdminSpecies) =>
    run(
      row,
      "hide",
      () => adminAPI.hideSpeciesPhoto(row.uuid),
      `${speciesDisplayName(row)} shows no photo.`,
    );

  const refetch = (row: AdminSpecies) =>
    run(
      row,
      "refetch",
      () => adminAPI.refetchSpeciesPhoto(row.uuid),
      `${speciesDisplayName(row)} shows what the rule chooses.`,
    );

  const pin = (row: AdminSpecies, file: string) =>
    run(
      row,
      "replace",
      () => adminAPI.pinSpeciesPhoto(row.uuid, file),
      `${speciesDisplayName(row)} is pinned to ${file}.`,
    );

  const onAction = (row: AdminSpecies, action: SpeciesPhotoAction) => {
    if (action === "replace") setReplacing(row);
    else if (action === "hide") setConfirming({ species: row, action });
    // A re-fetch hands a curated row back to the rule, which may leave it with no
    // photo at all - as much an undo of a pin as Hide is, so it asks first.
    else if (row.photo_curation) setConfirming({ species: row, action });
    else refetch(row);
  };

  const confirmed = async () => {
    if (!confirming) return;
    const { species: row, action } = confirming;
    setConfirming(null);
    if (action === "hide") await hide(row);
    else await refetch(row);
  };

  const name = confirming ? speciesDisplayName(confirming.species) : "";
  const dropped =
    confirming?.species.photo_curation === "hidden" ? "hide" : "pin";

  return (
    <>
      <SpeciesCatalogFrame
        isLoading={isLoading}
        totalCount={totalCount}
        isCountNarrowed={isCountNarrowed}
        itemsPerPage={itemsPerPage}
        search={searchInput}
        onSearchChange={setSearchInput}
        filter={filter}
        onFilterChange={setFilter}
        isNarrowed={search.length > 0 || filter !== null}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        cards={species.map((row) => (
          <SpeciesCatalogCard
            key={row.uuid}
            species={row}
            busy={busy?.uuid === row.uuid ? busy.action : null}
            onAction={onAction}
          />
        ))}
      />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming?.action === "hide" ? "Hide the photo" : "Re-fetch"}
        description={
          confirming?.action === "hide"
            ? `${name} will show no photo, and the backfill will not give it one. A re-fetch or a pin undoes this.`
            : `The ${dropped} on ${name} is dropped and the selection rule chooses again. The rule may find no photo, and then ${name} shows none.`
        }
        confirmText={confirming?.action === "hide" ? "Hide" : "Re-fetch"}
        onConfirm={confirmed}
      />

      <SpeciesPhotoPicker
        species={replacing}
        onClose={() => setReplacing(null)}
        onPin={pin}
      />
    </>
  );
}
