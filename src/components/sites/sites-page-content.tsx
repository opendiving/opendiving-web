"use client";

import { useEffect, useRef, useState } from "react";
import { Edit } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { useInstanceConfig } from "@/hooks/useInstanceConfig";
import { useSitesFinderOpening } from "@/hooks/useSitesFinderOpening";
import { useTags } from "@/hooks/useTags";
import {
  diveSitesAPI,
  isCommonsSite,
  type DiveSite,
  type DiveSiteSearchItem,
} from "@/lib/api/dive-sites";
import { getApiErrorMessage } from "@/lib/api/error";
import type { LatLon } from "@/lib/basemap";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import {
  NO_FINDER_FILTERS,
  SiteFinder,
  type SiteFinderFilters,
  type SiteFinderHandle,
} from "@/components/sites/finder/site-finder";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { CommonsSiteDialog } from "@/components/sites/commons-site-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { SiteProposalFlow } from "@/components/sites/site-proposal-flow";
import { useQuickCreate } from "@/components/layout/quick-create";
import { Button, ButtonLink } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  DeleteMenuItem,
  ItemActionsMenu,
} from "@/components/ui/item-actions-menu";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useToast } from "@/components/ui/use-toast";

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
  const { toast } = useToast();
  const finder = useRef<SiteFinderHandle>(null);
  const opening = useSitesFinderOpening(!!user);

  const [filters, setFilters] = useState<SiteFinderFilters>(NO_FINDER_FILTERS);
  // The tags are read the first time the filter panel opens, not on arrival.
  const [wantsTags, setWantsTags] = useState(false);
  const { tags } = useTags(!!user && wantsTags);

  const { config } = useInstanceConfig();
  const [deletions, setDeletions] = useState(0);
  const matchCount = useCommonsMatchCount(!!user, deletions);
  const listingMatches =
    filters.yours && filters.commonsMatch && matchCount > 0;

  const [editingSite, setEditingSite] = useState<DiveSite | null>(null);
  const [proposing, setProposing] = useState<DiveSite | null>(null);
  // The pin a new site opens with, from the map; `undefined` while no form is open.
  const [adding, setAdding] = useState<LatLon | null | undefined>();
  // The row whose delete waits on the dialog, for which of the two deletes it is.
  const [deleting, setDeleting] = useState<DiveSiteSearchItem | null>(null);

  const { deletingId, pendingId, requestDelete, cancelDelete, confirmDelete } =
    useDeleteResource(diveSitesAPI.deleteDiveSite, {
      successMessage: DELETED_MESSAGE,
      errorMessage: "Failed to delete dive site. Please try again.",
      // The row goes where it is, unless its dives moved to another site, whose
      // row then counts them - a delete that changes another row.
      onDeleted: (id, movedDivesTo) => {
        setDeletions((count) => count + 1);
        if (movedDivesTo) finder.current?.reload();
        else finder.current?.removeSite(id);
      },
    });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  // A row is what a list shows; the dialogs edit the whole record, read here.
  const edit = async (uuid: string) => {
    try {
      setEditingSite(await diveSitesAPI.getDiveSite(uuid));
    } catch (error) {
      toast({
        title: "Error",
        description: getApiErrorMessage(
          error,
          "Failed to open that dive site. Please try again.",
        ),
        variant: "destructive",
      });
    }
  };

  const saved = (site: DiveSite, proposes: boolean) => {
    finder.current?.reload();
    if (proposes) setProposing(site);
  };

  const editingCommons = !!editingSite && isCommonsSite(editingSite);
  const removingCommons = !!deleting && isCommonsSite(deleting);
  const removedMessage = removingCommons ? REMOVED_MESSAGE : DELETED_MESSAGE;
  const closeEditing = (open: boolean) => !open && setEditingSite(null);

  return (
    <>
      <SitesPageFrame
        onNew={() => openCreate("site")}
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
              onToggle={() =>
                setFilters(
                  listingMatches
                    ? { ...filters, commonsMatch: false }
                    : { ...filters, yours: true, commonsMatch: true },
                )
              }
            />
          )
        }
      >
        <SiteFinder
          handleRef={finder}
          enabled={!!user}
          opening={opening}
          // The match filter lapses with the last match, and the notice that
          // would clear it goes with it.
          filters={{ ...filters, commonsMatch: listingMatches }}
          onFiltersChange={setFilters}
          tags={tags ?? undefined}
          onFiltersOpened={() => setWantsTags(true)}
          siteHref={(uuid) => `/sites/${uuid}`}
          onAddSite={setAdding}
          siteMenu={(site) => (
            <ItemActionsMenu
              label={`Actions for ${site.name}`}
              variant="ghost"
              className="h-8 w-8"
            >
              <DropdownMenuItem onClick={() => void edit(site.uuid)}>
                <Edit className="h-4 w-4 mr-2" />
                {isCommonsSite(site) ? "Edit notes and tags" : "Edit"}
              </DropdownMenuItem>
              <DeleteMenuItem
                onSelect={() => {
                  setDeleting(site);
                  requestDelete(site.uuid);
                }}
                disabled={deletingId === site.uuid}
                label={
                  isCommonsSite(site) ? "Remove from your sites" : undefined
                }
              />
            </ItemActionsMenu>
          )}
        />
      </SitesPageFrame>

      <DiveSiteDialog
        open={adding !== undefined}
        onOpenChange={(open) => !open && setAdding(undefined)}
        pin={adding}
        onSaved={saved}
      />

      <DiveSiteDialog
        open={editingSite !== null && !editingCommons}
        onOpenChange={closeEditing}
        diveSite={editingSite}
        onSaved={saved}
      />

      <SiteProposalFlow
        site={proposing}
        onClose={() => setProposing(null)}
        onSaved={(site) => {
          finder.current?.reload();
          setProposing(site);
        }}
        onProposed={() => finder.current?.reload()}
        onReplaced={() => {
          setDeletions((count) => count + 1);
          finder.current?.reload();
        }}
      />

      <CommonsSiteDialog
        open={editingCommons}
        onOpenChange={closeEditing}
        site={editingSite}
        onSaved={() => finder.current?.reload()}
      />

      <DeleteWithReassignDialog
        kind={removingCommons ? "saved-commons-site" : "dive-site"}
        targetId={pendingId}
        isDeleting={deletingId === pendingId}
        onCancel={cancelDelete}
        onConfirm={(moveDivesTo, name) =>
          confirmDelete(
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
