"use client";

import { useCallback, useRef, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { divesAPI, Dive } from "@/lib/api/dives";
import { DELETE_DIVE_CONFIRMATION } from "@/lib/dive-recordings";
import { DiveTitle } from "@/components/dives/dive-title";
import { DiveNumberingCard } from "@/components/dives/dive-numbering-card";
import { DivesPageFrame } from "@/components/dives/dives-page-frame";
import {
  formatDiveDateTime,
  formatDurationHoursMinutes,
} from "@/lib/date-time";

import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Eye, Edit, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import { PageSpinner } from "@/components/ui/page-spinner";
import { useUnits } from "@/hooks/useUnits";
import { formatDepth } from "@/lib/units";

export default function DivesPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
  const units = useUnits();
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

  const fetchDives = useCallback(
    (page: number, perPage: number) => divesAPI.getDives(page, perPage),
    [],
  );

  const {
    items: dives,
    isLoading: isLoadingDives,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    reload,
    removeItem,
  } = useInfiniteResource<Dive>(fetchDives, {
    enabled: !!user,
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
    // The row goes locally rather than by re-reading: a diver who has scrolled
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
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        headingRef={headingRef}
        numbering={
          <DiveNumberingCard
            enabled={!!user}
            reloadToken={numberingToken}
            onRenumbered={reload}
            onVanished={focusHeading}
          />
        }
        rows={dives.map((dive) => (
          <TableRow key={dive.uuid}>
            <TableCell className="font-medium">
              <Link href={`/dives/${dive.uuid}`} className="hover:underline">
                <DiveTitle
                  diveNumber={dive.dive_number}
                  sites={dive.dive_sites}
                />
              </Link>
            </TableCell>
            <TableCell>{formatDiveDateTime(dive.start_time)}</TableCell>
            {/* The primary site's location - the site the first column names. */}
            <TableCell className="text-muted-foreground">
              {dive.dive_sites[0]?.location?.name ?? "-"}
            </TableCell>
            <TableCell>{formatDurationHoursMinutes(dive.duration)}</TableCell>
            <TableCell>
              {dive.max_depth ? formatDepth(dive.max_depth, units) : "-"}
            </TableCell>
            <TableCell className="text-right">
              {/* Every row's three controls are icon-only, so each needs a
                          name - and the name has to say *which* dive, or a screen
                          reader's controls list is thirty entries reading
                          "View, Edit, Delete" ten times over. Same reasoning as the
                          export card's Download buttons; see DECISIONS.md. */}
              <div className="flex justify-end gap-2">
                <IconTooltip label={`View dive #${dive.dive_number}`}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dives/${dive.uuid}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Edit dive #${dive.dive_number}`}>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/dives/${dive.uuid}/edit?from=/dives`}>
                      <Edit className="h-4 w-4" />
                    </Link>
                  </Button>
                </IconTooltip>
                <IconTooltip label={`Delete dive #${dive.dive_number}`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => requestDeleteDive(dive.uuid)}
                    disabled={deletingId === dive.uuid}
                  >
                    {deletingId === dive.uuid ? (
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
