"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { SitesPageFrame } from "@/components/sites/sites-page-frame";
import { TableCell, TableRow } from "@/components/ui/table";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";

// The plain-delete toast, and the first half of the one a move gets - "moved to
// Blue Hole" is an addition to what happened, not a replacement for it.
const DELETED_MESSAGE = "Dive site deleted successfully.";

export default function SitesPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  // `null` = the dialog is closed; a site = editing it; `undefined` = creating.
  const [editingSite, setEditingSite] = useState<DiveSite | null | undefined>(
    null,
  );

  const fetchDiveSites = useCallback(
    (page: number, perPage: number) => {
      if (!user) return Promise.reject(new Error("Not authenticated"));
      return diveSitesAPI.getDiveSites(user.uuid, page, perPage);
    },
    [user],
  );

  const {
    items: diveSites,
    isLoading: isLoadingDiveSites,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<DiveSite>(fetchDiveSites, {
    keyOf: (site) => site.uuid,
    enabled: !!user,
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
    // The row goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them.
    onDeleted: removeItem,
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
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onNew={() => setEditingSite(undefined)}
        rows={diveSites.map((diveSite) => (
          <TableRow key={diveSite.uuid}>
            <TableCell className="font-medium">
              <Link
                href={`/sites/${diveSite.uuid}`}
                className="hover:underline"
              >
                {diveSite.name}
              </Link>
            </TableCell>
            <TableCell>{diveSite.location || "-"}</TableCell>
            <TableCell className="text-right">
              {/* Named per row, not per action: ten identical "Edit"s tell a
                          screen reader's controls list nothing about which site.
                          See DECISIONS.md on the export card's Downloads. */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`View ${diveSite.name}`}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/sites/${diveSite.uuid}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Edit ${diveSite.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSite(diveSite)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete ${diveSite.name}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => requestDeleteDiveSite(diveSite.uuid)}
                    disabled={deletingId === diveSite.uuid}
                  >
                    {deletingId === diveSite.uuid ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </IconTooltip>
              </div>
            </TableCell>
          </TableRow>
        ))}
      />

      <DiveSiteDialog
        userId={user?.uuid ?? ""}
        open={editingSite !== null}
        onOpenChange={(open) => !open && setEditingSite(null)}
        diveSite={editingSite}
        onSaved={applySaved}
      />

      <DeleteWithReassignDialog
        kind="dive-site"
        userId={user?.uuid ?? ""}
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
