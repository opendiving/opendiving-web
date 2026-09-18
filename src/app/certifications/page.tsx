"use client";

import { useCallback, useState } from "react";
import { Edit, Loader2, Trash2 } from "lucide-react";
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
import { CertificationsPageFrame } from "@/components/certifications/certifications-page-frame";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageSpinner } from "@/components/ui/page-spinner";
import { CertificationDialog } from "@/components/certifications/certification-dialog";
import { CertificationViewDialog } from "@/components/certifications/certification-view-dialog";
import { CertificationCardImage } from "@/components/certifications/certification-card-image";

export default function CertificationsPage() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();

  // `null` = the dialog is closed; a certification = editing it; `undefined` = creating.
  const [editing, setEditing] = useState<Certification | null | undefined>(
    null,
  );
  const [viewing, setViewing] = useState<Certification | null>(null);

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
    <>
      <CertificationsPageFrame
        isLoading={isLoading}
        totalCount={totalCount}
        itemsPerPage={itemsPerPage}
        isLoadingMore={isLoadingMore}
        loadFailed={loadFailed}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onNew={() => setEditing(undefined)}
        rows={certifications.map((certification) => {
          const expiry = certificationExpiryStatus(certification.expires_on);
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
                    <Badge variant={certificationExpiryBadgeVariant(expiry)}>
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
      />

      {user && (
        <CertificationDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          certification={editing}
          // The card images ride on that dialog's own save, so the row it hands
          // back already carries whatever landed.
          onSaved={applySaved}
        />
      )}

      <CertificationViewDialog
        certification={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <ConfirmDialog
        open={pendingId !== null}
        onOpenChange={(open) => !open && cancelDelete()}
        title="Delete certification"
        description={confirmMessage}
        confirmText="Delete"
        isLoading={deletingId === pendingId}
        onConfirm={confirmDelete}
      />
    </>
  );
}
