"use client";

import { useCallback, useState } from "react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { usePaginatedResource } from "@/hooks/usePaginatedResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import { diveSitesAPI, DiveSite } from "@/lib/api/dive-sites";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { CountBadge } from "@/components/ui/count-badge";
import { TableRowsSkeleton } from "@/components/ui/table-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { DeleteWithReassignDialog } from "@/components/dives/delete-with-reassign-dialog";
import { DiveSiteDialog } from "@/components/sites/dive-site-dialog";
import { Plus, Eye, Edit, Trash2, Loader2 } from "lucide-react";
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
    totalCount,
    currentPage,
    itemsPerPage,
    hasMore,
    fetchPage: fetchDiveSitesPage,
    refetch,
  } = usePaginatedResource<DiveSite>(fetchDiveSites, {
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
    onDeleted: refetch,
  });

  if (isAuthLoading) {
    return <PageSpinner variant="inset" />;
  }

  if (!isAuthenticated) {
    return null; // Will redirect to signin
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dive Sites</h1>
          <p className="text-muted-foreground mt-2">
            Keep track of the dive sites you&apos;ve visited
          </p>
        </div>
        <Button onClick={() => setEditingSite(undefined)}>
          <Plus className="h-4 w-4 mr-2" />
          New Dive Site
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="flex items-center justify-between">
            <span>Dive Site List</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoadingDiveSites}
              label="total dive site"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoadingDiveSites && diveSites.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No dive sites yet. Add your first dive site to start tracking
                your favorite spots!
              </div>
              <Button onClick={() => setEditingSite(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Dive Site
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diveSites.length === 0 && (
                  <TableRowsSkeleton columns={3} rows={itemsPerPage} />
                )}
                {diveSites.map((diveSite) => (
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
              </TableBody>
            </Table>
          )}

          <PaginationFooter
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalCount={totalCount}
            hasMore={hasMore}
            isLoading={isLoadingDiveSites}
            itemLabel="dive sites"
            onPageChange={fetchDiveSitesPage}
          />
        </CardContent>
      </Card>

      <DiveSiteDialog
        userId={user?.uuid ?? ""}
        open={editingSite !== null}
        onOpenChange={(open) => !open && setEditingSite(null)}
        diveSite={editingSite}
        onSaved={refetch}
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
    </div>
  );
}
