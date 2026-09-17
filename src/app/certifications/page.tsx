"use client";

import { useCallback, useState } from "react";
import { Edit, Images, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useInfiniteResource } from "@/hooks/useInfiniteResource";
import { useDeleteResource } from "@/hooks/useDeleteResource";
import {
  certificationsAPI,
  certificationAgencyLabel,
  certificationFile,
  certificationLabel,
  Certification,
} from "@/lib/api/certifications";
import {
  certificationExpiryBadgeVariant,
  certificationExpiryLabel,
  certificationExpiryStatus,
} from "@/lib/certification";
import { formatDateOnly } from "@/lib/date-time";
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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadMoreTrigger } from "@/components/ui/load-more-trigger";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";
import { CertificationCardFiles } from "@/components/certifications/certification-card-files";
import { CertificationCardImage } from "@/components/certifications/certification-card-image";

export default function CertificationsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

  // `null` = the dialog is closed; a certification = editing it; `undefined` = creating.
  const [editing, setEditing] = useState<Certification | null | undefined>(
    null,
  );
  const [viewing, setViewing] = useState<Certification | null>(null);
  // The certification whose card images are being managed, if any.
  const [managingFiles, setManagingFiles] = useState<Certification | null>(
    null,
  );

  const fetchCertifications = useCallback(
    (page: number, perPage: number) =>
      certificationsAPI.getCertifications(page, perPage),
    [],
  );

  const {
    items: certifications,
    isLoading,
    isLoadingMore,
    totalCount,
    itemsPerPage,
    hasMore,
    loadFailed,
    loadMore,
    removeItem,
    applySaved,
  } = useInfiniteResource<Certification>(fetchCertifications, {
    keyOf: (certification) => certification.uuid,
    enabled: !!user,
    errorMessage: "Failed to load certifications. Please try again.",
  });

  // After a card image changes, the list's embedded file metadata is stale. Refetch
  // and re-point the open dialogs at the refreshed row, so the panel the diver is
  // looking at updates rather than showing what it loaded with.
  const refreshAfterFileChange = useCallback(async () => {
    if (!managingFiles) return;
    const updated = await certificationsAPI.getCertification(
      managingFiles.uuid,
    );
    setManagingFiles(updated);
    applySaved(updated);
  }, [managingFiles, applySaved]);

  const {
    deletingId,
    pendingId,
    confirmMessage,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useDeleteResource(certificationsAPI.deleteCertification, {
    confirmMessage:
      "Are you sure you want to delete this certification? The card images stored with it are permanently deleted too.",
    successMessage: "Certification deleted successfully.",
    errorMessage: "Failed to delete certification. Please try again.",
    // The row goes locally rather than by re-reading the pages around it: a
    // diver who has scrolled several pages in should not have the list
    // collapse back to the first one under them.
    onDeleted: removeItem,
  });

  if (isAuthLoading || !isAuthenticated) {
    return <PageSpinner />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Certifications</h1>
          <p className="text-muted-foreground mt-2">
            Keep photos of your c-cards here, so they&apos;re on hand at the
            dive shop without digging out the plastic
          </p>
        </div>
        <Button onClick={() => setEditing(undefined)}>
          <Plus className="h-4 w-4 mr-2" />
          New Certification
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle
            as="h2"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span>Your Certifications</span>
            <CountBadge
              count={totalCount}
              isLoading={isLoading}
              label="certification"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && certifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                No certifications yet. Add your c-cards so you always have them
                on hand at the dive shop.
              </div>
              <Button onClick={() => setEditing(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Certification
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Certification</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Certified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certifications.length === 0 && (
                  <TableRowsSkeleton columns={6} rows={itemsPerPage} />
                )}
                {certifications.map((certification) => {
                  const expiry = certificationExpiryStatus(
                    certification.expires_on,
                  );
                  const label = certificationLabel(certification);
                  return (
                    <TableRow key={certification.uuid}>
                      <TableCell>
                        {/* No extra request for cards with no image - the API
                            embeds each row's file metadata. */}
                        <CertificationCardImage
                          certificationUuid={certification.uuid}
                          side="front"
                          file={certificationFile(certification, "front")}
                          compact
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="hover:underline text-left"
                            onClick={() => setViewing(certification)}
                          >
                            {certification.name}
                          </button>
                          {expiry && (
                            <Badge
                              variant={certificationExpiryBadgeVariant(expiry)}
                            >
                              {certificationExpiryLabel(expiry)}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {certificationAgencyLabel(
                          certification.agency,
                          certification.agency_other,
                        )}
                      </TableCell>
                      <TableCell>
                        {certification.certification_number || (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {certification.certified_on ? (
                          formatDateOnly(certification.certified_on)
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* Named per row, not per action: ten identical "Edit"s
                            tell a screen reader's controls list nothing about
                            which card. The agency goes in the name because two
                            cards may share a level - see DECISIONS.md, "Ten rows
                            of 'Edit' name nothing". */}
                        <div className="flex justify-end gap-2">
                          <IconTooltip label={`Card images for ${label}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setManagingFiles(certification)}
                            >
                              <Images className="h-4 w-4" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label={`Edit ${label}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(certification)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </IconTooltip>
                          <IconTooltip label={`Delete ${label}`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => requestDelete(certification.uuid)}
                              disabled={deletingId === certification.uuid}
                            >
                              {deletingId === certification.uuid ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </IconTooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <LoadMoreTrigger
            hasMore={hasMore}
            isLoading={isLoadingMore}
            hasFailed={loadFailed}
            loadedCount={certifications.length}
            totalCount={totalCount}
            itemsPerPage={itemsPerPage}
            itemLabel="certifications"
            onLoadMore={loadMore}
          />
        </CardContent>
      </Card>

      {user && (
        <CertificationDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          certification={editing}
          onSaved={(saved) => {
            applySaved(saved);
            // A brand-new certification has no card images yet, and adding them is
            // the whole point - so go straight on to the upload step rather than
            // making the diver find the button.
            if (editing === undefined) setManagingFiles(saved);
          }}
        />
      )}

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      {managingFiles && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setManagingFiles(null);
          }}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Card images — {managingFiles.name}</DialogTitle>
            </DialogHeader>
            <CertificationCardFiles
              certification={managingFiles}
              onChanged={refreshAfterFileChange}
            />
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete certification"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
